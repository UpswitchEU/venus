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
  registry: 'KBO' | 'KVK'
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

export type BuyerReadyToolCard =
  | {
      kind: 'buyer_package_status'
      entityId: string | null
      packageStatus: string | null
      releaseStatus: string | null
      includedArtifactCount: number
      requiredArtifactCount: number
      missingRequiredArtifactTypes: string[]
      openInputCount: number
      checklist: {
        overallStatus: string | null
        greenCount: number
        yellowCount: number
        redCount: number
      }
    }
  | {
      kind: 'buyer_package_generation'
      status: 'pending_approval' | 'blocked'
      reportId?: string
      reason: string | null
      message?: string
      regionLabel?: string | null
      countryCode?: string | null
      readinessCaseId?: string | null
      submitPath?: string
      resultSummary?: {
        businessName: string | null
        businessType: string | null
        valuationMethod: string | null
        currency: string
        midpoint: number | null
        min: number | null
        max: number | null
      } | null
    }
  | {
      kind: 'dd_checklist'
      entityId: string | null
      overallStatus: string | null
      greenCount: number
      yellowCount: number
      redCount: number
      items: Array<{
        category: string
        status: string
        reason: string
        advisorOverride: boolean
      }>
    }
  | {
      kind: 'data_room_manifest'
      entityId: string | null
      docCount: number
      ndaSignedBuyerCount: number
      docs: Array<{
        filename: string
        category: string
        version: number
        uploadedAt: string
        accessGate: string
      }>
    }
  | {
      kind: 'legal_readiness'
      entityId: string | null
      jurisdiction: string
      dealStructure: string
      buyerReleaseStatus: string
      counselReviewRequired: boolean
      clearCount: number
      reviewCount: number
      blockedCount: number
      items: Array<{
        category: string
        status: string
        title: string
        owner: string
        requiredBefore: string
        reason: string
      }>
    }
  | {
      kind: 'data_room_upload'
      status: 'pending_approval'
      category: string
      label: string
      reason?: string
      accessGate: string
      submitPath?: string
      maxSizeBytes?: number
      accept?: string
    }
  | {
      kind: 'dd_override'
      status: 'pending_approval'
      category: string
      newStatus: string
      rationale: string
      submitPath?: string
    }
  | {
      kind: 'im_regenerate'
      status: 'pending_approval'
      sectionKey: string
      currentConfidence: string | null
      reason: string
      submitPath?: string
    }
  | {
      kind: 'buyer_invitation'
      status: 'pending_approval'
      buyerEmail: string
      buyerName: string | null
      ndaRequired: boolean
      reason: string
      submitPath?: string
    }
  | {
      kind: 'package_publish'
      status: 'pending_approval' | 'blocked'
      reason: string | null
      missingArtifactTypes: string[]
      notReadyArtifacts: Array<{
        artifactType: string
        status: string
        reason: string
      }>
      legalReleaseStatus: string | null
      packageStatus: string | null
      releaseStatus: string | null
      includedArtifactCount: number
      submitPath?: string
    }
  | {
      kind: 'lawyer_handoff'
      status: 'pending_approval'
      urgency: string
      handoffReason: string
      legalItemCategory: string | null
      submitPath?: string
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
  buyerReadyCards: BuyerReadyToolCard[]
}
