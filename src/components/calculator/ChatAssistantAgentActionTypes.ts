import type { BuyerReadyToolCard as ParsedBuyerReadyToolCard } from '@/services/ai/buyer-ready-tool-card-types'

/**
 * Pending valuation-run proposal from the AI's run_valuation tool.
 * Decision = local UI state after the user clicks; back-end side effects
 * (the actual /api/v2/valuations/calculate run) are dispatched by the parent's
 * `onApproveValuationRun` callback.
 */
export interface ValuationRunRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  reportId?: string
  methods?: string[] | null
  estimatedCredits?: number
  inputsSummary?: {
    business_name: string | null
    business_type: string | null
    industry: string | null
    revenue: string | null
    ebitda: string | null
    ebitda_normalized: string | null
    pending_normalizations: number
    applied_normalizations: number
  }
  note?: string | null
  reason?: string
  missing?: string[]
  message?: string
  decision?: 'approved' | 'rejected'
}

/**
 * Pending PDF-generation proposal from the AI's generate_report tool.
 * Approve fires the existing `generatePdf` flow on the parent — no extra credit.
 */
export interface ReportGenerationRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  reportId?: string
  estimatedCredits?: number
  resultSummary?: {
    business_name: string | null
    business_type: string | null
    valuation_method: string | null
    currency: string
    midpoint: number | null
    min: number | null
    max: number | null
    confidence_score: number | null
    calculated_at: string | null
  }
  note?: string | null
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

/**
 * Pending Sellability-compute proposal from the AI's run_sellability tool.
 * Approve POSTs to Venus's /api/sellability/score proxy (Titan-backed). Free —
 * no credit consumed. Q1/Q2/Q3 answers come from the persisted owner profile.
 */
export interface SellabilityRunRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  estimatedCredits?: number
  answers?: {
    q1_top3_concentration_pct: number | null
    q2_contracted_share: string | null
    q3_books_cleanliness: string | null
  }
  currentScore?: {
    score: number
    band: string
    computed_at: string | Date
  } | null
  note?: string | null
  reason?: string
  missing?: string[]
  message?: string
  decision?: 'approved' | 'rejected'
  /** Set after successful compute so the card can show the new score inline. */
  computedScore?: { score: number; band: string; confidence?: string } | null
}

export interface OwnerProfileAnswerRequest {
  id: string
  field?: string
  value?: number | string | boolean | null
  label?: string
  reason?: string
  complete?: boolean
  accountantCustomerId?: string
}

export interface IntegrationConnectRequest {
  id: string
  status: 'pending_approval'
  provider?: string
  authMode?: 'oauth' | 'api_key'
  reason?: string
  targetContext?: string | null
  message?: string
}

export interface IntegrationSyncRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  provider?: string
  scope?: 'provider_scope' | 'client_scope'
  clientId?: string | null
  reason?: string
  message?: string
}

/**
 * Read-only companion of `IntegrationSyncRequest` — renders the agent's
 * answer to "is the sync done?" without forcing a settings-page refresh.
 * Source-of-truth Titan tool: `get_sync_status`.
 */
export interface SyncStatusPreview {
  id: string
  status: 'ok' | 'failed'
  providers: Array<{
    provider: string
    connected: boolean
    syncInProgress: boolean
    lastSyncAt: string | null
    clientCount: number | null
    error: string | null
  }>
  message?: string
}

/**
 * Owner-side conversational mirror — agent proposes inviting the seller's
 * accountant to join the deal. Reverse direction of the advisor → owner
 * invite chain. Source-of-truth Titan tool: `propose_owner_invite_accountant`.
 */
export interface OwnerInviteAccountantRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  accountantEmail?: string
  customMessage?: string | null
  reason?: string
  message?: string
}

export interface OwnerReminderRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  clientId?: string
  businessName?: string | null
  customerEmail?: string | null
  customMessage?: string | null
  reason?: string
  message?: string
}

export interface ListingVisibilityRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  listingId?: string
  visibility?: 'public' | 'private'
  businessName?: string | null
  reason?: string
  message?: string
}

export interface ShareTokenRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  listingId?: string
  expiresInDays?: number | null
  maxUses?: number | null
  label?: string | null
  businessName?: string | null
  reason?: string
  message?: string
}

export interface ShareTokenRevokeRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  listingId?: string
  tokenId?: string
  tokenHint?: string | null
  tokenLabel?: string | null
  businessName?: string | null
  reason?: string
  message?: string
}

export interface ValuationMethodPreferenceRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  clientId?: string
  method?: string | null
  businessName?: string | null
  reason?: string
  message?: string
}

export interface BulkValuationRunRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  clientIds?: string[]
  clientCount?: number
  estimatedCredits?: number
  rejectedCount?: number
  reason?: string
  message?: string
}

export interface ListingFieldUpdateRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  listingId?: string
  change?: {
    title?: string | null
    summary?: string | null
    description?: string | null
    asking_price?: number | null
  }
  reason?: string
  message?: string
}

export interface NormalizationDismissRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  reportId?: string
  adjustmentId?: string
  category?: string
  amount?: number | null
  reason?: string
  message?: string
}

export interface WorkspaceClientsPreview {
  id: string
  status: 'ok' | 'failed'
  clients?: Array<{
    id: string
    name: string
    email: string | null
    company_number: string | null
    status: 'draft' | 'invited' | 'active'
    invited_at: string | null
    accepted_at: string | null
  }>
  totalClients?: number
  returnedCount?: number
  truncated?: boolean
  counts?: { draft: number; invited: number; active: number }
  filter?: {
    status?: 'draft' | 'invited' | 'active' | null
    search?: string | null
  }
  message?: string
}

export interface ValuationDefaultsRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  change?: {
    multiple_calibration_adjustment?: number | null
    historical_ebitda_weighting_mode?: 'standard' | 'weighted' | null
    show_enterprise_to_equity_bridge?: boolean | null
  }
  reason?: string
  message?: string
}

export interface ValuationDefaultsPreview {
  id: string
  status: 'ok' | 'failed'
  defaults?: {
    multiple_calibration_adjustment: number | null
    historical_ebitda_weighting_mode: 'standard' | 'weighted' | null
    show_enterprise_to_equity_bridge: boolean | null
  }
  allDefaultsAtSystem?: boolean
  message?: string
}

export interface AcknowledgeWarningRequest {
  id: string
  status: 'pending_approval' | 'blocked'
  code?: string
  warningKind?: 'cap_breach' | 'defensibility'
  summary?: string | null
  reason?: string
  message?: string
  clientId?: string
  reportId?: string
}

export interface SecureCredentialRequest {
  id: string
  status: 'pending_approval'
  provider?: string
  reason?: string
  fields?: Array<{
    key: string
    label: string
    masked: boolean
    required: boolean
    helper?: string
  }>
  submitPath?: string
  message?: string
}

export interface CsvUploadRequest {
  id: string
  status: 'pending_approval'
  mode?: 'single_client_trial_balance' | 'bulk_clients'
  label?: string
  reason?: string
  expectedColumns?: string[]
  submitPath?: string
  maxSizeBytes?: number
  accept?: string
  message?: string
}

export interface MultiSelectRequest {
  id: string
  status: 'pending_approval'
  title?: string
  options?: Array<{ value: string; label: string; helper?: string }>
  minSelections?: number
  maxSelections?: number
  preselected?: string[]
  submitPath?: string
  reason?: string
}

export interface SingleSelectRequest {
  id: string
  status: 'pending_approval'
  title?: string
  options?: Array<{ value: string; label: string; helper?: string }>
  preselected?: string | null
  submitPath?: string
  reason?: string
}

export interface AgentChoiceSelection {
  id: string
  kind: 'multi_select' | 'single_select'
  title?: string
  submitPath?: string
  values?: string[]
  value?: string
  selectedOptions: Array<{ value: string; label: string; helper?: string }>
}

export interface ClientCreateRequest {
  id: string
  status: 'pending_approval' | 'blocked' | 'auto_approved'
  businessName?: string
  customerEmail?: string | null
  companyNumber?: string | null
  industry?: string | null
  location?: string | null
  notes?: string | null
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

/**
 * Read-only Belgian public-data bootstrap from Titan's
 * bootstrap_belgian_company tool. This gives the advisor/owner a fast KBO +
 * NBB/CBSO context card before they connect integrations or upload CSV data.
 */
export interface BelgianCompanyBootstrap {
  id: string
  status: 'ok' | 'partial' | 'blocked' | 'failed'
  reason?: string
  message?: string
  identity?: {
    legalName?: string | null
    legalForm?: string | null
    kboNumber?: string | null
    address?: string | null
    city?: string | null
    postalCode?: string | null
    naceCode?: string | null
    naceDescription?: string | null
    foundationDate?: string | null
    isActive?: boolean | null
  } | null
  benchmark?: {
    status?: string | null
    businessTypeTitle?: string | null
    evEbitdaMedian?: number | null
    confidence?: string | null
  } | null
  filingSummary?: {
    status?: string | null
    source?: string | null
    filingYear?: number | null
    yearsAvailable?: number | null
    revenue?: number | null
    ebitda?: number | null
    dataHealthMessage?: string | null
  } | null
  valuationPreview?: {
    status?: string | null
    method?: string | null
    ebitdaUsed?: number | null
    ebitdaYear?: number | null
    evMid?: number | null
    equityMid?: number | null
  } | null
}

/**
 * Read-only anonymized listing preview from Titan's get_listing_preview tool.
 * Shows the marketplace-facing draft before buyer profiling and publish.
 */
export interface ListingPreview {
  id: string
  status: 'ok' | 'blocked'
  reportId?: string
  sourceBusinessName?: string | null
  reason?: string
  message?: string
  missingFields?: string[]
  nextActionHint?: string | null
  preview?: {
    title?: string | null
    businessType?: string | null
    sector?: string | null
    industry?: string | null
    region?: string | null
    province?: string | null
    yearCommenced?: number | null
    employeeRange?: string | null
    revenueRange?: string | null
    equityStake?: string | null
    ownershipStructure?: string | null
    ownerManagersCount?: number | null
    status?: string | null
    featured?: boolean | null
    ndaRequired?: boolean | null
    viewCount?: number | null
    hasVerifiedValuation?: boolean | null
  } | null
}

export interface MethodReadinessPreview {
  id: string
  status: 'ok' | 'blocked'
  reportId?: string
  businessName?: string | null
  readinessSource?: string | null
  readyMethods: string[]
  blockedMethods: string[]
  reason?: string
  message?: string
}

export interface ClientDataReadinessPreview {
  id: string
  status: string
  clientId?: string
  businessName?: string | null
  hasBusinessCard?: boolean
  hasSyncedFinancials?: boolean
  hasFinancialData?: boolean
  financialSyncedAt?: string | null
  stpStatus?: string | null
  computedStpStatus?: string | null
  latestValuationId?: string | null
  accountingSources?: Array<{
    provider: string
    clientKey?: string | null
    isPrimaryForValuation?: boolean
    lastSyncAt?: string | null
  }>
  importQualitySummary?: {
    years: string[]
    minConfidence?: number | null
    errorCount?: number
    warningCount?: number
    infoCount?: number
    actionableFlagCount?: number
    topFlags?: Array<{
      year?: string
      field?: string | null
      code?: string | null
      severity?: string | null
      message?: string | null
    }>
  } | null
  recommendedNextAction?: string
  recommendedNextTool?: string | null
  recommendedNextRoute?: string | null
  message?: string
}

/**
 * Pending marketplace-listing proposal from Titan's advisor-scoped
 * create_listing tool. Approve returns the advisor to Mercury's canonical
 * publish wizard; this card never writes a listing directly.
 */
export interface ListingCreateRequest {
  id: string
  status: 'pending_approval' | 'auto_approved' | 'blocked'
  reportId?: string
  accountantCustomerId?: string | null
  visibility?: 'public' | 'private'
  valuationSummary?: {
    business_name?: string | null
    business_type?: string | null
    industry?: string | null
    currency?: string
    midpoint?: string | null
    min?: string | null
    max?: string | null
  }
  note?: string | null
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

export interface ValuationSessionRequest {
  id: string
  status: 'pending_approval' | 'blocked' | 'auto_approved'
  clientId?: string
  businessName?: string | null
  customerEmail?: string | null
  hasBusinessCard?: boolean
  latestValuationId?: string | null
  hasSyncedFinancials?: boolean
  stpStatus?: string | null
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

export interface ImportReviewRequest {
  id: string
  status: 'pending_approval' | 'blocked' | 'auto_approved'
  clientId?: string
  businessName?: string | null
  hasSyncedFinancials?: boolean
  stpStatus?: string | null
  accountingSources?: Array<{
    provider: string
    clientKey?: string | null
    isPrimaryForValuation?: boolean
    lastSyncAt?: string | null
  }>
  actionableFlagCount?: number
  topFlags?: Array<{
    year?: string
    field?: string | null
    code?: string | null
    severity?: string | null
    message?: string | null
  }>
  reason?: string
  message?: string
  decision?: 'approved' | 'rejected'
}

export interface BuyerProfilePreview {
  id: string
  status: 'ok' | 'blocked'
  reportId?: string
  sourceBusinessName?: string | null
  reason?: string
  message?: string
  listingReadiness?: {
    status?: string | null
    missingFields: string[]
  } | null
  buyerSegments?: Array<{
    id?: string
    label: string
    fitScore?: number | null
    recommendedAngle?: string | null
  }>
}

export type BuyerReadyToolCard = ParsedBuyerReadyToolCard & { id: string }

export interface AdvisorCopilotCitation {
  key: string
  label: string
  source: string
  detail?: string
}

export interface AdvisorCopilotYearPlanItem {
  title: string
  objective?: string | null
  targetDelta?: number | null
  rationale?: string | null
  sourceKeys: string[]
}

export interface AdvisorCopilotAgendaItem {
  title: string
  durationMinutes?: number | null
  advisorPrep?: string | null
  ownerPrompt?: string | null
  sourceKeys: string[]
}

export interface AdvisorCopilotTalkingPoint {
  point: string
  rationale?: string | null
  euroDelta?: number | null
  sourceKeys: string[]
}

export interface AdvisorCopilotServiceAngle {
  title: string
  scope?: string | null
  rationale?: string | null
  sourceKeys: string[]
}

export interface AdvisorCopilotDraft {
  id: string
  status: 'pending_review' | 'blocked'
  trajectoryId?: string | null
  reportId?: string | null
  businessName?: string | null
  yearPlan: AdvisorCopilotYearPlanItem[]
  firstCheckInAgenda: AdvisorCopilotAgendaItem[]
  talkingPoints: AdvisorCopilotTalkingPoint[]
  billableServiceAngles: AdvisorCopilotServiceAngle[]
  citations: AdvisorCopilotCitation[]
  reason?: string
  message?: string
}

export interface BusinessTypeSearchResults {
  id: string
  status: 'ok' | 'empty' | 'failed'
  query: string
  totalFound: number
  results: Array<{
    id: string
    title: string
    description?: string | null
    category?: string | null
    industry?: string | null
    sector?: string | null
    primaryModel?: string | null
    preferredMultiples?: string[]
    benchmarkStatus?: string | null
    benchmarkMessage?: string | null
  }>
  note?: string
  error?: string
}

export interface RegistrySearchResultsPreview {
  id: string
  registry: 'KBO' | 'KVK' | 'Companies House'
  query: string
  totalFound: number
  hits: Array<{
    companyNumber: string
    companyName: string
    legalForm?: string | null
    city?: string | null
    postalCode?: string | null
    address?: string | null
    countryCode?: string | null
    naceCode?: string | null
    naceDescription?: string | null
    businessTypeId?: string | null
    businessTypeTitle?: string | null
    foundationDate?: string | null
    isActive?: boolean | null
  }>
  coverageWarning?: 'kvk_not_in_dataset' | 'upstream_degraded'
  note?: string
  status?: 'ok' | 'failed'
}

export interface ChatTask {
  id: string
  type: 'confirm' | 'choose' | 'enter' | 'upload' | 'approve'
  label: string
  context?: string
  completed?: boolean
}
