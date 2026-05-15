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

export interface BuyerReadinessFaqItem {
  question: string
  answer: string
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
  buyerFaq: BuyerReadinessFaqItem[]
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
