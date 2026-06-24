import { isRevenueMethodologyKey } from '@/utils/extractValuationResultsMap'
import type {
  HistoricalFcfReadiness,
  MultiplePipelineStage,
  ValuationMethodResult,
  ValuationResponse,
  WaterfallStep,
} from '../../types/valuation'
import { sumAdjustmentValues, toNumberOrNull } from './ValuationEditModalFormatting'

export interface DcfSensitivityMatrixData {
  wacc_values: unknown[]
  growth_values?: unknown[]
  secondary_values?: unknown[]
  secondary_axis_key?: 'terminal_growth' | 'exit_multiple' | string
  secondary_axis_format?: 'percent' | 'multiple' | string
  ev_matrix: unknown[][]
}

export interface MethodPipelineRow {
  label: string
  before: number | null
  after: number | null
  discount: number | null
}

export interface MethodBreakdownModel {
  usesRevenueMetric: boolean
  normalizedEbitda: number | null
  revenueValue: number | null
  arrValue: number | null
  netDebt: number | null
  balanceSheetAdjustments: number | null
  enterpriseValue: number | null
  equityValue: number | null
  wacc: number | null
  terminalValue: number | null
  terminalValueMethodology: string | null
  terminalExitMultiple: number | null
  dcfReadiness: HistoricalFcfReadiness | null
  operatingDcfEnterpriseValue: number | null
  operatingDcfEquityValue: number | null
  apvTaxShieldValue: number | null
  apvEnterpriseValue: number | null
  apvEquityValue: number | null
  apvDiscountRate: number | null
  apvDiscountingConvention: string | null
  apvBenchmarkStatus: string | null
  apvBenchmarkName: string
  hasApvBridge: boolean
  sensitivityMatrix: DcfSensitivityMatrixData | null
  ownerSalaryEstimate: number | null
  sdeValue: number | null
  bookEquity: number | null
  methodologyJustification: string | null
  saasRuleOf40: number | null
  saasNrr: number | null
  comparablesCount: number | null
  comparablesQuality: string | null
  fallbackPipelineRows: MethodPipelineRow[]
  effectiveAppliedMultiple: number | null
}

export interface MultipleFormulaModel {
  metric: number
  multiple: number
  enterpriseValue: number
  equity: number
  netDebt: number | null
  balanceSheetAdjustments: number | null
}

function isHistoricalFcfReadiness(value: unknown): value is HistoricalFcfReadiness {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.status === 'string' &&
    typeof candidate.historical_years_count === 'number' &&
    typeof candidate.actual_capex_years === 'number' &&
    typeof candidate.actual_tax_years === 'number' &&
    typeof candidate.actual_nwc_years === 'number'
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asSensitivityMatrix(value: unknown): DcfSensitivityMatrixData | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.wacc_values) || !Array.isArray(record.ev_matrix)) {
    return null
  }
  return record as unknown as DcfSensitivityMatrixData
}

export function normalizeComparablesQualityKey(raw: string): string {
  const key = raw.toLowerCase().trim()
  if (key === 'moderate') return 'medium'
  return key
}

export function getDcfReadinessMissingFieldKeys(
  readiness: HistoricalFcfReadiness | null
): Array<'capex' | 'taxes' | 'working_capital'> {
  if (!readiness) return []
  return [
    ...(readiness.actual_capex_years < readiness.historical_years_count ? ['capex' as const] : []),
    ...(readiness.actual_tax_years < readiness.historical_years_count ? ['taxes' as const] : []),
    ...(readiness.actual_nwc_years < Math.max(0, readiness.historical_years_count - 1)
      ? ['working_capital' as const]
      : []),
  ]
}

export function getFormulaTranslationKey(methodKey: string, hasApvBridge: boolean): string {
  if (methodKey === 'dcf') return hasApvBridge ? 'formulaDcfApv' : 'formulaDcf'
  if (methodKey === 'fiscal_4x') return 'formulaFiscal'
  if (methodKey === 'adjusted_nav') return 'formulaNav'
  if (methodKey === 'sde_multiple') return 'formulaSde'
  if (methodKey === 'arr_multiple') return 'formulaArr'
  if (isRevenueMethodologyKey(methodKey)) return 'formulaRevenue'
  return 'formulaMultiple'
}

function isMultipleFormulaMethod(methodKey: string): boolean {
  return (
    methodKey === 'sde_multiple' ||
    methodKey === 'arr_multiple' ||
    isRevenueMethodologyKey(methodKey) ||
    (methodKey !== 'dcf' && methodKey !== 'fiscal_4x' && methodKey !== 'adjusted_nav')
  )
}

export function buildMultipleFormulaModel(
  methodKey: string,
  model: MethodBreakdownModel
): MultipleFormulaModel | null {
  if (!isMultipleFormulaMethod(methodKey)) return null
  const metric =
    methodKey === 'sde_multiple'
      ? model.sdeValue
      : methodKey === 'arr_multiple'
        ? model.arrValue
        : isRevenueMethodologyKey(methodKey)
          ? model.revenueValue
          : model.normalizedEbitda
  const multiple = model.effectiveAppliedMultiple
  const enterpriseValue = model.enterpriseValue
  if (metric == null || multiple == null || enterpriseValue == null) return null
  return {
    metric,
    multiple,
    enterpriseValue,
    equity: model.equityValue ?? enterpriseValue,
    netDebt: model.netDebt,
    balanceSheetAdjustments: model.balanceSheetAdjustments,
  }
}

export function buildMethodBreakdownModel({
  methodKey,
  method,
  result,
  appliedMultiple,
}: {
  methodKey: string
  method: ValuationMethodResult
  result: ValuationResponse | null
  appliedMultiple: number | null
}): MethodBreakdownModel {
  const resultRecord = (result ?? null) as Record<string, unknown> | null
  const resultDetails = asRecord(resultRecord?.details) ?? {}
  const details = asRecord(method.details) ?? {}

  const normalizedEbitda =
    toNumberOrNull(resultDetails.sustainable_ebitda) ??
    toNumberOrNull(resultDetails.weighted_ebitda_total) ??
    toNumberOrNull(resultRecord?.ebitda)
  const revenueValue =
    toNumberOrNull(details.revenue) ??
    toNumberOrNull(resultDetails.revenue) ??
    toNumberOrNull(resultRecord?.revenue)
  const saasMetrics = asRecord(details.saas_metrics)
  const arrValue = toNumberOrNull(details.arr) ?? toNumberOrNull(saasMetrics?.arr)
  const valuationResult = asRecord(resultRecord?.valuation_result)
  const netDebt =
    toNumberOrNull(resultDetails.net_debt) ??
    toNumberOrNull(resultRecord?.net_debt) ??
    toNumberOrNull(valuationResult?.netDebt)
  const balanceSheetAdjustments =
    sumAdjustmentValues(resultDetails.balance_sheet_adjustments) ??
    sumAdjustmentValues(resultRecord?.balance_sheet_adjustments)
  const enterpriseValue =
    toNumberOrNull(details.enterprise_value) ??
    toNumberOrNull(result?.multiples_valuation?.enterprise_value) ??
    toNumberOrNull(valuationResult?.enterpriseValueMid)
  const equityValue = toNumberOrNull(method.value)
  const dcfReadiness = isHistoricalFcfReadiness(details.historical_fcf_readiness)
    ? details.historical_fcf_readiness
    : isHistoricalFcfReadiness(result?.dcf_valuation?.historical_fcf_readiness)
      ? result.dcf_valuation.historical_fcf_readiness
      : null
  const apvTaxShieldValue = toNumberOrNull(details.apv_tax_shield_value)
  const apvEnterpriseValue = toNumberOrNull(details.apv_enterprise_value) ?? enterpriseValue
  const apvEquityValue = toNumberOrNull(details.apv_equity_value) ?? equityValue
  const apvBenchmarkReconciliation = asRecord(details.apv_benchmark_reconciliation)
  const pipelineRows = (result?.multiple_pipeline?.discount_waterfall?.slice(0, 4) ?? []).map(
    (row: WaterfallStep) => ({
      label: row.step_name,
      before: toNumberOrNull(row.multiple_before_mid) ?? toNumberOrNull(row.multiple_before_low),
      after: toNumberOrNull(row.multiple_after_mid) ?? toNumberOrNull(row.multiple_after_low),
      discount: toNumberOrNull(row.discount_percentage),
    })
  )
  const fallbackPipelineRows =
    pipelineRows.length > 0
      ? pipelineRows
      : (result?.multiple_pipeline?.stages?.slice(0, 4) ?? []).map(
          (stage: MultiplePipelineStage) => ({
            label: stage.step_name,
            before: toNumberOrNull(stage.multiple_before_mid ?? stage.multiple_before),
            after: toNumberOrNull(stage.multiple_after_mid ?? stage.multiple_after),
            discount: toNumberOrNull(stage.discount_percentage),
          })
        )

  return {
    usesRevenueMetric: isRevenueMethodologyKey(methodKey),
    normalizedEbitda,
    revenueValue,
    arrValue,
    netDebt,
    balanceSheetAdjustments,
    enterpriseValue,
    equityValue,
    wacc: toNumberOrNull(method.wacc ?? details.wacc),
    terminalValue: toNumberOrNull(details.terminal_value),
    terminalValueMethodology:
      typeof details.terminal_value_methodology === 'string'
        ? details.terminal_value_methodology
        : null,
    terminalExitMultiple: toNumberOrNull(details.terminal_exit_multiple),
    dcfReadiness,
    operatingDcfEnterpriseValue: toNumberOrNull(details.dcf_enterprise_value_before_apv),
    operatingDcfEquityValue: toNumberOrNull(details.dcf_equity_value_before_apv),
    apvTaxShieldValue,
    apvEnterpriseValue,
    apvEquityValue,
    apvDiscountRate: toNumberOrNull(details.apv_discount_rate),
    apvDiscountingConvention:
      typeof details.apv_discounting_convention === 'string'
        ? details.apv_discounting_convention
        : null,
    apvBenchmarkStatus:
      typeof apvBenchmarkReconciliation?.status === 'string'
        ? apvBenchmarkReconciliation.status
        : null,
    apvBenchmarkName:
      typeof apvBenchmarkReconciliation?.benchmark_name === 'string'
        ? apvBenchmarkReconciliation.benchmark_name
        : 'Henk customer DCF template',
    hasApvBridge: methodKey === 'dcf' && apvTaxShieldValue != null,
    sensitivityMatrix: asSensitivityMatrix(details.sensitivity_matrix_2d),
    ownerSalaryEstimate: toNumberOrNull(details.owner_salary_estimate),
    sdeValue: toNumberOrNull(details.sde),
    bookEquity: toNumberOrNull(details.book_equity) ?? toNumberOrNull(details.fiscal_book_equity),
    methodologyJustification:
      typeof details.methodology_justification === 'string'
        ? details.methodology_justification
        : typeof details.description === 'string'
          ? details.description
          : null,
    saasRuleOf40: toNumberOrNull(saasMetrics?.rule_of_40),
    saasNrr: toNumberOrNull(saasMetrics?.nrr_pct),
    comparablesCount: toNumberOrNull(result?.multiples_valuation?.comparables_count),
    comparablesQuality: result?.multiples_valuation?.comparables_quality ?? null,
    fallbackPipelineRows,
    effectiveAppliedMultiple:
      appliedMultiple ??
      toNumberOrNull(method.multiple_used) ??
      toNumberOrNull(result?.multiple_pipeline?.final_multiple_mid) ??
      toNumberOrNull(result?.multiple_pipeline?.final_multiple),
  }
}
