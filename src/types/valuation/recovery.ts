import type { ApiNumeric } from './request'

export type RecoveryScenarioKey = 'downside' | 'base' | 'upside'

export type RecoveryOperatingDriver =
  | {
      model_type: 'customer_acv'
      customers: number
      annual_contract_value: number
    }
  | {
      model_type: 'consultant_capacity'
      consultants: number
      annual_capacity_per_consultant: number
      utilization: number
      rate: number
    }
  | {
      model_type: 'arr_retention_expansion'
      opening_arr: number
      gross_retention_rate: number
      expansion_arr: number
      new_arr: number
    }
  | {
      model_type: 'units_price'
      units: number
      price_per_unit: number
    }
  | {
      model_type: 'advisor_reviewed_custom'
      model_name: string
      derived_revenue: number
      evidence_references: string[]
    }

export interface RecoveryForecastYearInput {
  year: number
  revenue: number
  operating_expenses_excluding_da: number
  depreciation_and_amortization: number
  tax_rate: number
  nol_opening: number
  capex: number
  delta_nwc: number
  operating_driver: RecoveryOperatingDriver
  evidence_references: string[]
}

export interface RecoveryScenarioInput {
  key: RecoveryScenarioKey
  probability_percent: number
  forecast_years: RecoveryForecastYearInput[]
  wacc_override?: number
  terminal_growth_override?: number
  override_evidence_references: string[]
}

export interface RecoveryFundingCommitmentInput {
  amount: number
  available_year: number
  source: 'shareholder' | 'bank' | 'investor' | 'grant' | 'operating_facility' | 'other'
  evidence_references: string[]
}

/** Client-owned recovery contract. Titan replaces intent with an authenticated receipt. */
export interface RecoveryInputs {
  schema_version: 'recovery_inputs.v1'
  scenarios: [RecoveryScenarioInput, RecoveryScenarioInput, RecoveryScenarioInput]
  funding_plan: {
    opening_cash: number
    minimum_cash: number
    commitments: RecoveryFundingCommitmentInput[]
  }
  governed_assumptions: {
    wacc: number
    terminal_growth_rate: number
    evidence_references: string[]
  }
  verification_intent: {
    intent: 'owner_attestation' | 'advisor_review'
    accepted: boolean
  }
}

/** UI-only state. It persists with manual sessions but never crosses the API boundary. */
export interface RecoveryInputsDraft extends RecoveryInputs {
  enabled: boolean
}

export interface OperatingTrajectory {
  direction: 'improving' | 'stable' | 'deteriorating' | 'mixed' | 'unknown'
  ebitdaDirection: 'improving' | 'stable' | 'deteriorating' | 'unknown'
  confidence: 'low' | 'medium' | 'high'
  comparablePeriods: number
  latestRevenueGrowth: ApiNumeric | null
  latestGrossMarginChange: ApiNumeric | null
  latestEbitdaMarginChange: ApiNumeric | null
  latestCashBurnChange: ApiNumeric | null
  latestWorkingCapitalChange: ApiNumeric | null
  warnings: string[]
  conflicts: string[]
}

export interface RecoveryScenarioResult {
  key: RecoveryScenarioKey
  probabilityPercent: ApiNumeric
  status: 'eligible' | 'floor_substituted' | 'blocked'
  enterpriseValueLow: ApiNumeric | null
  enterpriseValueMid: ApiNumeric | null
  enterpriseValueHigh: ApiNumeric | null
  equityValueLow: ApiNumeric | null
  equityValueMid: ApiNumeric | null
  equityValueHigh: ApiNumeric | null
  breakEvenYear: number | null
  fundingGap: ApiNumeric
  terminalValueShare: ApiNumeric | null
  blockers: string[]
  derivedSchedule: Array<Record<string, unknown>>
}

export interface NegativeEbitdaResolution {
  status:
    | 'normalized_positive'
    | 'recovery_eligible'
    | 'revenue_benchmark_eligible'
    | 'asset_floor_only'
    | 'no_going_concern_range'
  reportedEbitda: ApiNumeric
  normalizedEbitda: ApiNumeric | null
  operatingTrajectory: OperatingTrajectory
  primaryMethod:
    | 'normalized_ebitda'
    | 'sde'
    | 'recovery_dcf'
    | 'arr_multiple'
    | 'revenue_multiple'
    | 'adjusted_nav'
    | 'orderly_liquidation'
    | null
  crossCheckMethods: string[]
  breakEvenYear: number | null
  fundingGap: ApiNumeric | null
  terminalValueShare: ApiNumeric | null
  confidence: 'low' | 'medium' | 'high'
  blockers: string[]
  requiredEvidence: string[]
  valueBuildingActions: string[]
  scenarioResults: RecoveryScenarioResult[]
  candidateMethodAudit: Record<string, Record<string, unknown>>
  auditTrailVersion: 'negative_ebitda_resolution.v1'
  modelVersion: 'negative_ebitda_recovery.v1'
  evaluatedAt: string
  inputSnapshotHash: string
  resolutionSnapshotHash: string
}
