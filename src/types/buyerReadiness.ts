export type BuyerReadinessItemStatus = 'complete' | 'needs_attention' | 'missing'
export type BuyerReadinessOverallStatus = 'ready' | 'needs_attention' | 'blocked'

export interface BuyerReadinessChecklistItem {
  key: string
  label: string
  status: BuyerReadinessItemStatus
  required: boolean
  detail: string
}

export interface BuyerReadinessMissingDocument {
  key: string
  label: string
  status: BuyerReadinessItemStatus
  reason: string
}

export type BuyerReadinessDataRoomCategory =
  | 'financials'
  | 'normalization'
  | 'tax'
  | 'commercial'
  | 'transaction_pack'

export interface BuyerReadinessDataRoomItem {
  key: string
  label: string
  category: BuyerReadinessDataRoomCategory
  status: BuyerReadinessItemStatus
  required: boolean
  detail: string
  evidence: string[]
}

export interface BuyerReadinessDataRoomSection {
  key: string
  label: string
  status: BuyerReadinessItemStatus
  items: BuyerReadinessDataRoomItem[]
}

export interface BuyerReadinessDataRoomPlan {
  status: BuyerReadinessItemStatus
  completionPct: number
  readyCount: number
  totalRequired: number
  sections: BuyerReadinessDataRoomSection[]
  missingDocuments: BuyerReadinessMissingDocument[]
}

export interface BuyerReadinessFaqItem {
  question: string
  answer: string
}

export interface BuyerReadinessTeaserImDraft {
  status: BuyerReadinessItemStatus
  title: string
  summary: string
  highlights: string[]
  buyerConsiderations: string[]
  nextSteps: string[]
}

export interface BuyerReadinessNormalizationBridgeRow {
  key: string
  label: string
  category: string
  amount: number
  rationale: string | null
  source: string | null
  confidence: string | null
  evidenceStatus: BuyerReadinessItemStatus
}

export interface BuyerReadinessNormalizationBridge {
  status: BuyerReadinessItemStatus
  year: number | null
  reportedEbitda: number | null
  normalizedEbitda: number | null
  totalAdjustments: number | null
  currency: string
  confidence: string | null
  source: string | null
  rows: BuyerReadinessNormalizationBridgeRow[]
  auditTrail: {
    adjustmentCount: number
    customAdjustmentCount: number
    taxLatencyCount: number
    evidenceMissingCount: number
  }
}

export type BuyerReadinessWorkingCapitalBasis =
  | 'balance_sheet_detail'
  | 'current_assets_liabilities'
  | 'nwc_change_only'
  | 'valuation_waterfall'
  | 'missing'

export interface BuyerReadinessWorkingCapitalPack {
  status: BuyerReadinessItemStatus
  currentYear: number | null
  currentNwc: number | null
  nwcChange: number | null
  nwcSurplusDeficit: number | null
  actualNwcYears: number
  basis: BuyerReadinessWorkingCapitalBasis
  confidence: 'high' | 'medium' | 'low' | null
  evidence: string[]
  missingInputs: string[]
  detail: string
}

export type BuyerReadinessCommercialSignalKey =
  | 'customer_concentration'
  | 'owner_dependence'
  | 'revenue_quality'
  | 'contract_coverage'
  | 'ip_asset_clarity'
  | 'documentation_quality'

export interface BuyerReadinessCommercialSignal {
  key: BuyerReadinessCommercialSignalKey
  label: string
  status: BuyerReadinessItemStatus
  score: number | null
  value: string | null
  detail: string
  evidence: string[]
  action: string | null
  source: 'sellability_assessment' | 'form_input' | 'missing'
}

export interface BuyerReadinessCommercialReadiness {
  status: BuyerReadinessItemStatus
  readyCount: number
  totalRequired: number
  signals: BuyerReadinessCommercialSignal[]
  priorityActions: BuyerReadinessSellabilityAction[]
  evidenceGaps: string[]
}

export interface BuyerReadinessSellabilityAction {
  key: string
  factor: string
  action: string
  priority: 'primary' | 'secondary'
  eurImpact: number | null
  confidence: string | null
  upliftPct: number | null
}

export interface BuyerReadinessSellabilityFactor {
  key: string
  label: string
  score: number | null
  weight: number | null
  contribution: number | null
  dataAvailable: boolean
  status: BuyerReadinessItemStatus
  detail: string
}

export interface BuyerReadinessSellabilityPlan {
  status: BuyerReadinessItemStatus
  assessmentId: string | null
  score: number | null
  band: string | null
  confidence: string | null
  factorBreakdown: BuyerReadinessSellabilityFactor[]
  actions: BuyerReadinessSellabilityAction[]
  evidenceGaps: string[]
}

export interface BuyerReadinessPackage {
  generatedAt: string
  status: BuyerReadinessOverallStatus
  completionPct: number
  summary: {
    complete: number
    needsAttention: number
    missing: number
    requiredTotal: number
  }
  normalizedEarnings: {
    status: 'documented' | 'needs_review' | 'missing'
    year: number | null
    reportedEbitda: number | null
    normalizedEbitda: number | null
    totalAdjustments: number | null
    adjustmentCount: number
    categories: string[]
    confidence: string | null
    taxLatencyCount: number
  }
  sellability: {
    assessmentId: string
    score: number
    band: string
    confidence: string
    createdAt: string
    topActions: Array<{
      factor: string
      action: string
      eurImpact: number | null
      confidence: string | null
      upliftPct: number | null
    }>
  } | null
  outputs: {
    valuationReport: BuyerReadinessItemStatus
    normalizedEbitdaBridge: BuyerReadinessItemStatus
    dataRoomChecklist: BuyerReadinessItemStatus
    missingDocumentList: BuyerReadinessItemStatus
    buyerFaq: BuyerReadinessItemStatus
    teaserImDraft: BuyerReadinessItemStatus
  }
  checklist: BuyerReadinessChecklistItem[]
  missingDocuments: BuyerReadinessMissingDocument[]
  dataRoomPlan?: BuyerReadinessDataRoomPlan
  buyerFaq: BuyerReadinessFaqItem[]
  normalizationBridge?: BuyerReadinessNormalizationBridge
  workingCapital?: BuyerReadinessWorkingCapitalPack
  sellabilityPlan?: BuyerReadinessSellabilityPlan
  commercialReadiness?: BuyerReadinessCommercialReadiness
  teaserImDraft: BuyerReadinessTeaserImDraft
  privateComps: {
    contributionEndpoint: '/api/v2/multiples/contribute'
    eligible: boolean
    reason: string
    suggestedPayload: {
      business_type_id: string | null
      country_code: string | null
      enterprise_value: number | null
      ebitda: number | null
      revenue: number | null
      observation_type: 'PLATFORM_VALUATION'
      valuation_methodology: string
      contributor_reference: string | null
    }
  }
  handoff: {
    legalAiHandoffReady: boolean
    target: 'lawyer_or_legal_ai'
    detail: string
  }
  sourceSignals: string[]
}

export function isBuyerReadinessPackage(value: unknown): value is BuyerReadinessPackage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.status === 'string' &&
    typeof record.completionPct === 'number' &&
    !!record.normalizedEarnings &&
    typeof record.normalizedEarnings === 'object'
  )
}
