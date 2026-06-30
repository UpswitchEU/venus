import type { BuyerReadyToolCard } from './buyer-ready-tool-card-types'

export type { BuyerReadyToolCard } from './buyer-ready-tool-card-types'

export interface ValuationRunRequestPending {
  status: 'pending_approval'
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
  message?: string
}

export interface ValuationRunRequestBlocked {
  status: 'blocked'
  reason?: string
  missing?: string[]
  message?: string
}

export type ValuationRunRequest = ValuationRunRequestPending | ValuationRunRequestBlocked

export interface ReportGenerationRequestPending {
  status: 'pending_approval'
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
  message?: string
}

export interface ReportGenerationRequestBlocked {
  status: 'blocked'
  reason?: string
  message?: string
}

export type ReportGenerationRequest =
  | ReportGenerationRequestPending
  | ReportGenerationRequestBlocked

export interface SellabilityRunRequestPending {
  status: 'pending_approval'
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
  message?: string
}

export interface SellabilityRunRequestBlocked {
  status: 'blocked'
  reason?: string
  missing?: string[]
  message?: string
}

export type SellabilityRunRequest = SellabilityRunRequestPending | SellabilityRunRequestBlocked

export interface OwnerProfileAnswerRequest {
  field?: string
  value?: number | string | boolean | null
  label?: string
  reason?: string
  complete?: boolean
  accountantCustomerId?: string
}

export interface IntegrationConnectRequest {
  status: 'pending_approval'
  provider?: string
  authMode?: 'oauth' | 'api_key'
  reason?: string
  targetContext?: string | null
  message?: string
}

export interface IntegrationSyncRequest {
  status: 'pending_approval' | 'blocked'
  provider?: string
  scope?: 'provider_scope' | 'client_scope'
  clientId?: string | null
  reason?: string
  message?: string
}

/**
 * Read-only companion of `IntegrationSyncRequest` — surfaces the
 * per-provider connection + last-sync state so the agent can answer
 * "is the sync done?" without forcing a settings-page refresh.
 *
 * Mirrors Mercury's `sync_status` card kind. Source-of-truth tool lives at
 * `apps/titan-api/src/ai/tools/get-sync-status.tool.ts` (calls accounting
 * services directly via DI through `collectAccountingProviderStatuses`).
 */
export interface SyncStatusPreview {
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

export interface OwnerReminderRequest {
  status: 'pending_approval' | 'blocked'
  clientId?: string
  businessName?: string | null
  customerEmail?: string | null
  customMessage?: string | null
  reason?: string
  message?: string
}

/**
 * Owner-side conversational mirror — agent proposes inviting the seller's
 * accountant to join the deal. Reverse direction of the advisor → owner
 * invite chain (which goes through `client_create`). Source-of-truth Titan
 * tool: `propose_owner_invite_accountant`.
 *
 * On approve the card POSTs `{accountant_email, surface: 'card',
 * custom_message?}` to `/api/client/orphaned-seller/invite-accountant`.
 * 500-char cap on `customMessage` enforced both here and at the BFF.
 */
export interface OwnerInviteAccountantRequest {
  status: 'pending_approval' | 'blocked'
  accountantEmail?: string
  customMessage?: string | null
  reason?: string
  message?: string
}

export interface ListingVisibilityRequest {
  status: 'pending_approval' | 'blocked'
  listingId?: string
  visibility?: 'public' | 'private'
  businessName?: string | null
  reason?: string
  message?: string
}

export interface ShareTokenRequest {
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
  status: 'pending_approval' | 'blocked'
  clientId?: string
  method?: string | null
  businessName?: string | null
  reason?: string
  message?: string
}

export interface BulkValuationRunRequest {
  status: 'pending_approval' | 'blocked'
  clientIds?: string[]
  clientCount?: number
  estimatedCredits?: number
  rejectedCount?: number
  reason?: string
  message?: string
}

export interface ListingFieldUpdateRequest {
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
  status: 'pending_approval' | 'blocked'
  reportId?: string
  adjustmentId?: string
  category?: string
  amount?: number | null
  reason?: string
  message?: string
}

export interface ValuationDefaultsRequest {
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
  status: 'ok' | 'failed'
  defaults?: {
    multiple_calibration_adjustment: number | null
    historical_ebitda_weighting_mode: 'standard' | 'weighted' | null
    show_enterprise_to_equity_bridge: boolean | null
  }
  allDefaultsAtSystem?: boolean
  message?: string
}

export interface WorkspaceClientsPreview {
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

export interface AcknowledgeWarningRequest {
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
  status: 'pending_approval'
  title?: string
  options?: Array<{ value: string; label: string; helper?: string }>
  preselected?: string | null
  submitPath?: string
  reason?: string
}

export interface ClientCreateRequestPending {
  status: 'pending_approval' | 'auto_approved'
  businessName?: string
  customerEmail?: string | null
  companyNumber?: string | null
  industry?: string | null
  location?: string | null
  notes?: string | null
  message?: string
}

export interface ClientCreateRequestBlocked {
  status: 'blocked'
  reason?: string
  message?: string
}

export type ClientCreateRequest = ClientCreateRequestPending | ClientCreateRequestBlocked

export interface ListingPreview {
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

export interface ListingCreateRequestPending {
  status: 'pending_approval' | 'auto_approved'
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
  message?: string
}

export interface ListingCreateRequestBlocked {
  status: 'blocked'
  reason?: string
  message?: string
}

export type ListingCreateRequest = ListingCreateRequestPending | ListingCreateRequestBlocked

export interface ValuationSessionRequestPending {
  status: 'pending_approval' | 'auto_approved'
  clientId?: string
  businessName?: string | null
  customerEmail?: string | null
  hasBusinessCard?: boolean
  latestValuationId?: string | null
  hasSyncedFinancials?: boolean
  stpStatus?: string | null
  message?: string
}

export interface ValuationSessionRequestBlocked {
  status: 'blocked'
  reason?: string
  message?: string
}

export type ValuationSessionRequest =
  | ValuationSessionRequestPending
  | ValuationSessionRequestBlocked

export interface ImportReviewRequestPending {
  status: 'pending_approval' | 'auto_approved'
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
  message?: string
}

export interface ImportReviewRequestBlocked {
  status: 'blocked'
  clientId?: string
  reason?: string
  message?: string
}

export type ImportReviewRequest = ImportReviewRequestPending | ImportReviewRequestBlocked

export interface MethodReadinessPreview {
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

export interface BuyerProfilePreview {
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

export interface RegistrySearchHit {
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
}

export interface RegistrySearchResults {
  registry: 'KBO' | 'KVK' | 'Companies House'
  query: string
  totalFound: number
  hits: RegistrySearchHit[]
  coverageWarning?: 'kvk_not_in_dataset' | 'upstream_degraded'
  note?: string
  status?: 'ok' | 'failed'
}

export interface BusinessTypeSearchResult {
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
}

export interface BusinessTypeSearchResults {
  status: 'ok' | 'empty' | 'failed'
  query: string
  totalFound: number
  results: BusinessTypeSearchResult[]
  note?: string
  error?: string
}

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

export interface BelgianCompanyBootstrap {
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

export interface FieldUpdateParsed {
  field: string
  value: number | string | boolean
  label: string
  source: 'ai'
  confidence?: 'high' | 'medium' | 'low'
}

export interface ParsedToolResults {
  normalisationSuggestions: unknown[]
  fieldUpdates: FieldUpdateParsed[]
  valuationRunRequests: ValuationRunRequest[]
  reportGenerationRequests: ReportGenerationRequest[]
  sellabilityRunRequests: SellabilityRunRequest[]
  ownerProfileAnswerRequests: OwnerProfileAnswerRequest[]
  integrationConnectRequests: IntegrationConnectRequest[]
  integrationSyncRequests: IntegrationSyncRequest[]
  syncStatusPreviews: SyncStatusPreview[]
  ownerReminderRequests: OwnerReminderRequest[]
  ownerInviteAccountantRequests: OwnerInviteAccountantRequest[]
  listingVisibilityRequests: ListingVisibilityRequest[]
  shareTokenRequests: ShareTokenRequest[]
  shareTokenRevokeRequests: ShareTokenRevokeRequest[]
  valuationMethodPreferenceRequests: ValuationMethodPreferenceRequest[]
  bulkValuationRunRequests: BulkValuationRunRequest[]
  listingFieldUpdateRequests: ListingFieldUpdateRequest[]
  normalizationDismissRequests: NormalizationDismissRequest[]
  workspaceClientsPreviews: WorkspaceClientsPreview[]
  valuationDefaultsRequests: ValuationDefaultsRequest[]
  valuationDefaultsPreviews: ValuationDefaultsPreview[]
  acknowledgeWarningRequests: AcknowledgeWarningRequest[]
  secureCredentialRequests: SecureCredentialRequest[]
  csvUploadRequests: CsvUploadRequest[]
  multiSelectRequests: MultiSelectRequest[]
  singleSelectRequests: SingleSelectRequest[]
  clientCreateRequests: ClientCreateRequest[]
  belgianCompanyBootstraps: BelgianCompanyBootstrap[]
  valuationSessionRequests: ValuationSessionRequest[]
  clientDataReadinessPreviews: ClientDataReadinessPreview[]
  importReviewRequests: ImportReviewRequest[]
  methodReadinessPreviews: MethodReadinessPreview[]
  listingPreviews: ListingPreview[]
  listingCreateRequests: ListingCreateRequest[]
  buyerProfilePreviews: BuyerProfilePreview[]
  registrySearchResults: RegistrySearchResults[]
  businessTypeSearchResults: BusinessTypeSearchResults[]
  advisorCopilotDrafts: AdvisorCopilotDraft[]
  buyerReadyCards: BuyerReadyToolCard[]
}
