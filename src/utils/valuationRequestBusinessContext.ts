import { readPreSelectedValuationMethods } from '../constants/sessionUiKeys'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { parseFlexibleNumber } from './isFiniteNumeric'

interface BuildValuationBusinessContextOptions {
  formData: ValuationFormData
  latestRevenue: number | undefined
  countryCode: string
  rawForecastData: NonNullable<ValuationFormData['historical_years_data']>
  projectionYears: number
  inputSource?: string
}

type ForwardAssumptionSourceKind =
  | 'advisor_entered'
  | 'integration_observed'
  | 'history_inferred'
  | 'sector_default'
  | 'system_fallback'

type ForwardAssumptionUseKind = 'current_report_input' | 'forward_driver_input' | 'scenario_delta'

type ForwardAssumptionConfidence = 'low' | 'medium' | 'high'

interface ForwardAssumptionEvidence {
  field_key: string
  driver_group?: string
  source_kind: ForwardAssumptionSourceKind
  use_kind: ForwardAssumptionUseKind
  confidence: ForwardAssumptionConfidence
  source: string
  value?: number | string
  responsible_surface: string
  transformation?: string
  override_reason?: string
  fallback?: boolean
  warnings?: string[]
}

interface ForwardDriverEvidenceRow {
  fiscal_year: number
  use_kind: 'forward_driver_input'
  source_kind: ForwardAssumptionSourceKind
  drivers: Record<string, number>
  assumptions: ForwardAssumptionEvidence[]
  warnings: string[]
}

interface ForwardDriverEvidenceEnvelope {
  schema_version: 'forward_driver_evidence_v1'
  dcf_assumptions: ForwardAssumptionEvidence[]
  forecast_driver_rows: ForwardDriverEvidenceRow[]
  warnings: string[]
}

export function buildValuationBusinessContext({
  formData,
  latestRevenue,
  countryCode,
  rawForecastData,
  projectionYears,
  inputSource,
}: BuildValuationBusinessContextOptions): {
  businessContext: ValuationRequest['business_context']
  userConfiguredDcf: boolean
} {
  const fd = formData as ValuationFormData & Record<string, unknown>
  const adaptiveFields: Record<string, unknown> = {}

  copyFiniteAdaptiveFields(adaptiveFields, fd, [
    'dcf_revenue_growth_pct',
    'dcf_ebitda_margin_pct',
    'dcf_capex_pct',
    'dcf_da_pct',
    'dcf_nwc_pct',
    'dcf_tax_rate_pct',
    'dcf_risk_free_rate_pct',
    'dcf_equity_risk_premium_pct',
    'dcf_beta',
    'dcf_cost_of_debt_pct',
    'dcf_debt_equity_pct',
    'dcf_tax_shield_pct',
  ])
  copyDcfTerminalAssumptionFields(adaptiveFields, fd)
  if (
    fd.dcf_discounting_convention === 'mid_year' ||
    fd.dcf_discounting_convention === 'year_end'
  ) {
    adaptiveFields.dcf_discounting_convention = fd.dcf_discounting_convention
  }
  const dcfTaxShieldProjections = normalizeDcfTaxShieldProjections(
    fd.dcf_tax_shield_projections,
    rawForecastData,
    projectionYears
  )
  if (dcfTaxShieldProjections.length > 0) {
    adaptiveFields.dcf_tax_shield_projections = dcfTaxShieldProjections
  }
  const resolvedDcfInputSource = resolveDcfInputSource(fd, formData, inputSource)
  if (fd.dcf_input_mode === 'fcff_only') {
    adaptiveFields.dcf_input_mode = 'fcff_only'
  }
  if (dcfTaxShieldProjections.length > 0) {
    adaptiveFields.apv_input_source = resolvedDcfInputSource
    adaptiveFields.dcf_tax_shield_source = resolvedDcfInputSource
    adaptiveFields.dcf_bridge_policy = 'apv_tax_shield_inside_dcf'
    adaptiveFields.dcf_double_counting_guard = true
    if (fd.dcf_input_mode === 'fcff_only' && fd.dcf_discounting_convention === 'year_end') {
      adaptiveFields.dcf_benchmark_case = 'henk_customer_dcf_template'
    }
  }

  const userConfiguredDcf = isExplicitUserDcfIntent(fd, formData, dcfTaxShieldProjections.length)
  const forwardDriverEvidence = buildForwardDriverEvidence({
    fd,
    rawForecastData,
    projectionYears,
    resolvedDcfInputSource,
    userConfiguredDcf,
    hasDcfTaxShieldProjections: dcfTaxShieldProjections.length > 0,
  })
  if (forwardDriverEvidence) {
    adaptiveFields.forward_driver_evidence = forwardDriverEvidence
  }

  copyFiniteAdaptiveFields(adaptiveFields, fd, [
    'nav_real_estate_adjustment',
    'nav_inventory_adjustment',
    'nav_hidden_reserves',
    'nav_goodwill_writeoff',
    'nav_receivables_adjustment',
    'nav_other_revaluations',
    'nav_off_balance_items',
    'nav_real_estate_book_value',
    'nav_real_estate_appraisal_value',
  ])
  const navTaxLatencyPct = parseFlexibleNumber(fd.nav_tax_latency_pct)
  if (navTaxLatencyPct !== undefined) {
    adaptiveFields.nav_tax_latency_pct = Math.min(Math.max(navTaxLatencyPct, 0), 100)
  } else if (countryCode === 'BE') {
    adaptiveFields.nav_tax_latency_pct = 25
  }
  if (fd.nav_per_asset_tax_rates && typeof fd.nav_per_asset_tax_rates === 'object') {
    const cleaned: Record<string, number> = {}
    for (const [k, v] of Object.entries(fd.nav_per_asset_tax_rates)) {
      const numericValue = parseFlexibleNumber(v)
      if (numericValue !== undefined) {
        cleaned[k] = Math.min(Math.max(numericValue, 0), 100)
      }
    }
    if (Object.keys(cleaned).length > 0) adaptiveFields.nav_per_asset_tax_rates = cleaned
  }
  if (fd.nav_equipment_revaluation && typeof fd.nav_equipment_revaluation === 'object') {
    const cleanedEquipmentRevaluation: Record<string, number> = {}
    for (const [key, value] of Object.entries(fd.nav_equipment_revaluation)) {
      const numericValue = parseFlexibleNumber(value)
      if (numericValue !== undefined) cleanedEquipmentRevaluation[key] = numericValue
    }
    if (Object.keys(cleanedEquipmentRevaluation).length > 0) {
      adaptiveFields.nav_equipment_revaluation = cleanedEquipmentRevaluation
    }
  }

  copyFiniteAdaptiveFields(adaptiveFields, fd, ['taxable_profit', 'director_remuneration'])
  if (fd.is_financial_company != null)
    adaptiveFields.is_financial_company = Boolean(fd.is_financial_company)
  if (fd.is_holding_more_than_50pct_shares != null)
    adaptiveFields.is_holding_more_than_50pct_shares = Boolean(fd.is_holding_more_than_50pct_shares)
  if (fd.sme_rate_override != null) adaptiveFields.sme_rate_override = Boolean(fd.sme_rate_override)
  if (fd.deal_type) adaptiveFields.deal_type = fd.deal_type
  copyFiniteAdaptiveFields(adaptiveFields, fd, ['deal_goodwill_amount', 'deal_seller_share_basis'])
  if (fd.deal_seller_is_individual != null)
    adaptiveFields.deal_seller_is_individual = Boolean(fd.deal_seller_is_individual)
  const dealBuyerDiscountRatePct = parseFlexibleNumber(fd.deal_buyer_discount_rate_pct)
  if (dealBuyerDiscountRatePct !== undefined)
    adaptiveFields.deal_buyer_discount_rate_pct = dealBuyerDiscountRatePct
  const dealRegistrationDutyPct = parseFlexibleNumber(fd.deal_registration_duty_pct)
  if (dealRegistrationDutyPct !== undefined)
    adaptiveFields.deal_registration_duty_pct = dealRegistrationDutyPct

  copyFiniteAdaptiveFields(adaptiveFields, fd, [
    'saas_arr',
    'saas_mrr',
    'saas_arr_growth_pct',
    'saas_churn_pct',
    'saas_customer_churn_pct',
    'saas_nrr_pct',
    'saas_gross_margin_pct',
    'saas_cac',
    'saas_customer_concentration_pct',
    'saas_expansion_revenue_pct',
    'saas_sm_spend',
  ])

  const revRecurringAmount = parseFlexibleNumber(fd.rev_recurring_amount)
  const revRecurringPct = parseFlexibleNumber(fd.rev_recurring_pct)
  const revTopClientAmount = parseFlexibleNumber(fd.rev_top_client_amount)
  const revTopClientConcentrationPct = parseFlexibleNumber(fd.rev_top_client_concentration_pct)
  const revContractBacklog = parseFlexibleNumber(fd.rev_contract_backlog)
  const revGrossChurnPct = parseFlexibleNumber(fd.rev_gross_churn_pct)
  const revCapitalizedRdAmount = parseFlexibleNumber(fd.rev_capitalized_rd_amount)

  if (revRecurringAmount !== undefined) {
    adaptiveFields.rev_recurring_amount = revRecurringAmount
  }
  if (revRecurringAmount !== undefined && latestRevenue && latestRevenue > 0) {
    adaptiveFields.rev_recurring_pct = Math.min(
      Math.max((revRecurringAmount / latestRevenue) * 100, 0),
      100
    )
  } else if (revRecurringPct !== undefined) {
    adaptiveFields.rev_recurring_pct = revRecurringPct
  }
  if (revTopClientAmount !== undefined) {
    adaptiveFields.rev_top_client_amount = revTopClientAmount
  }
  if (revTopClientAmount !== undefined && latestRevenue && latestRevenue > 0) {
    adaptiveFields.rev_top_client_concentration_pct = Math.min(
      Math.max((revTopClientAmount / latestRevenue) * 100, 0),
      100
    )
  } else if (revTopClientConcentrationPct !== undefined) {
    adaptiveFields.rev_top_client_concentration_pct = revTopClientConcentrationPct
  }
  if (revContractBacklog !== undefined) adaptiveFields.rev_contract_backlog = revContractBacklog
  if (revGrossChurnPct !== undefined) adaptiveFields.rev_gross_churn_pct = revGrossChurnPct
  if (revCapitalizedRdAmount !== undefined)
    adaptiveFields.rev_capitalized_rd_amount = revCapitalizedRdAmount

  const existingBusinessContext =
    formData.business_context && typeof formData.business_context === 'object'
      ? formData.business_context
      : undefined
  const businessTypeId = normalizeBusinessTypeId(formData.business_type_id)

  const businessContext = formData.business_type_id
    ? {
        ...existingBusinessContext,
        ...(businessTypeId ? { business_type_id: businessTypeId } : {}),
        dcfPreference: fd._internal_dcf_preference,
        multiplesPreference: fd._internal_multiples_preference,
        ownerDependencyImpact: fd._internal_owner_dependency_impact,
        keyMetrics: fd._internal_key_metrics,
        typicalEmployeeRange: fd._internal_typical_employee_range,
        typicalRevenueRange: fd._internal_typical_revenue_range,
        ...adaptiveFields,
      }
    : Object.keys(adaptiveFields).length > 0
      ? {
          ...existingBusinessContext,
          ...adaptiveFields,
        }
      : existingBusinessContext
        ? existingBusinessContext
        : undefined

  return { businessContext, userConfiguredDcf }
}

function buildForwardDriverEvidence({
  fd,
  rawForecastData,
  projectionYears,
  resolvedDcfInputSource,
  userConfiguredDcf,
  hasDcfTaxShieldProjections,
}: {
  fd: ValuationFormData & Record<string, unknown>
  rawForecastData: NonNullable<ValuationFormData['historical_years_data']>
  projectionYears: number
  resolvedDcfInputSource: string
  userConfiguredDcf: boolean
  hasDcfTaxShieldProjections: boolean
}): ForwardDriverEvidenceEnvelope | undefined {
  const dcfSourceKind = resolveAssumptionSourceKind(resolvedDcfInputSource, userConfiguredDcf)
  const dcfAssumptions: ForwardAssumptionEvidence[] = []

  pushNumericDcfAssumption(dcfAssumptions, fd, {
    formField: 'dcf_wacc_pct',
    driverGroup: 'wacc',
    sourceKind: dcfSourceKind,
    source: resolvedDcfInputSource,
    useKind: 'current_report_input',
  })
  pushTerminalAssumption(dcfAssumptions, fd, dcfSourceKind, resolvedDcfInputSource)
  for (const [formField, fieldKey] of [
    ['dcf_revenue_growth_pct', 'forecast_revenue_or_fcff'],
    ['dcf_ebitda_margin_pct', 'forecast_margin_or_fcff'],
    ['dcf_capex_pct', 'fcff_bridge'],
    ['dcf_da_pct', 'fcff_bridge'],
    ['dcf_nwc_pct', 'working_capital_forecast'],
    ['dcf_tax_rate_pct', 'tax_forecast'],
    ['dcf_risk_free_rate_pct', 'wacc'],
    ['dcf_equity_risk_premium_pct', 'wacc'],
    ['dcf_beta', 'wacc'],
    ['dcf_cost_of_debt_pct', 'wacc'],
    ['dcf_debt_equity_pct', 'wacc'],
    ['dcf_tax_shield_pct', 'tax_forecast'],
  ] as const) {
    pushNumericDcfAssumption(dcfAssumptions, fd, {
      formField,
      driverGroup: fieldKey,
      sourceKind: dcfSourceKind,
      source: resolvedDcfInputSource,
      useKind: 'forward_driver_input',
    })
  }
  pushLiteralDcfAssumption(dcfAssumptions, fd, {
    formField: 'dcf_input_mode',
    driverGroup: 'dcf_input_mode',
    sourceKind: dcfSourceKind,
    source: resolvedDcfInputSource,
    useKind: 'forward_driver_input',
  })
  pushLiteralDcfAssumption(dcfAssumptions, fd, {
    formField: 'dcf_discounting_convention',
    driverGroup: 'dcf_discounting_convention',
    sourceKind: dcfSourceKind,
    source: resolvedDcfInputSource,
    useKind: 'current_report_input',
  })
  if (hasDcfTaxShieldProjections) {
    dcfAssumptions.push(
      makeAssumptionEvidence({
        fieldKey: 'dcf_tax_shield_projections',
        driverGroup: 'tax_forecast',
        sourceKind: dcfSourceKind,
        source: resolvedDcfInputSource,
        useKind: 'forward_driver_input',
        transformation: 'normalized_to_forecast_horizon',
      })
    )
  }

  const forecastRows = buildForecastDriverRows({
    rawForecastData,
    projectionYears,
    source: resolvedDcfInputSource,
  })

  if (dcfAssumptions.length === 0 && forecastRows.length === 0) return undefined

  return {
    schema_version: 'forward_driver_evidence_v1',
    dcf_assumptions: dcfAssumptions,
    forecast_driver_rows: forecastRows,
    warnings: ['forecast_driver_rows_are_not_forward_valuation_points'],
  }
}

function pushNumericDcfAssumption(
  target: ForwardAssumptionEvidence[],
  fd: Record<string, unknown>,
  {
    formField,
    driverGroup,
    sourceKind,
    source,
    useKind,
  }: {
    formField: string
    driverGroup: string
    sourceKind: ForwardAssumptionSourceKind
    source: string
    useKind: ForwardAssumptionUseKind
  }
): void {
  const value = parseFlexibleNumber(fd[formField])
  if (value === undefined) return
  target.push(
    makeAssumptionEvidence({
      fieldKey: formField,
      driverGroup,
      sourceKind,
      source,
      useKind,
      value,
      transformation: formField === driverGroup ? undefined : `mapped_to:${driverGroup}`,
    })
  )
}

function pushLiteralDcfAssumption(
  target: ForwardAssumptionEvidence[],
  fd: Record<string, unknown>,
  {
    formField,
    driverGroup,
    sourceKind,
    source,
    useKind,
  }: {
    formField: string
    driverGroup: string
    sourceKind: ForwardAssumptionSourceKind
    source: string
    useKind: ForwardAssumptionUseKind
  }
): void {
  const value = asNonEmptyString(fd[formField])
  if (!value) return
  target.push(
    makeAssumptionEvidence({
      fieldKey: formField,
      driverGroup,
      sourceKind,
      source,
      useKind,
      value,
    })
  )
}

function pushTerminalAssumption(
  target: ForwardAssumptionEvidence[],
  fd: Record<string, unknown>,
  sourceKind: ForwardAssumptionSourceKind,
  source: string
): void {
  const hasTerminalAssumption =
    isDcfTerminalValueMethod(fd.dcf_terminal_value_method) ||
    fd.dcf_input_mode === 'fcff_only' ||
    parseFlexibleNumber(fd.dcf_terminal_growth_pct) !== undefined ||
    parseFlexibleNumber(fd.dcf_exit_multiple) !== undefined
  if (!hasTerminalAssumption) return

  target.push(
    makeAssumptionEvidence({
      fieldKey: 'terminal_value_assumption',
      driverGroup: 'terminal_value_assumption',
      sourceKind,
      source,
      useKind: 'current_report_input',
    })
  )
}

function buildForecastDriverRows({
  rawForecastData,
  projectionYears,
  source,
}: {
  rawForecastData: NonNullable<ValuationFormData['historical_years_data']>
  projectionYears: number
  source: string
}): ForwardDriverEvidenceRow[] {
  const sourceKind: ForwardAssumptionSourceKind = source.startsWith('integration:')
    ? 'integration_observed'
    : 'advisor_entered'
  const maxRows = Number.isFinite(projectionYears) && projectionYears > 0 ? projectionYears : 5
  return rawForecastData
    .filter((row) => Number.isFinite(row.year) && row.year >= 2000 && row.year <= 2100)
    .slice(0, maxRows)
    .map((row): ForwardDriverEvidenceRow => {
      const drivers: Record<string, number> = {}
      const assumptions: ForwardAssumptionEvidence[] = []
      addForecastDriver(drivers, assumptions, row.revenue, {
        driverKey: 'forecast_revenue',
        source,
        sourceKind,
      })
      addForecastDriver(drivers, assumptions, row.ebitda, {
        driverKey: 'forecast_ebitda',
        source,
        sourceKind,
      })
      addForecastDriver(drivers, assumptions, row.free_cash_flow, {
        driverKey: 'fcff_bridge',
        source,
        sourceKind,
      })

      return {
        fiscal_year: row.year,
        use_kind: 'forward_driver_input',
        source_kind: sourceKind,
        drivers,
        assumptions,
        warnings: ['forecast_driver_row_not_forward_valuation_point'],
      }
    })
    .filter((row) => Object.keys(row.drivers).length > 0)
}

function addForecastDriver(
  drivers: Record<string, number>,
  assumptions: ForwardAssumptionEvidence[],
  value: unknown,
  {
    driverKey,
    source,
    sourceKind,
  }: {
    driverKey: string
    source: string
    sourceKind: ForwardAssumptionSourceKind
  }
): void {
  const numericValue = parseFlexibleNumber(value)
  if (numericValue === undefined) return
  drivers[driverKey] = numericValue
  assumptions.push(
    makeAssumptionEvidence({
      fieldKey: driverKey,
      driverGroup: driverKey,
      sourceKind,
      source,
      useKind: 'forward_driver_input',
      value: numericValue,
    })
  )
}

function makeAssumptionEvidence({
  fieldKey,
  driverGroup,
  sourceKind,
  source,
  useKind,
  value,
  transformation,
}: {
  fieldKey: string
  driverGroup?: string
  sourceKind: ForwardAssumptionSourceKind
  source: string
  useKind: ForwardAssumptionUseKind
  value?: number | string
  transformation?: string
}): ForwardAssumptionEvidence {
  const fallback = sourceKind === 'system_fallback'
  return {
    field_key: fieldKey,
    ...(driverGroup && { driver_group: driverGroup }),
    source_kind: sourceKind,
    use_kind: useKind,
    confidence: confidenceForSourceKind(sourceKind),
    source,
    ...(value !== undefined && { value }),
    responsible_surface: responsibleSurfaceForSourceKind(sourceKind),
    ...(transformation && { transformation }),
    ...(fallback && {
      fallback: true,
      warnings: ['system_fallback_not_forward_defensible'],
    }),
  }
}

function resolveAssumptionSourceKind(
  source: string,
  userConfiguredDcf: boolean
): ForwardAssumptionSourceKind {
  if (source.startsWith('integration:')) return 'integration_observed'
  if (source === 'history' || source === 'historical' || source === 'history_inferred') {
    return 'history_inferred'
  }
  if (source === 'sector_default' || source === 'sector') return 'sector_default'
  if (source === 'manual' && userConfiguredDcf) return 'advisor_entered'
  if (source === 'ai_assistant') return 'advisor_entered'
  return 'system_fallback'
}

function confidenceForSourceKind(
  sourceKind: ForwardAssumptionSourceKind
): ForwardAssumptionConfidence {
  switch (sourceKind) {
    case 'advisor_entered':
    case 'integration_observed':
      return 'high'
    case 'history_inferred':
    case 'sector_default':
      return 'medium'
    default:
      return 'low'
  }
}

function responsibleSurfaceForSourceKind(sourceKind: ForwardAssumptionSourceKind): string {
  switch (sourceKind) {
    case 'advisor_entered':
      return 'venus_advisor_input'
    case 'integration_observed':
      return 'integration_observed_financials'
    case 'history_inferred':
      return 'venus_history_inference'
    case 'sector_default':
      return 'sector_default_model'
    default:
      return 'venus_system_fallback'
  }
}

function copyFiniteAdaptiveFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[]
): void {
  for (const key of keys) {
    const value = parseFlexibleNumber(source[key])
    if (value !== undefined) target[key] = value
  }
}

export function normalizeDcfTaxShieldProjections(
  value: unknown,
  rawForecastData: NonNullable<ValuationFormData['historical_years_data']>,
  projectionYears?: number
): number[] {
  if (!Array.isArray(value)) return []

  const forecastYearCount = rawForecastData.filter(
    (year) => Number.isFinite(year.year) && year.year >= 2000 && year.year <= 2100
  ).length
  const explicitProjectionYears =
    typeof projectionYears === 'number' && Number.isFinite(projectionYears) && projectionYears > 0
      ? Math.floor(projectionYears)
      : undefined
  const projectionCount =
    forecastYearCount > 0 ? forecastYearCount : (explicitProjectionYears ?? value.length)
  if (projectionCount <= 0) return []

  const projections = Array.from(
    { length: projectionCount },
    (_, index) => parseFlexibleNumber(value[index]) ?? 0
  )

  return projections.some((amount) => amount !== 0) ? projections : []
}

type DcfTerminalValueMethod = 'perpetual_growth' | 'exit_multiple'

interface DcfTerminalAssumptions {
  method: DcfTerminalValueMethod
  waccPct?: number
  terminalGrowthPct?: number
  exitMultiple?: number
  hasTerminalInput: boolean
}

function isDcfTerminalValueMethod(value: unknown): value is DcfTerminalValueMethod {
  return value === 'perpetual_growth' || value === 'exit_multiple'
}

function resolveDcfTerminalValueMethod(
  source: Record<string, unknown>,
  terminalGrowthPct: number | undefined,
  exitMultiple: number | undefined
): DcfTerminalValueMethod {
  if (source.dcf_input_mode === 'fcff_only') return 'perpetual_growth'
  if (isDcfTerminalValueMethod(source.dcf_terminal_value_method)) {
    return source.dcf_terminal_value_method
  }
  if (exitMultiple !== undefined && terminalGrowthPct === undefined) return 'exit_multiple'
  return 'perpetual_growth'
}

export function resolveDcfTerminalAssumptions(
  source: Record<string, unknown>
): DcfTerminalAssumptions {
  const terminalGrowthPct = parseFlexibleNumber(source.dcf_terminal_growth_pct)
  const exitMultiple = parseFlexibleNumber(source.dcf_exit_multiple)
  const method = resolveDcfTerminalValueMethod(source, terminalGrowthPct, exitMultiple)
  const hasExplicitMethod = isDcfTerminalValueMethod(source.dcf_terminal_value_method)
  const hasTerminalInput =
    hasExplicitMethod ||
    source.dcf_input_mode === 'fcff_only' ||
    terminalGrowthPct !== undefined ||
    exitMultiple !== undefined
  const selectedMethod = typeof source.selected_method === 'string' ? source.selected_method : ''
  const hasDcfContract = hasTerminalInput || selectedMethod.toLowerCase().includes('dcf')

  const parsedWaccPct = parseFlexibleNumber(source.dcf_wacc_pct)
  if (parsedWaccPct !== undefined && parsedWaccPct <= 0) {
    if (!hasDcfContract) {
      return {
        method,
        terminalGrowthPct,
        exitMultiple,
        hasTerminalInput,
      }
    }
    throw new ValidationError(
      'DCF WACC must be greater than 0%.',
      'dcf_wacc_pct',
      source.dcf_wacc_pct,
      { dcf_wacc_pct: parsedWaccPct }
    )
  }
  const waccPct = parsedWaccPct

  if (method === 'perpetual_growth') {
    if (terminalGrowthPct !== undefined && waccPct !== undefined && terminalGrowthPct >= waccPct) {
      throw new ValidationError(
        'Terminal growth must be lower than WACC for perpetual-growth DCF.',
        'dcf_terminal_growth_pct',
        source.dcf_terminal_growth_pct,
        { dcf_wacc_pct: waccPct, dcf_terminal_growth_pct: terminalGrowthPct }
      )
    }
    return {
      method,
      waccPct,
      terminalGrowthPct,
      hasTerminalInput,
    }
  }

  if (hasExplicitMethod && exitMultiple === undefined) {
    throw new ValidationError(
      'Exit multiple is required for DCF exit-multiple terminal value.',
      'dcf_exit_multiple',
      source.dcf_exit_multiple
    )
  }
  if (exitMultiple !== undefined && exitMultiple <= 0) {
    throw new ValidationError(
      'Exit multiple must be greater than 0.0x for DCF exit-multiple terminal value.',
      'dcf_exit_multiple',
      source.dcf_exit_multiple,
      { dcf_exit_multiple: exitMultiple }
    )
  }

  return {
    method,
    waccPct,
    exitMultiple,
    hasTerminalInput,
  }
}

function copyDcfTerminalAssumptionFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  const assumptions = resolveDcfTerminalAssumptions(source)
  if (assumptions.waccPct !== undefined) target.dcf_wacc_pct = assumptions.waccPct
  if (!assumptions.hasTerminalInput) return

  target.dcf_terminal_value_method = assumptions.method
  if (assumptions.method === 'perpetual_growth') {
    if (assumptions.terminalGrowthPct !== undefined) {
      target.dcf_terminal_growth_pct = assumptions.terminalGrowthPct
    }
    return
  }

  if (assumptions.exitMultiple !== undefined) {
    target.dcf_exit_multiple = assumptions.exitMultiple
  }
}

/** True when the advisor deliberately chose DCF (not auto-seeded defaults alone). */
export function isExplicitUserDcfIntent(
  fd: Record<string, unknown>,
  formData: ValuationFormData,
  dcfTaxShieldProjectionCount = 0
): boolean {
  if (fd.dcf_input_mode === 'fcff_only') return true
  if (parseFlexibleNumber(fd.dcf_exit_multiple) !== undefined) return true
  if (fd.dcf_discounting_convention === 'year_end') return true
  if (dcfTaxShieldProjectionCount > 0) return true

  const weights = formData.user_weights
  if (weights && typeof weights === 'object' && !Array.isArray(weights)) {
    for (const [key, raw] of Object.entries(weights)) {
      const weight = parseFlexibleNumber(raw)
      if (key.toLowerCase().includes('dcf') && weight !== undefined && weight > 0) {
        return true
      }
    }
  }

  const selected = formData.selected_method ?? fd.selected_method
  if (typeof selected === 'string' && selected.toLowerCase().includes('dcf')) {
    return true
  }

  const preSelected =
    (Array.isArray(fd._pre_selected_valuation_methods)
      ? fd._pre_selected_valuation_methods
      : undefined) ?? readPreSelectedValuationMethods(formData)
  if (Array.isArray(preSelected)) {
    for (const method of preSelected) {
      if (typeof method === 'string' && method.toLowerCase().includes('dcf')) {
        return true
      }
    }
  }

  return false
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveDcfInputSource(
  fd: Record<string, unknown>,
  formData: ValuationFormData,
  inputSource?: string
): string {
  const explicit =
    asNonEmptyString(fd.apv_input_source) ||
    asNonEmptyString(fd.dcf_tax_shield_source) ||
    asNonEmptyString(fd.dcf_input_source) ||
    asNonEmptyString(fd._financial_data_source) ||
    asNonEmptyString(inputSource)
  if (explicit) return explicit

  const official =
    formData.official_financials && typeof formData.official_financials === 'object'
      ? (formData.official_financials as Record<string, unknown>)
      : undefined
  const officialSource =
    asNonEmptyString(official?.provider) ||
    asNonEmptyString(official?.source) ||
    asNonEmptyString(official?.data_source)
  if (officialSource) return `integration:${officialSource}`

  return 'manual'
}
