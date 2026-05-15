import type { ChatMessage } from '@/components/calculator'
import { parseAIChatToolResults } from '@/services/ai/tool-results-parser'

type FieldUpdateCard = NonNullable<ChatMessage['fieldUpdates']>[number]
type NormalisationSuggestionCard = NonNullable<ChatMessage['normalisationSuggestions']>[number]
type ValuationRunCard = NonNullable<ChatMessage['valuationRunRequests']>[number]
type ReportGenerationCard = NonNullable<ChatMessage['reportGenerationRequests']>[number]
type SellabilityRunCard = NonNullable<ChatMessage['sellabilityRunRequests']>[number]
type ProposalCardKey =
  | 'valuationRunRequests'
  | 'reportGenerationRequests'
  | 'sellabilityRunRequests'
type SellabilityComputedScore = NonNullable<SellabilityRunCard['computedScore']>

export interface ManualChatToolCards {
  fieldUpdates?: FieldUpdateCard[]
  normalisationSuggestions?: NormalisationSuggestionCard[]
  valuationRunRequests?: ValuationRunCard[]
  reportGenerationRequests?: ReportGenerationCard[]
  sellabilityRunRequests?: SellabilityRunCard[]
}

interface ManualChatToolCardsInput {
  fieldUpdates?: readonly unknown[]
  normalisationSuggestions?: readonly unknown[]
  valuationRunRequests?: readonly unknown[]
  reportGenerationRequests?: readonly unknown[]
  sellabilityRunRequests?: readonly unknown[]
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
        (cards.sellabilityRunRequests?.length ?? 0) > 0)
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
