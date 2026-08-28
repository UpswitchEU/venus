import type {
  RecoveryForecastYearInput,
  RecoveryInputs,
  RecoveryInputsDraft,
  RecoveryOperatingDriver,
  RecoveryScenarioInput,
  RecoveryScenarioKey,
} from '../types/valuation'

export interface RecoveryDraftCompilation {
  inputs: RecoveryInputs | null
  issues: string[]
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function recoveryDriverRevenue(driver: RecoveryOperatingDriver): number {
  switch (driver.model_type) {
    case 'customer_acv':
      return driver.customers * driver.annual_contract_value
    case 'consultant_capacity':
      return (
        driver.consultants *
        driver.annual_capacity_per_consultant *
        driver.utilization *
        driver.rate
      )
    case 'arr_retention_expansion':
      return (
        driver.opening_arr * driver.gross_retention_rate + driver.expansion_arr + driver.new_arr
      )
    case 'units_price':
      return driver.units * driver.price_per_unit
    case 'attested_custom':
    case 'advisor_reviewed_custom':
      return driver.derived_revenue
  }
}

function validOperatingDriver(driver: RecoveryOperatingDriver): boolean {
  switch (driver.model_type) {
    case 'customer_acv':
      return (
        finite(driver.customers) &&
        driver.customers >= 0 &&
        finite(driver.annual_contract_value) &&
        driver.annual_contract_value >= 0
      )
    case 'consultant_capacity':
      return (
        finite(driver.consultants) &&
        driver.consultants >= 0 &&
        finite(driver.annual_capacity_per_consultant) &&
        driver.annual_capacity_per_consultant >= 0 &&
        finite(driver.utilization) &&
        driver.utilization >= 0 &&
        driver.utilization <= 1 &&
        finite(driver.rate) &&
        driver.rate >= 0
      )
    case 'arr_retention_expansion':
      return (
        finite(driver.opening_arr) &&
        driver.opening_arr >= 0 &&
        finite(driver.gross_retention_rate) &&
        driver.gross_retention_rate >= 0 &&
        driver.gross_retention_rate <= 1 &&
        finite(driver.expansion_arr) &&
        driver.expansion_arr >= 0 &&
        finite(driver.new_arr) &&
        driver.new_arr >= 0
      )
    case 'units_price':
      return (
        finite(driver.units) &&
        driver.units >= 0 &&
        finite(driver.price_per_unit) &&
        driver.price_per_unit >= 0
      )
    case 'attested_custom':
    case 'advisor_reviewed_custom':
      return (
        driver.model_name.trim().length >= 3 &&
        finite(driver.derived_revenue) &&
        driver.derived_revenue >= 0 &&
        driver.evidence_references.length > 0
      )
  }
}

function makeYear(year: number, revenue: number, ebitdaMargin: number): RecoveryForecastYearInput {
  const forecastEbitda = Math.max(0, revenue * ebitdaMargin)
  return {
    year,
    revenue,
    operating_expenses_excluding_da: Math.max(0, revenue - forecastEbitda),
    depreciation_and_amortization: 0,
    tax_rate: 0.25,
    nol_opening: 0,
    capex: 0,
    delta_nwc: 0,
    operating_driver: { model_type: 'units_price', units: 1, price_per_unit: revenue },
    evidence_references: [],
  }
}

export function createRecoveryInputsDraft(options: {
  startYear: number
  revenue: number
  reportedEbitda: number
  verificationIntent?: 'automated_guardrails' | 'owner_attestation' | 'advisor_review'
  openingCash?: number
  wacc?: number
  terminalGrowthRate?: number
}): RecoveryInputsDraft {
  const makeScenario = (key: RecoveryScenarioKey): RecoveryScenarioInput => {
    const probability = key === 'base' ? 60 : 20
    const revenueFactor = key === 'downside' ? 0.95 : key === 'upside' ? 1.05 : 1
    return {
      key,
      probability_percent: probability,
      forecast_years: Array.from({ length: 3 }, (_, yearIndex) =>
        makeYear(
          options.startYear + yearIndex,
          Math.max(0, options.revenue * revenueFactor ** (yearIndex + 1)),
          key === 'downside'
            ? [0.01, 0.04, 0.07][yearIndex]
            : key === 'upside'
              ? [0.04, 0.08, 0.12][yearIndex]
              : [0.02, 0.06, 0.1][yearIndex]
        )
      ),
      override_evidence_references: [],
    } satisfies RecoveryScenarioInput
  }
  const scenarios: [RecoveryScenarioInput, RecoveryScenarioInput, RecoveryScenarioInput] = [
    makeScenario('downside'),
    makeScenario('base'),
    makeScenario('upside'),
  ]

  return {
    enabled: true,
    schema_version: 'recovery_inputs.v1',
    scenarios,
    funding_plan: {
      opening_cash: Math.max(0, options.openingCash ?? 0),
      minimum_cash: 0,
      commitments: [],
    },
    governed_assumptions: {
      wacc: options.wacc ?? 0.12,
      terminal_growth_rate: options.terminalGrowthRate ?? 0.02,
      evidence_references: ['upswitch:negative-ebitda-recovery-policy:v1'],
    },
    verification_intent: {
      intent: options.verificationIntent ?? 'automated_guardrails',
      accepted: (options.verificationIntent ?? 'automated_guardrails') === 'automated_guardrails',
    },
  }
}

export function compileRecoveryInputsDraft(
  draft: RecoveryInputsDraft | undefined
): RecoveryDraftCompilation {
  const issues: string[] = []
  if (!draft?.enabled) return { inputs: null, issues: ['recovery_not_enabled'] }
  if (draft.schema_version !== 'recovery_inputs.v1') issues.push('invalid_schema_version')
  if (draft.scenarios.length !== 3) issues.push('three_scenarios_required')

  const keys = draft.scenarios.map((scenario) => scenario.key).sort()
  if (keys.join(',') !== 'base,downside,upside') issues.push('scenario_keys_invalid')
  const probability = draft.scenarios.reduce(
    (total, scenario) => total + scenario.probability_percent,
    0
  )
  if (!finite(probability) || Math.abs(probability - 100) > 1e-9) {
    issues.push('probabilities_must_sum_to_100')
  }

  const starts = new Set<number>()
  for (const scenario of draft.scenarios) {
    if (
      !finite(scenario.probability_percent) ||
      scenario.probability_percent <= 0 ||
      scenario.probability_percent > 100
    ) {
      issues.push(`${scenario.key}_probability_invalid`)
    }
    if (scenario.forecast_years.length < 3 || scenario.forecast_years.length > 10) {
      issues.push(`${scenario.key}_forecast_length_invalid`)
    }
    const firstYear = scenario.forecast_years[0]?.year
    if (firstYear !== undefined) starts.add(firstYear)
    scenario.forecast_years.forEach((row, index) => {
      if (index > 0 && row.year !== scenario.forecast_years[index - 1].year + 1) {
        issues.push(`${scenario.key}_years_not_consecutive`)
      }
      const nonNegative = [
        row.revenue,
        row.operating_expenses_excluding_da,
        row.depreciation_and_amortization,
        row.nol_opening,
        row.capex,
      ]
      if (nonNegative.some((value) => !finite(value) || value < 0)) {
        issues.push(`${scenario.key}_${row.year}_financials_invalid`)
      }
      if (!finite(row.delta_nwc) || !finite(row.tax_rate) || row.tax_rate < 0 || row.tax_rate > 1) {
        issues.push(`${scenario.key}_${row.year}_tax_or_nwc_invalid`)
      }
      const derivedRevenue = recoveryDriverRevenue(row.operating_driver)
      if (!validOperatingDriver(row.operating_driver)) {
        issues.push(`${scenario.key}_${row.year}_driver_inputs_invalid`)
      }
      const tolerance = Math.max(1, Math.abs(row.revenue) * 0.005)
      if (!finite(derivedRevenue) || Math.abs(derivedRevenue - row.revenue) > tolerance) {
        issues.push(`${scenario.key}_${row.year}_driver_not_reconciled`)
      }
      if (
        (row.operating_driver.model_type === 'attested_custom' ||
          row.operating_driver.model_type === 'advisor_reviewed_custom') &&
        row.operating_driver.evidence_references.length === 0
      ) {
        issues.push(`${scenario.key}_${row.year}_custom_driver_evidence_required`)
      }
    })
    if (
      (scenario.wacc_override !== undefined || scenario.terminal_growth_override !== undefined) &&
      scenario.override_evidence_references.length === 0
    ) {
      issues.push(`${scenario.key}_override_evidence_required`)
    }
  }
  if (starts.size !== 1) issues.push('scenario_start_years_must_match')
  const { wacc, terminal_growth_rate: terminalGrowth } = draft.governed_assumptions
  if (!finite(wacc) || wacc <= 0 || wacc >= 1) issues.push('wacc_invalid')
  if (!finite(terminalGrowth) || terminalGrowth < -0.1 || terminalGrowth >= 0.15) {
    issues.push('terminal_growth_invalid')
  }
  if (finite(wacc) && finite(terminalGrowth) && terminalGrowth >= wacc) {
    issues.push('terminal_growth_must_be_below_wacc')
  }
  if (draft.governed_assumptions.evidence_references.length === 0) {
    issues.push('governed_assumption_evidence_required')
  }
  if (
    !finite(draft.funding_plan.opening_cash) ||
    draft.funding_plan.opening_cash < 0 ||
    !finite(draft.funding_plan.minimum_cash) ||
    draft.funding_plan.minimum_cash < 0
  ) {
    issues.push('funding_cash_invalid')
  }
  draft.funding_plan.commitments.forEach((commitment, index) => {
    if (
      !finite(commitment.amount) ||
      commitment.amount <= 0 ||
      !Number.isInteger(commitment.available_year) ||
      commitment.evidence_references.length === 0
    ) {
      issues.push(`funding_commitment_${index + 1}_invalid`)
    }
  })
  if (issues.length > 0) return { inputs: null, issues: [...new Set(issues)] }
  const { enabled: _enabled, ...inputs } = draft
  return {
    inputs: {
      ...inputs,
      // Human attestation is an optional stricter mode, never a default gate.
      // Older unaccepted drafts are upgraded to deterministic system review.
      verification_intent: draft.verification_intent.accepted
        ? draft.verification_intent
        : { intent: 'automated_guardrails', accepted: true },
    },
    issues: [],
  }
}
