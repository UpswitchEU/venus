import type {
  AcknowledgeWarningRequest,
  AdvisorCopilotDraft,
  BelgianCompanyBootstrap,
  BusinessTypeSearchResults,
  BuyerProfilePreview,
  BuyerReadyToolCard,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  FieldUpdateParsed,
  ImportReviewRequest,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingCreateRequest,
  ListingPreview,
  ListingVisibilityRequest,
  MethodReadinessPreview,
  MultiSelectRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  RegistrySearchResults,
  ReportGenerationRequest,
  SecureCredentialRequest,
  SellabilityRunRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  SyncStatusPreview,
  ValuationMethodPreferenceRequest,
  ValuationRunRequest,
  ValuationSessionRequest,
} from './tool-results-parser'

export interface AIChatResponse {
  success: boolean
  content: string
  conversationId?: string
  /** Set when the server returned 402 (quota exhausted). */
  requires_upgrade?: boolean
  /** Set when Titan returned 412 because AI-processing consent is missing. */
  requires_consent?: boolean
  /** Set when the BFF cannot authenticate the browser session. */
  requires_auth?: boolean
  code?: string
  currentPolicyVersion?: string
  hasHistoricConsent?: boolean
  ai_credits_remaining?: number
  ai_credits_limit?: number
  fieldUpdates?: Array<{
    field: string
    value: FieldUpdateParsed['value']
    label: string
    grootboekCode?: string
    source?: 'ai' | 'manual' | 'yuki' | 'exact' | 'kbo'
    confidence?: 'high' | 'medium' | 'low'
    impact?: {
      ebitdaDelta: number
      valuationDelta: number
      multiple?: number
    }
  }>
  normalisationSuggestions?: unknown[]
  /**
   * Pending valuation-run proposals from the AI. Each entry surfaces an inline
   * "Run valuation now" action card; calculation only fires after the user
   * approves (consumes 5 credits via the existing /api/v2/valuations/calculate
   * saga). Status `blocked` means the AI tried to propose but required inputs
   * are missing — render as a hint, not an action.
   */
  valuationRunRequests?: ValuationRunRequest[]
  /**
   * Pending PDF-report generation proposals from the AI. Each entry surfaces an
   * inline "Generate PDF" action card; generation only fires after the user
   * approves and reuses the existing valuation (no extra credit). Status
   * `blocked` with reason `no_valuation_yet` means the AI tried to propose
   * before run_valuation produced results — render as a hint to compute first.
   */
  reportGenerationRequests?: ReportGenerationRequest[]
  /**
   * Pending Sellability-compute proposals from the AI. Each entry surfaces an
   * inline "Compute now" action card; the compute fires via the Venus proxy at
   * `/api/sellability/score` (which forwards to Titan's
   * `/api/v2/sellability/score`). Free (no credit). Status `blocked` with
   * reason `profile_incomplete` means Q1/Q2/Q3 must be filled in the owner
   * profile first — render as a hint, not an action.
   */
  sellabilityRunRequests?: SellabilityRunRequest[]
  /** Owner-profile answer proposals from Titan's owner onboarding flow. */
  ownerProfileAnswerRequests?: OwnerProfileAnswerRequest[]
  /** Accounting integration connection proposals. */
  integrationConnectRequests?: IntegrationConnectRequest[]
  /** Accounting sync proposals for already-connected integrations. */
  integrationSyncRequests?: IntegrationSyncRequest[]
  /** Read-only sync status answers for already-connected integrations. */
  syncStatusPreviews?: SyncStatusPreview[]
  /** Owner-side proposal to invite their accountant into the workflow. */
  ownerInviteAccountantRequests?: OwnerInviteAccountantRequest[]
  /** Owner profile reminder proposals. */
  ownerReminderRequests?: OwnerReminderRequest[]
  /** Marketplace listing visibility toggle proposals. */
  listingVisibilityRequests?: ListingVisibilityRequest[]
  /** Private marketplace share-token mint proposals. */
  shareTokenRequests?: ShareTokenRequest[]
  /** Private marketplace share-token revoke proposals. */
  shareTokenRevokeRequests?: ShareTokenRevokeRequest[]
  /** Per-client valuation-method override proposals. */
  valuationMethodPreferenceRequests?: ValuationMethodPreferenceRequest[]
  /** Mercury import-review warning acknowledgements that Venus bridges back to Mercury. */
  acknowledgeWarningRequests?: AcknowledgeWarningRequest[]
  /** Secure credential form proposals. Credentials must never be sent through chat text. */
  secureCredentialRequests?: SecureCredentialRequest[]
  /** CSV upload proposals for trial-balance or bulk-client import. */
  csvUploadRequests?: CsvUploadRequest[]
  /** Generic multi-choice agent forms. */
  multiSelectRequests?: MultiSelectRequest[]
  /** Generic single-choice agent forms. */
  singleSelectRequests?: SingleSelectRequest[]
  /** Advisor client creation proposals. */
  clientCreateRequests?: ClientCreateRequest[]
  /** Read-only Belgian KBO/NBB/CBSO public-data bootstrap cards. */
  belgianCompanyBootstraps?: BelgianCompanyBootstrap[]
  /** Advisor handoff proposals to open a client valuation session. */
  valuationSessionRequests?: ValuationSessionRequest[]
  /** Read-only advisor-client readiness before entering Mercury/Venus valuation. */
  clientDataReadinessPreviews?: ClientDataReadinessPreview[]
  /** Advisor handoff proposals to open Hermes import review. */
  importReviewRequests?: ImportReviewRequest[]
  /** Read-only valuation-method readiness before a paid ValuationIQ run. */
  methodReadinessPreviews?: MethodReadinessPreview[]
  /** Read-only anonymized marketplace-listing drafts from get_listing_preview. */
  listingPreviews?: ListingPreview[]
  /**
   * Pending marketplace-listing proposals from Titan's advisor-scoped
   * create_listing tool. Approve navigates back to Mercury's publish wizard;
   * the tool itself never writes a listing row.
   */
  listingCreateRequests?: ListingCreateRequest[]
  buyerProfilePreviews?: BuyerProfilePreview[]
  /** Buyer-ready/IM/legal/data-room workflow cards parsed from Titan tool envelopes. */
  buyerReadyCards?: BuyerReadyToolCard[]
  /** Advisor-reviewed Co-Pilot drafts for value-up trajectory planning. */
  advisorCopilotDrafts?: AdvisorCopilotDraft[]
  /** Read-only business-type discovery shortlist from search_business_types. */
  businessTypeSearchResults?: BusinessTypeSearchResults[]
  /**
   * Read-only registry-search picker results from `search_kbo_registry`
   * (BE) or `search_kvk_registry` (NL). The drawer renders these as a
   * clickable hit list mirroring the Mercury card. Click a row to send
   * a follow-up "Use {name} ({registry} {number})" message and let
   * the agent chain to the next step.
   */
  registrySearchResults?: RegistrySearchResults[]
  fallback?: boolean
  error?: string
}

export interface StreamCallbacks {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onDone?: (conversationId?: string, meta?: { incomplete?: boolean }) => void
  onError?: (error: string) => void
  /** Called instead of onError when the server returns 402 (quota exhausted). */
  onQuotaExhausted?: (credits: { remaining: number; limit: number }) => void
  /** Called instead of onError when Titan requires AI-processing consent. */
  onConsentRequired?: (payload: {
    message: string
    currentPolicyVersion?: string
    hasHistoricConsent?: boolean
  }) => void
  /** Called instead of onError when the BFF returns 401. */
  onAuthRequired?: (payload: { message: string }) => void
  /** BFF-only meta chunk — skip duplicate client recovery when fallback succeeded. */
  onBffStreamRecovery?: (
    source: 'bff-fallback' | 'bff-fallback-failed' | 'bff-stream-incomplete'
  ) => void
}
