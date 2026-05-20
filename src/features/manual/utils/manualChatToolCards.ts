import type { ChatMessage } from '@/components/calculator'
import { parseAIChatToolResults } from '@/services/ai/tool-results-parser'

type FieldUpdateCard = NonNullable<ChatMessage['fieldUpdates']>[number]
type NormalisationSuggestionCard = NonNullable<ChatMessage['normalisationSuggestions']>[number]
type ValuationRunCard = NonNullable<ChatMessage['valuationRunRequests']>[number]
type ReportGenerationCard = NonNullable<ChatMessage['reportGenerationRequests']>[number]
type SellabilityRunCard = NonNullable<ChatMessage['sellabilityRunRequests']>[number]
type OwnerProfileAnswerCard = NonNullable<ChatMessage['ownerProfileAnswerRequests']>[number]
type IntegrationConnectCard = NonNullable<ChatMessage['integrationConnectRequests']>[number]
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
type ProposalCardKey =
  | 'valuationRunRequests'
  | 'reportGenerationRequests'
  | 'sellabilityRunRequests'
  | 'listingCreateRequests'
type SellabilityComputedScore = NonNullable<SellabilityRunCard['computedScore']>

export interface ManualChatToolCards {
  fieldUpdates?: FieldUpdateCard[]
  normalisationSuggestions?: NormalisationSuggestionCard[]
  valuationRunRequests?: ValuationRunCard[]
  reportGenerationRequests?: ReportGenerationCard[]
  sellabilityRunRequests?: SellabilityRunCard[]
  ownerProfileAnswerRequests?: OwnerProfileAnswerCard[]
  integrationConnectRequests?: IntegrationConnectCard[]
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
}

interface ManualChatToolCardsInput {
  fieldUpdates?: readonly unknown[]
  normalisationSuggestions?: readonly unknown[]
  valuationRunRequests?: readonly unknown[]
  reportGenerationRequests?: readonly unknown[]
  sellabilityRunRequests?: readonly unknown[]
  ownerProfileAnswerRequests?: readonly unknown[]
  integrationConnectRequests?: readonly unknown[]
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
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function pushIfAny<T>(target: ManualChatToolCards, key: keyof ManualChatToolCards, values: T[]) {
  if (values.length > 0) {
    ;(target as Record<keyof ManualChatToolCards, unknown>)[key] = values
  }
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
  pushIfAny(
    out,
    'normalisationSuggestions',
    (cards.normalisationSuggestions ?? []).map(
      (suggestion) =>
        ({
          ...(asRecord(suggestion) ?? {}),
          id: createId(),
          status: 'pending',
          multiple: 5.2,
        }) as NormalisationSuggestionCard
    )
  )
  pushIfAny(
    out,
    'valuationRunRequests',
    (cards.valuationRunRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as ValuationRunCard
    )
  )
  pushIfAny(
    out,
    'reportGenerationRequests',
    (cards.reportGenerationRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as ReportGenerationCard
    )
  )
  pushIfAny(
    out,
    'sellabilityRunRequests',
    (cards.sellabilityRunRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as SellabilityRunCard
    )
  )
  pushIfAny(
    out,
    'ownerProfileAnswerRequests',
    (cards.ownerProfileAnswerRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as OwnerProfileAnswerCard
    )
  )
  pushIfAny(
    out,
    'integrationConnectRequests',
    (cards.integrationConnectRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as IntegrationConnectCard
    )
  )
  pushIfAny(
    out,
    'secureCredentialRequests',
    (cards.secureCredentialRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as SecureCredentialCard
    )
  )
  pushIfAny(
    out,
    'csvUploadRequests',
    (cards.csvUploadRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as CsvUploadCard
    )
  )
  pushIfAny(
    out,
    'multiSelectRequests',
    (cards.multiSelectRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as MultiSelectCard
    )
  )
  pushIfAny(
    out,
    'singleSelectRequests',
    (cards.singleSelectRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as SingleSelectCard
    )
  )
  pushIfAny(
    out,
    'clientCreateRequests',
    (cards.clientCreateRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as ClientCreateCard
    )
  )
  pushIfAny(
    out,
    'belgianCompanyBootstraps',
    (cards.belgianCompanyBootstraps ?? []).map(
      (bootstrap) =>
        ({
          ...(asRecord(bootstrap) ?? {}),
          id: createId(),
        }) as BelgianCompanyBootstrapCard
    )
  )
  pushIfAny(
    out,
    'valuationSessionRequests',
    (cards.valuationSessionRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as ValuationSessionCard
    )
  )
  pushIfAny(
    out,
    'clientDataReadinessPreviews',
    (cards.clientDataReadinessPreviews ?? []).map(
      (preview) =>
        ({
          ...(asRecord(preview) ?? {}),
          id: createId(),
        }) as ClientDataReadinessCard
    )
  )
  pushIfAny(
    out,
    'importReviewRequests',
    (cards.importReviewRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as ImportReviewCard
    )
  )
  pushIfAny(
    out,
    'methodReadinessPreviews',
    (cards.methodReadinessPreviews ?? []).map(
      (preview) =>
        ({
          ...(asRecord(preview) ?? {}),
          id: createId(),
        }) as MethodReadinessCard
    )
  )
  pushIfAny(
    out,
    'listingPreviews',
    (cards.listingPreviews ?? []).map(
      (preview) =>
        ({
          ...(asRecord(preview) ?? {}),
          id: createId(),
        }) as ListingPreviewCard
    )
  )
  pushIfAny(
    out,
    'listingCreateRequests',
    (cards.listingCreateRequests ?? []).map(
      (request) =>
        ({
          ...(asRecord(request) ?? {}),
          id: createId(),
        }) as ListingCreateCard
    )
  )
  pushIfAny(
    out,
    'buyerProfilePreviews',
    (cards.buyerProfilePreviews ?? []).map(
      (preview) =>
        ({
          ...(asRecord(preview) ?? {}),
          id: createId(),
        }) as BuyerProfilePreviewCard
    )
  )
  pushIfAny(
    out,
    'registrySearchResults',
    (cards.registrySearchResults ?? []).map(
      (entry) =>
        ({
          ...(asRecord(entry) ?? {}),
          id: createId(),
        }) as RegistrySearchResultsCard
    )
  )

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
      case 'get_listing_preview':
        return { type: 'listing_preview', data }
      case 'create_listing':
        return { type: 'listing_create_request', data }
      case 'get_buyer_profile_preview':
        return { type: 'buyer_profile_preview', data }
      case 'search_kbo_registry':
      case 'search_kvk_registry':
        return { type: 'registry_search_results', data }
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
  return Boolean(
    cards &&
      ((cards.fieldUpdates?.length ?? 0) > 0 ||
        (cards.normalisationSuggestions?.length ?? 0) > 0 ||
        (cards.valuationRunRequests?.length ?? 0) > 0 ||
        (cards.reportGenerationRequests?.length ?? 0) > 0 ||
        (cards.sellabilityRunRequests?.length ?? 0) > 0 ||
        (cards.ownerProfileAnswerRequests?.length ?? 0) > 0 ||
        (cards.integrationConnectRequests?.length ?? 0) > 0 ||
        (cards.secureCredentialRequests?.length ?? 0) > 0 ||
        (cards.csvUploadRequests?.length ?? 0) > 0 ||
        (cards.multiSelectRequests?.length ?? 0) > 0 ||
        (cards.singleSelectRequests?.length ?? 0) > 0 ||
        (cards.clientCreateRequests?.length ?? 0) > 0 ||
        (cards.belgianCompanyBootstraps?.length ?? 0) > 0 ||
        (cards.valuationSessionRequests?.length ?? 0) > 0 ||
        (cards.clientDataReadinessPreviews?.length ?? 0) > 0 ||
        (cards.importReviewRequests?.length ?? 0) > 0 ||
        (cards.methodReadinessPreviews?.length ?? 0) > 0 ||
        (cards.listingPreviews?.length ?? 0) > 0 ||
        (cards.listingCreateRequests?.length ?? 0) > 0 ||
        (cards.buyerProfilePreviews?.length ?? 0) > 0 ||
        (cards.registrySearchResults?.length ?? 0) > 0)
  )
}

export function appendManualChatToolCardsToMessage(
  message: ChatMessage,
  cards: ManualChatToolCards
): ChatMessage {
  return {
    ...message,
    ...(cards.fieldUpdates && {
      fieldUpdates: [...(message.fieldUpdates ?? []), ...cards.fieldUpdates],
    }),
    ...(cards.normalisationSuggestions && {
      normalisationSuggestions: [
        ...(message.normalisationSuggestions ?? []),
        ...cards.normalisationSuggestions,
      ],
    }),
    ...(cards.valuationRunRequests && {
      valuationRunRequests: [
        ...(message.valuationRunRequests ?? []),
        ...cards.valuationRunRequests,
      ],
    }),
    ...(cards.reportGenerationRequests && {
      reportGenerationRequests: [
        ...(message.reportGenerationRequests ?? []),
        ...cards.reportGenerationRequests,
      ],
    }),
    ...(cards.sellabilityRunRequests && {
      sellabilityRunRequests: [
        ...(message.sellabilityRunRequests ?? []),
        ...cards.sellabilityRunRequests,
      ],
    }),
    ...(cards.ownerProfileAnswerRequests && {
      ownerProfileAnswerRequests: [
        ...(message.ownerProfileAnswerRequests ?? []),
        ...cards.ownerProfileAnswerRequests,
      ],
    }),
    ...(cards.integrationConnectRequests && {
      integrationConnectRequests: [
        ...(message.integrationConnectRequests ?? []),
        ...cards.integrationConnectRequests,
      ],
    }),
    ...(cards.secureCredentialRequests && {
      secureCredentialRequests: [
        ...(message.secureCredentialRequests ?? []),
        ...cards.secureCredentialRequests,
      ],
    }),
    ...(cards.csvUploadRequests && {
      csvUploadRequests: [...(message.csvUploadRequests ?? []), ...cards.csvUploadRequests],
    }),
    ...(cards.multiSelectRequests && {
      multiSelectRequests: [...(message.multiSelectRequests ?? []), ...cards.multiSelectRequests],
    }),
    ...(cards.singleSelectRequests && {
      singleSelectRequests: [
        ...(message.singleSelectRequests ?? []),
        ...cards.singleSelectRequests,
      ],
    }),
    ...(cards.clientCreateRequests && {
      clientCreateRequests: [
        ...(message.clientCreateRequests ?? []),
        ...cards.clientCreateRequests,
      ],
    }),
    ...(cards.belgianCompanyBootstraps && {
      belgianCompanyBootstraps: [
        ...(message.belgianCompanyBootstraps ?? []),
        ...cards.belgianCompanyBootstraps,
      ],
    }),
    ...(cards.valuationSessionRequests && {
      valuationSessionRequests: [
        ...(message.valuationSessionRequests ?? []),
        ...cards.valuationSessionRequests,
      ],
    }),
    ...(cards.clientDataReadinessPreviews && {
      clientDataReadinessPreviews: [
        ...(message.clientDataReadinessPreviews ?? []),
        ...cards.clientDataReadinessPreviews,
      ],
    }),
    ...(cards.importReviewRequests && {
      importReviewRequests: [
        ...(message.importReviewRequests ?? []),
        ...cards.importReviewRequests,
      ],
    }),
    ...(cards.methodReadinessPreviews && {
      methodReadinessPreviews: [
        ...(message.methodReadinessPreviews ?? []),
        ...cards.methodReadinessPreviews,
      ],
    }),
    ...(cards.listingPreviews && {
      listingPreviews: [...(message.listingPreviews ?? []), ...cards.listingPreviews],
    }),
    ...(cards.listingCreateRequests && {
      listingCreateRequests: [
        ...(message.listingCreateRequests ?? []),
        ...cards.listingCreateRequests,
      ],
    }),
    ...(cards.buyerProfilePreviews && {
      buyerProfilePreviews: [
        ...(message.buyerProfilePreviews ?? []),
        ...cards.buyerProfilePreviews,
      ],
    }),
    ...(cards.registrySearchResults && {
      registrySearchResults: [
        ...(message.registrySearchResults ?? []),
        ...cards.registrySearchResults,
      ],
    }),
  }
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
