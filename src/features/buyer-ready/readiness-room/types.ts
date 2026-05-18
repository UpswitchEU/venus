export type BuyerReadinessItemStatus = 'complete' | 'needs_attention' | 'missing'
export type BuyerReadinessOverallStatus = 'ready' | 'needs_attention' | 'blocked'

export interface PricingRange {
  min: number
  mid: number
  max: number
  currency: string
}

export interface BuyerReadyPackageReport {
  id: string
  sessionKey: string | null
  businessName: string | null
  status: string
  pricingRange: PricingRange | null
  methodology: string | null
  confidenceScore: number | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface BuyerReadyPackagePdf {
  url: string | null
  generatedAt: string | null
  status: 'ready' | 'generating' | 'none'
  expiresAt: string | null
}

export interface BuyerReadinessMissingDocument {
  key: string
  label: string
  status: BuyerReadinessItemStatus
  reason: string
}

export interface BuyerReadinessChecklistItem {
  key: string
  label: string
  status: BuyerReadinessItemStatus
  required: boolean
  detail: string
}

export type BuyerReadyChecklistTrafficStatus = 'red' | 'yellow' | 'green'

export interface BuyerReadinessMissingDocChecklistItem {
  category: string
  status: BuyerReadyChecklistTrafficStatus
  reason: string
  advisor_override: boolean
  last_updated: string
}

export interface BuyerReadinessMissingDocChecklist {
  items: BuyerReadinessMissingDocChecklistItem[]
  overall_status: BuyerReadyChecklistTrafficStatus
  green_count: number
  yellow_count: number
  red_count: number
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

export interface BuyerReadinessWorkingCapitalPack {
  status: BuyerReadinessItemStatus
  currentYear: number | null
  currentNwc: number | null
  nwcChange: number | null
  nwcSurplusDeficit: number | null
  actualNwcYears: number
  basis: string
  confidence: 'high' | 'medium' | 'low' | null
  evidence: string[]
  missingInputs: string[]
  detail: string
}

export interface BuyerReadinessCommercialSignal {
  key: string
  label: string
  status: BuyerReadinessItemStatus
  score: number | null
  value: string | null
  detail: string
  evidence: string[]
  action: string | null
  source: string
}

export interface BuyerReadinessCommercialReadiness {
  status: BuyerReadinessItemStatus
  readyCount: number
  totalRequired: number
  signals: BuyerReadinessCommercialSignal[]
  priorityActions: Array<{
    factor: string
    action: string
    eurImpact: number | null
    confidence: string | null
    upliftPct: number | null
  }>
  evidenceGaps: string[]
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
  outputs: Record<string, BuyerReadinessItemStatus>
  checklist: BuyerReadinessChecklistItem[]
  missingDocuments: BuyerReadinessMissingDocument[]
  missingDocChecklist?: BuyerReadinessMissingDocChecklist
  buyerFaq: BuyerReadinessFaqItem[]
  normalizationBridge?: BuyerReadinessNormalizationBridge
  workingCapital?: BuyerReadinessWorkingCapitalPack
  commercialReadiness?: BuyerReadinessCommercialReadiness
  teaserImDraft: BuyerReadinessTeaserImDraft
  privateComps: {
    eligible: boolean
    reason: string
    contributionEndpoint: string
    suggestedPayload: Record<string, unknown>
  }
  handoff: {
    legalAiHandoffReady: boolean
    target: string
    detail: string
  }
  sourceSignals: string[]
}

export interface BuyerReadyImSection {
  section_key: string
  heading: string
  narrative_paragraphs: string[]
  key_figures: unknown[]
  confidence: 'high' | 'medium' | 'low'
  provenance: unknown[]
}

export interface BuyerReadyImSnapshot {
  imId: string
  packageId: string
  entityId: string
  version: number
  status: 'draft' | 'generated' | 'archived' | 'error'
  generatedAt: string
  htmlReport: string
  pdfHtmlReport: string
  sections: Record<string, BuyerReadyImSection>
  confidenceMap: Record<string, 'high' | 'medium' | 'low'>
  createdAt: string
  updatedAt: string
  versionHistory: Array<{
    imId: string
    version: number
    status: string
    generatedAt: string
    createdAt: string
    updatedAt: string
  }>
}

export interface BuyerReadyWcTaxDto {
  entityId: string
  generatedAt: string
  wcPeg: {
    target_eur: number
    band_low_eur: number
    band_high_eur: number
    one_liner: string
    monthly_series: Array<{ month: string; nwc_eur: number }>
    derived_from: string
    confidence: 'high' | 'medium' | 'low'
  } | null
  taxLatency: {
    jurisdiction: 'BE' | 'NL'
    flags: Array<{
      rule_id: string
      label: string
      rationale: string
      estimated_impact_eur?: number | null
      severity: 'info' | 'warning' | 'critical'
    }>
    flag_count: number
  }
  sourceSignals: {
    monthlyPointCount: number
    annualPointCount: number
    taxSignalKeys: string[]
  }
}

export interface BuyerReadyVaultDoc {
  id: string
  entity_id: string
  valuation_report_id: string | null
  category: string
  filename: string
  version: number
  size_bytes: number
  mime_type: string
  storage_path: string
  access_gate: 'public_teaser' | 'after_nda'
  uploaded_by: string
  uploaded_at: string
  created_at: string
  updated_at: string
}

export interface ReadinessCaseTask {
  id: string
  category: string
  title: string
  status: 'not_started' | 'requested_from_owner' | 'awaiting_advisor_review' | 'complete'
  assigneeRole: 'owner' | 'advisor' | 'accountant' | 'system'
  deadlineAt: string | null
  completedAt: string | null
  overdue: boolean
  sourceRef: string | null
}

export interface ReadinessCaseEvidence {
  id: string
  signalKey: string
  signalLabel: string
  status: 'unsupported' | 'weak_evidence' | 'documented'
  vaultDocIds: string[]
  updatedAt: string
}

export interface ReadinessCaseDto {
  id: string
  entityId: string
  valuationReportId: string | null
  title: string | null
  state: 'draft' | 'in_progress' | 'buyer_ready' | 'archived'
  packageMetadata: Record<string, unknown>
  handoffExports: Record<string, unknown>
  tasks: ReadinessCaseTask[]
  evidence: ReadinessCaseEvidence[]
  portfolioSignals: {
    ownerOverdue: boolean
    advisorReview: boolean
    buyerReady: boolean
    evidenceDocumentedPct: number
  }
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface BuyerReadyRoomPackage {
  report: BuyerReadyPackageReport
  pdf: BuyerReadyPackagePdf
  buyerReadiness?: BuyerReadinessPackage
}

export interface BuyerReadyRoomPayload {
  entityId: string
  generatedAt: string
  package: BuyerReadyRoomPackage | null
  readinessCase: ReadinessCaseDto | null
  buyerReadiness: BuyerReadinessPackage | null
  im: BuyerReadyImSnapshot | null
  wcTax: BuyerReadyWcTaxDto | null
  vaultDocs: BuyerReadyVaultDoc[]
  partialFailures: string[]
}
