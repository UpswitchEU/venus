import type {
  AcknowledgeWarningRequest,
  BelgianCompanyBootstrap,
  BulkValuationRunRequest,
  BusinessTypeSearchResults,
  BuyerProfilePreview,
  BuyerReadyToolCard,
  ChatTask,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  ImportReviewRequest,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingCreateRequest,
  ListingFieldUpdateRequest,
  ListingPreview,
  ListingVisibilityRequest,
  MethodReadinessPreview,
  MultiSelectRequest,
  NormalizationDismissRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  RegistrySearchResultsPreview,
  ReportGenerationRequest,
  SecureCredentialRequest,
  SellabilityRunRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  SyncStatusPreview,
  ValuationDefaultsPreview,
  ValuationDefaultsRequest,
  ValuationMethodPreferenceRequest,
  ValuationRunRequest,
  ValuationSessionRequest,
  WorkspaceClientsPreview,
} from './ChatAssistantAgentActionTypes'

export type {
  AcknowledgeWarningRequest,
  AgentChoiceSelection,
  BelgianCompanyBootstrap,
  BulkValuationRunRequest,
  BusinessTypeSearchResults,
  BuyerProfilePreview,
  BuyerReadyToolCard,
  ChatTask,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  ImportReviewRequest,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingCreateRequest,
  ListingFieldUpdateRequest,
  ListingPreview,
  ListingVisibilityRequest,
  MethodReadinessPreview,
  MultiSelectRequest,
  NormalizationDismissRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  RegistrySearchResultsPreview,
  ReportGenerationRequest,
  SecureCredentialRequest,
  SellabilityRunRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  SyncStatusPreview,
  ValuationDefaultsPreview,
  ValuationDefaultsRequest,
  ValuationMethodPreferenceRequest,
  ValuationRunRequest,
  ValuationSessionRequest,
  WorkspaceClientsPreview,
} from './ChatAssistantAgentActionTypes'

export interface FieldUpdate {
  field: string
  value: number
  label: string
  // YC-Standard: Impact framing + provenance
  impact?: {
    ebitdaDelta: number // e.g., +60000
    valuationDelta: number // e.g., +312000 (at 5.2x)
    multiple?: number // e.g., 5.2
  }
  source?: 'yuki' | 'exact' | 'manual' | 'ai' | 'kbo'
  grootboekCode?: string
  confidence?: 'high' | 'medium' | 'low'
}

export interface NormalisationSuggestion {
  id: string
  code: string
  description: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  amount: number
  reason: string
  sourceRef?: string
  status: 'pending' | 'accepted' | 'rejected'
  // Impact calculation
  ebitdaImpact?: number
  valuationImpact?: number
  multiple?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isError?: boolean
  /** Response came from dossier-aware local fallback while AI was unavailable. */
  isOfflineFallback?: boolean
  /** Titan rejected the turn until the user grants AI-processing consent. */
  requiresConsent?: boolean
  /** The BFF could not authenticate the browser session. */
  requiresAuth?: boolean
  consentPolicyVersion?: string
  attachments?: { name: string; type: string; url: string }[]
  // YC-Standard: Structured cards with impact framing
  fieldUpdates?: FieldUpdate[]
  // AI-generated normalization suggestions with accept/reject
  normalisationSuggestions?: NormalisationSuggestion[]
  // AI-proposed valuation runs (from run_valuation tool) — propose-only, user clicks Run
  valuationRunRequests?: ValuationRunRequest[]
  // AI-proposed PDF generations (from generate_report tool) — propose-only, user clicks Generate
  reportGenerationRequests?: ReportGenerationRequest[]
  // AI-proposed Sellability computes (from run_sellability tool) — propose-only, user clicks Compute
  sellabilityRunRequests?: SellabilityRunRequest[]
  // Agentic owner-onboarding and advisor workflow cards.
  ownerProfileAnswerRequests?: OwnerProfileAnswerRequest[]
  integrationConnectRequests?: IntegrationConnectRequest[]
  integrationSyncRequests?: IntegrationSyncRequest[]
  syncStatusPreviews?: SyncStatusPreview[]
  ownerReminderRequests?: OwnerReminderRequest[]
  ownerInviteAccountantRequests?: OwnerInviteAccountantRequest[]
  listingVisibilityRequests?: ListingVisibilityRequest[]
  shareTokenRequests?: ShareTokenRequest[]
  shareTokenRevokeRequests?: ShareTokenRevokeRequest[]
  valuationMethodPreferenceRequests?: ValuationMethodPreferenceRequest[]
  bulkValuationRunRequests?: BulkValuationRunRequest[]
  listingFieldUpdateRequests?: ListingFieldUpdateRequest[]
  normalizationDismissRequests?: NormalizationDismissRequest[]
  workspaceClientsPreviews?: WorkspaceClientsPreview[]
  valuationDefaultsRequests?: ValuationDefaultsRequest[]
  valuationDefaultsPreviews?: ValuationDefaultsPreview[]
  acknowledgeWarningRequests?: AcknowledgeWarningRequest[]
  secureCredentialRequests?: SecureCredentialRequest[]
  csvUploadRequests?: CsvUploadRequest[]
  multiSelectRequests?: MultiSelectRequest[]
  singleSelectRequests?: SingleSelectRequest[]
  clientCreateRequests?: ClientCreateRequest[]
  // AI-generated Belgian public-data bootstrap cards (KBO + NBB/CBSO + benchmark preview)
  belgianCompanyBootstraps?: BelgianCompanyBootstrap[]
  // AI-proposed advisor valuation-session handoffs.
  valuationSessionRequests?: ValuationSessionRequest[]
  // AI-generated advisor-client readiness cards (Hermes import state)
  clientDataReadinessPreviews?: ClientDataReadinessPreview[]
  // AI-proposed import-review handoffs.
  importReviewRequests?: ImportReviewRequest[]
  // AI-generated valuation-method readiness cards (read-only; pre-ValuationIQ run)
  methodReadinessPreviews?: MethodReadinessPreview[]
  // AI-generated listing previews (read-only anonymized marketplace draft)
  listingPreviews?: ListingPreview[]
  // AI-proposed marketplace listings (from create_listing tool) — propose-only, user opens wizard
  listingCreateRequests?: ListingCreateRequest[]
  // AI-generated buyer profile previews (read-only; not real matched buyers)
  buyerProfilePreviews?: BuyerProfilePreview[]
  // AI-generated buyer-ready, IM, legal, data-room and publish workflow cards.
  buyerReadyCards?: BuyerReadyToolCard[]
  /**
   * Read-only business-type shortlist rendered when the agent calls
   * search_business_types. Click a row to fire a follow-up
   * "Use business type {title} ({id})" message so the agent can continue
   * with benchmarks, method readiness, or profile completion.
   */
  businessTypeSearchResults?: BusinessTypeSearchResults[]
  /**
   * Read-only registry-search picker rendered when the agent calls
   * search_kbo_registry (BE), search_kvk_registry (NL), or
   * search_companies_house_registry (GB). Click a row to fire a follow-up
   * "Use {name} ({registry} {number})" message and let the agent chain.
   * Mirrors the Mercury RegistrySearchResultsCard.
   */
  registrySearchResults?: RegistrySearchResultsPreview[]
  // Task-driven: open tasks the user can complete
  tasks?: ChatTask[]
}

export interface FieldContext {
  field: string
  label: string
  value?: unknown
  hint?: string
}

export interface SuggestionContext {
  fieldContext?: FieldContext
  hasReport?: boolean
  hasEbitda?: boolean
  hasFinancials?: boolean
  pendingNormalizationsCount?: number
  acceptedNormalizationsCount?: number
  hasCapBreach?: boolean
}

/**
 * High-severity data-quality warning surfaced from the engine.
 *
 * Shape mirrors `response.data_quality_warnings[i]` produced by ValuationIQ
 * (Pass-3 aggregation). The drawer renders these as actionable cards so
 * advisors resolve issues IN the assistant — not on the final report. The
 * goal is a clean, defensible PDF; the assistant catches the problems first.
 */
/** One field in a warning's inline fix form (label/hint already localized). */
export interface QualityWarningInlineFixField {
  /** Key on `current_year_data` written to the form + sent to the engine. */
  key: string
  label: string
  hint?: string
}

export interface QualityWarning {
  type: string
  severity: 'high' | 'medium' | 'low' | string
  message?: string
  recommendation?: string
  step_number?: number
  /** Locale-prepared CTA label (e.g. "Fix sector"). */
  cta_label?: string
  /** Optional command the CTA sends to the assistant verbatim. */
  cta_prompt?: string
  /**
   * When present, the CTA opens a small inline form (these fields) that writes
   * straight to the valuation and recalculates — no chat turn, no live session.
   */
  inlineFix?: { fields: QualityWarningInlineFixField[] }
  /**
   * When present, the CTA scrolls to an existing form control (a "picker gap"
   * like sector or method) instead of opening a chat turn. `anchor` is a DOM id
   * rendered by the manual input panel.
   */
  jump?: { anchor: string }
}

export interface StartupAssistantIssue {
  id: string
  severity: 'block' | 'warn' | 'info'
  title: string
  body: string
  action: string
  ctaLabel: string
  ctaPrompt: string
  quickFixLabel?: string
  jumpLabel?: string
}
