import type { ChatMessage } from '@/components/calculator'
import { parseAIChatToolResults } from '@/services/ai/tool-results-parser'

type FieldUpdateCard = NonNullable<ChatMessage['fieldUpdates']>[number]
type NormalisationSuggestionCard = NonNullable<ChatMessage['normalisationSuggestions']>[number]
type ValuationRunCard = NonNullable<ChatMessage['valuationRunRequests']>[number]
type ReportGenerationCard = NonNullable<ChatMessage['reportGenerationRequests']>[number]
type SellabilityRunCard = NonNullable<ChatMessage['sellabilityRunRequests']>[number]
type OwnerProfileAnswerCard = NonNullable<ChatMessage['ownerProfileAnswerRequests']>[number]
type IntegrationConnectCard = NonNullable<ChatMessage['integrationConnectRequests']>[number]
type IntegrationSyncCard = NonNullable<ChatMessage['integrationSyncRequests']>[number]
type SyncStatusPreviewCard = NonNullable<ChatMessage['syncStatusPreviews']>[number]
type OwnerReminderCard = NonNullable<ChatMessage['ownerReminderRequests']>[number]
type OwnerInviteAccountantCard = NonNullable<ChatMessage['ownerInviteAccountantRequests']>[number]
type ListingVisibilityCard = NonNullable<ChatMessage['listingVisibilityRequests']>[number]
type ShareTokenCard = NonNullable<ChatMessage['shareTokenRequests']>[number]
type ShareTokenRevokeCard = NonNullable<ChatMessage['shareTokenRevokeRequests']>[number]
type ValuationMethodPreferenceCard = NonNullable<
  ChatMessage['valuationMethodPreferenceRequests']
>[number]
type BulkValuationRunCard = NonNullable<ChatMessage['bulkValuationRunRequests']>[number]
type ListingFieldUpdateCard = NonNullable<ChatMessage['listingFieldUpdateRequests']>[number]
type NormalizationDismissCard = NonNullable<ChatMessage['normalizationDismissRequests']>[number]
type WorkspaceClientsPreviewCard = NonNullable<ChatMessage['workspaceClientsPreviews']>[number]
type ValuationDefaultsCard = NonNullable<ChatMessage['valuationDefaultsRequests']>[number]
type ValuationDefaultsPreviewCard = NonNullable<ChatMessage['valuationDefaultsPreviews']>[number]
type AcknowledgeWarningCard = NonNullable<ChatMessage['acknowledgeWarningRequests']>[number]
type SecureCredentialCard = NonNullable<ChatMessage['secureCredentialRequests']>[number]
type CsvUploadCard = NonNullable<ChatMessage['csvUploadRequests']>[number]
type MultiSelectCard = NonNullable<ChatMessage['multiSelectRequests']>[number]
type SingleSelectCard = NonNullable<ChatMessage['singleSelectRequests']>[number]
type ClientCreateCard = NonNullable<ChatMessage['clientCreateRequests']>[number]
type BelgianCompanyBootstrapCard = NonNullable<ChatMessage['belgianCompanyBootstraps']>[number]
type ValuationSessionCard = NonNullable<ChatMessage['valuationSessionRequests']>[number]
type ClientDataReadinessCard = NonNullable<ChatMessage['clientDataReadinessPreviews']>[number]
type ImportReviewCard = NonNullable<ChatMessage['importReviewRequests']>[number]
type MethodReadinessCard = NonNullable<ChatMessage['methodReadinessPreviews']>[number]
type ListingPreviewCard = NonNullable<ChatMessage['listingPreviews']>[number]
type ListingCreateCard = NonNullable<ChatMessage['listingCreateRequests']>[number]
type BuyerProfilePreviewCard = NonNullable<ChatMessage['buyerProfilePreviews']>[number]
type RegistrySearchResultsCard = NonNullable<ChatMessage['registrySearchResults']>[number]
type BusinessTypeSearchResultsCard = NonNullable<ChatMessage['businessTypeSearchResults']>[number]
type BuyerReadyCard = NonNullable<ChatMessage['buyerReadyCards']>[number]
type ProposalCardKey =
  | 'valuationRunRequests'
  | 'reportGenerationRequests'
  | 'sellabilityRunRequests'
  | 'listingCreateRequests'
type SellabilityComputedScore = NonNullable<SellabilityRunCard['computedScore']>
type ManualChatToolCardKey = keyof ManualChatToolCards & keyof ManualChatToolCardsInput

export interface ManualChatToolCards {
  fieldUpdates?: FieldUpdateCard[]
  normalisationSuggestions?: NormalisationSuggestionCard[]
  valuationRunRequests?: ValuationRunCard[]
  reportGenerationRequests?: ReportGenerationCard[]
  sellabilityRunRequests?: SellabilityRunCard[]
  ownerProfileAnswerRequests?: OwnerProfileAnswerCard[]
  integrationConnectRequests?: IntegrationConnectCard[]
  integrationSyncRequests?: IntegrationSyncCard[]
  syncStatusPreviews?: SyncStatusPreviewCard[]
  ownerReminderRequests?: OwnerReminderCard[]
  ownerInviteAccountantRequests?: OwnerInviteAccountantCard[]
  listingVisibilityRequests?: ListingVisibilityCard[]
  shareTokenRequests?: ShareTokenCard[]
  shareTokenRevokeRequests?: ShareTokenRevokeCard[]
  valuationMethodPreferenceRequests?: ValuationMethodPreferenceCard[]
  bulkValuationRunRequests?: BulkValuationRunCard[]
  listingFieldUpdateRequests?: ListingFieldUpdateCard[]
  normalizationDismissRequests?: NormalizationDismissCard[]
  workspaceClientsPreviews?: WorkspaceClientsPreviewCard[]
  valuationDefaultsRequests?: ValuationDefaultsCard[]
  valuationDefaultsPreviews?: ValuationDefaultsPreviewCard[]
  acknowledgeWarningRequests?: AcknowledgeWarningCard[]
  secureCredentialRequests?: SecureCredentialCard[]
  csvUploadRequests?: CsvUploadCard[]
  multiSelectRequests?: MultiSelectCard[]
  singleSelectRequests?: SingleSelectCard[]
  clientCreateRequests?: ClientCreateCard[]
  belgianCompanyBootstraps?: BelgianCompanyBootstrapCard[]
  valuationSessionRequests?: ValuationSessionCard[]
  clientDataReadinessPreviews?: ClientDataReadinessCard[]
  importReviewRequests?: ImportReviewCard[]
  methodReadinessPreviews?: MethodReadinessCard[]
  listingPreviews?: ListingPreviewCard[]
  listingCreateRequests?: ListingCreateCard[]
  buyerProfilePreviews?: BuyerProfilePreviewCard[]
  registrySearchResults?: RegistrySearchResultsCard[]
  businessTypeSearchResults?: BusinessTypeSearchResultsCard[]
  buyerReadyCards?: BuyerReadyCard[]
}

interface ManualChatToolCardsInput {
  fieldUpdates?: readonly unknown[]
  normalisationSuggestions?: readonly unknown[]
  valuationRunRequests?: readonly unknown[]
  reportGenerationRequests?: readonly unknown[]
  sellabilityRunRequests?: readonly unknown[]
  ownerProfileAnswerRequests?: readonly unknown[]
  integrationConnectRequests?: readonly unknown[]
  integrationSyncRequests?: readonly unknown[]
  syncStatusPreviews?: readonly unknown[]
  ownerReminderRequests?: readonly unknown[]
  ownerInviteAccountantRequests?: readonly unknown[]
  listingVisibilityRequests?: readonly unknown[]
  shareTokenRequests?: readonly unknown[]
  shareTokenRevokeRequests?: readonly unknown[]
  valuationMethodPreferenceRequests?: readonly unknown[]
  bulkValuationRunRequests?: readonly unknown[]
  listingFieldUpdateRequests?: readonly unknown[]
  normalizationDismissRequests?: readonly unknown[]
  workspaceClientsPreviews?: readonly unknown[]
  valuationDefaultsRequests?: readonly unknown[]
  valuationDefaultsPreviews?: readonly unknown[]
  acknowledgeWarningRequests?: readonly unknown[]
  secureCredentialRequests?: readonly unknown[]
  csvUploadRequests?: readonly unknown[]
  multiSelectRequests?: readonly unknown[]
  singleSelectRequests?: readonly unknown[]
  clientCreateRequests?: readonly unknown[]
  belgianCompanyBootstraps?: readonly unknown[]
  valuationSessionRequests?: readonly unknown[]
  clientDataReadinessPreviews?: readonly unknown[]
  importReviewRequests?: readonly unknown[]
  methodReadinessPreviews?: readonly unknown[]
  listingPreviews?: readonly unknown[]
  listingCreateRequests?: readonly unknown[]
  buyerProfilePreviews?: readonly unknown[]
  registrySearchResults?: readonly unknown[]
  businessTypeSearchResults?: readonly unknown[]
  buyerReadyCards?: readonly unknown[]
}

const MANUAL_CHAT_TOOL_CARD_KEYS = [
  'fieldUpdates',
  'normalisationSuggestions',
  'valuationRunRequests',
  'reportGenerationRequests',
  'sellabilityRunRequests',
  'ownerProfileAnswerRequests',
  'integrationConnectRequests',
  'integrationSyncRequests',
  'syncStatusPreviews',
  'ownerInviteAccountantRequests',
  'ownerReminderRequests',
  'listingVisibilityRequests',
  'shareTokenRequests',
  'shareTokenRevokeRequests',
  'valuationMethodPreferenceRequests',
  'bulkValuationRunRequests',
  'listingFieldUpdateRequests',
  'normalizationDismissRequests',
  'workspaceClientsPreviews',
  'valuationDefaultsRequests',
  'valuationDefaultsPreviews',
  'acknowledgeWarningRequests',
  'secureCredentialRequests',
  'csvUploadRequests',
  'multiSelectRequests',
  'singleSelectRequests',
  'clientCreateRequests',
  'belgianCompanyBootstraps',
  'valuationSessionRequests',
  'clientDataReadinessPreviews',
  'importReviewRequests',
  'methodReadinessPreviews',
  'listingPreviews',
  'listingCreateRequests',
  'buyerProfilePreviews',
  'registrySearchResults',
  'businessTypeSearchResults',
  'buyerReadyCards',
] as const satisfies readonly ManualChatToolCardKey[]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function pushIfAny<T>(target: ManualChatToolCards, key: keyof ManualChatToolCards, values: T[]) {
  if (values.length > 0) {
    ;(target as Record<keyof ManualChatToolCards, unknown>)[key] = values
  }
}

function cardWithGeneratedId(
  key: ManualChatToolCardKey,
  value: unknown,
  createId: () => string
): Record<string, unknown> {
  const base = asRecord(value) ?? {}
  const card = {
    ...base,
    id: createId(),
  }

  if (key === 'normalisationSuggestions') {
    return {
      ...card,
      status: 'pending',
      multiple: 5.2,
    }
  }

  return card
}

export function addIdsToManualChatToolCards(
  cards: ManualChatToolCardsInput,
  createId: () => string
): ManualChatToolCards {
  const out: ManualChatToolCards = {}

  pushIfAny(
    out,
    'fieldUpdates',
    (cards.fieldUpdates ?? []).map((fieldUpdate) => fieldUpdate as FieldUpdateCard)
  )
  for (const key of MANUAL_CHAT_TOOL_CARD_KEYS) {
    if (key === 'fieldUpdates') continue
    pushIfAny(
      out,
      key,
      (cards[key] ?? []).map((card) => cardWithGeneratedId(key, card, createId))
    )
  }

  return out
}

export function parseManualChatStreamToolResult(
  toolName: string,
  result: unknown,
  createId: () => string
): ManualChatToolCards | null {
  const data = asRecord(result)
  if (!data) return null

  const parserEntry = (() => {
    switch (toolName) {
      case 'update_field_value':
        return data.update ? { type: 'field_update', data } : null
      case 'suggest_normalization':
        return data.suggestion ? { type: 'normalization_suggestion', data: data.suggestion } : null
      case 'suggest_normalization_batch':
        return { type: 'normalization_suggestion_batch', data }
      case 'run_valuation':
        return { type: 'valuation_run_request', data }
      case 'generate_report':
        return { type: 'report_generation_request', data }
      case 'run_sellability':
        return { type: 'sellability_run_request', data }
      case 'update_owner_profile_answer':
        return { type: 'owner_profile_answer_request', data }
      case 'propose_integration_connect':
        return { type: 'integration_connect_request', data }
      case 'propose_integration_sync':
        return { type: 'integration_sync_request', data }
      case 'propose_owner_reminder':
        return { type: 'owner_reminder_request', data }
      case 'propose_listing_visibility':
        return { type: 'listing_visibility_request', data }
      case 'propose_share_token':
        return { type: 'share_token_request', data }
      case 'propose_share_token_revoke':
        return { type: 'share_token_revoke_request', data }
      case 'propose_valuation_method_preference':
        return { type: 'valuation_method_preference_request', data }
      case 'propose_valuation_defaults':
        return { type: 'valuation_defaults_request', data }
      case 'propose_bulk_valuation_run':
        return { type: 'bulk_valuation_run_request', data }
      case 'propose_listing_field_update':
        return { type: 'listing_field_update_request', data }
      case 'propose_normalization_dismiss':
        return { type: 'normalization_dismiss_request', data }
      case 'get_workspace_clients':
        return { type: 'workspace_clients', data }
      case 'get_valuation_defaults':
        return { type: 'valuation_defaults', data }
      case 'propose_acknowledge_warning':
        return { type: 'acknowledge_warning_request', data }
      case 'propose_secure_credential':
        return { type: 'secure_credential_request', data }
      case 'propose_csv_upload':
        return { type: 'csv_upload_request', data }
      case 'propose_multi_select':
        return { type: 'multi_select_request', data }
      case 'propose_single_select':
        return { type: 'single_select_request', data }
      case 'create_client':
        return { type: 'client_create_request', data }
      case 'bootstrap_belgian_company':
        return { type: 'belgian_company_bootstrap', data }
      case 'start_client_valuation':
        return { type: 'valuation_session_request', data }
      case 'get_client_data_readiness':
        return { type: 'client_data_readiness', data }
      case 'open_import_review':
        return { type: 'import_review_request', data }
      case 'get_method_readiness':
        return { type: 'method_readiness', data }
      case 'get_sync_status':
        return { type: 'sync_status', data }
      case 'propose_owner_invite_accountant':
        return { type: 'owner_invite_accountant_request', data }
      case 'get_listing_preview':
        return { type: 'listing_preview', data }
      case 'create_listing':
        return { type: 'listing_create_request', data }
      case 'get_buyer_profile_preview':
        return { type: 'buyer_profile_preview', data }
      case 'search_business_types':
        return { type: 'business_type_search_results', data }
      case 'search_kbo_registry':
      case 'search_kvk_registry':
      case 'search_companies_house_registry':
        return { type: 'registry_search_results', data }
      case 'advisor_add_client_widget':
        return { type: 'add_client_widget', data }
      case 'get_buyer_ready_package':
        return { type: 'buyer_ready_package_status', data }
      case 'generate_buyer_ready_package':
        return { type: 'buyer_ready_package_generation_request', data }
      case 'get_dd_checklist':
        return { type: 'dd_checklist', data }
      case 'get_data_room_manifest':
        return { type: 'data_room_manifest', data }
      case 'get_legal_readiness':
        return { type: 'legal_readiness', data }
      case 'propose_data_room_upload':
        return { type: 'data_room_upload_request', data }
      case 'propose_mark_dd_item':
        return { type: 'dd_override_request', data }
      case 'regenerate_im_section':
        return { type: 'im_regenerate_request', data }
      case 'propose_buyer_invitation':
        return { type: 'buyer_invitation_request', data }
      case 'propose_package_publish':
        return { type: 'package_publish_request', data }
      case 'request_lawyer_handoff':
        return { type: 'lawyer_handoff_request', data }
      default:
        return null
    }
  })()

  if (!parserEntry) return null
  const parsed = parseAIChatToolResults([parserEntry])
  const cards = addIdsToManualChatToolCards(parsed, createId)
  return manualChatToolCardsHasContent(cards) ? cards : null
}

export function manualChatToolCardsHasContent(cards: ManualChatToolCards | null | undefined) {
  return Boolean(cards && MANUAL_CHAT_TOOL_CARD_KEYS.some((key) => (cards[key]?.length ?? 0) > 0))
}

export function appendManualChatToolCardsToMessage(
  message: ChatMessage,
  cards: ManualChatToolCards
): ChatMessage {
  const appended: Record<string, unknown> = {}
  const sourceMessage = message as unknown as Record<string, unknown>

  for (const key of MANUAL_CHAT_TOOL_CARD_KEYS) {
    const incoming = cards[key]
    if (!incoming) continue
    const existing = sourceMessage[key]
    appended[key] = [...(Array.isArray(existing) ? existing : []), ...incoming]
  }

  return { ...message, ...appended }
}

export function appendManualChatToolCardsToMessages(
  messages: ChatMessage[],
  messageId: string,
  cards: ManualChatToolCards
): ChatMessage[] {
  return messages.map((message) =>
    message.id === messageId ? appendManualChatToolCardsToMessage(message, cards) : message
  )
}

export function markManualChatProposalDecision(
  messages: ChatMessage[],
  key: ProposalCardKey,
  proposalId: string,
  decision: 'approved' | 'rejected'
): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    [key]: message[key]?.map((request) =>
      request.id === proposalId ? { ...request, decision } : request
    ),
  }))
}

export function applyManualChatSellabilityComputedScore(
  messages: ChatMessage[],
  proposalId: string,
  computedScore: SellabilityComputedScore
): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    sellabilityRunRequests: message.sellabilityRunRequests?.map((request) =>
      request.id === proposalId ? { ...request, computedScore } : request
    ),
  }))
}
