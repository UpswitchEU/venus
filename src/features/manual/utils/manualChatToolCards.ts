import type { ChatMessage } from '@/components/calculator'
import { parseAIChatToolResults } from '@/services/ai/tool-results-parser'

type FieldUpdateCard = NonNullable<ChatMessage['fieldUpdates']>[number]
type NormalisationSuggestionCard = NonNullable<ChatMessage['normalisationSuggestions']>[number]
type ValuationRunCard = NonNullable<ChatMessage['valuationRunRequests']>[number]
type ReportGenerationCard = NonNullable<ChatMessage['reportGenerationRequests']>[number]
type SellabilityRunCard = NonNullable<ChatMessage['sellabilityRunRequests']>[number]
type BelgianCompanyBootstrapCard = NonNullable<ChatMessage['belgianCompanyBootstraps']>[number]
type ClientDataReadinessCard = NonNullable<ChatMessage['clientDataReadinessPreviews']>[number]
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
  belgianCompanyBootstraps?: BelgianCompanyBootstrapCard[]
  clientDataReadinessPreviews?: ClientDataReadinessCard[]
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
  belgianCompanyBootstraps?: readonly unknown[]
  clientDataReadinessPreviews?: readonly unknown[]
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
      case 'bootstrap_belgian_company':
        return { type: 'belgian_company_bootstrap', data }
      case 'get_client_data_readiness':
        return { type: 'client_data_readiness', data }
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
        (cards.belgianCompanyBootstraps?.length ?? 0) > 0 ||
        (cards.clientDataReadinessPreviews?.length ?? 0) > 0 ||
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
    ...(cards.belgianCompanyBootstraps && {
      belgianCompanyBootstraps: [
        ...(message.belgianCompanyBootstraps ?? []),
        ...cards.belgianCompanyBootstraps,
      ],
    }),
    ...(cards.clientDataReadinessPreviews && {
      clientDataReadinessPreviews: [
        ...(message.clientDataReadinessPreviews ?? []),
        ...cards.clientDataReadinessPreviews,
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
