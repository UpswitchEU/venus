import type { ChatMessage, NormalizationItem } from '@/components/calculator'
import { buildManualAiNormalizationSuggestions } from './manualAiNormalizationSuggestions'

/** Restore proposals into the same approval state used by live assistant turns. */
export function restoreManualChatProposals(
  messages: ChatMessage[],
  existing: readonly NormalizationItem[],
  filingYear: number
) {
  const items: NormalizationItem[] = []
  const known = [...existing]
  const fields = new Map<string, NonNullable<ChatMessage['fieldUpdates']>[number]>()
  const restoredMessages = messages.map((message) => {
    for (const update of message.fieldUpdates ?? []) fields.set(update.field, update)
    if (!message.normalisationSuggestions?.length) return message
    const suggestions = message.normalisationSuggestions.flatMap((suggestion, index) => {
      const item = buildManualAiNormalizationSuggestions({
        suggestions: [suggestion],
        filingYear,
        createId: () => `${message.id}-normalization-${index}`,
      }).items[0]
      if (!item) return []
      // Old live cards used random ids. Reuse the persisted decision when the
      // same proposal is restored with a stable history id, instead of adding it twice.
      const match = known.find(
        (knownItem) =>
          knownItem.id === item.id ||
          ((knownItem.source === 'ai' ||
            (knownItem.source === 'manual' && knownItem.reason === item.reason)) &&
            knownItem.year === item.year &&
            knownItem.backendCategory === item.backendCategory &&
            knownItem.adjustment === item.adjustment &&
            knownItem.ledgerName === item.ledgerName)
      )
      const current = match ?? item
      if (!match) {
        items.push(item)
        known.push(item)
      }
      return {
        ...suggestion,
        id: current.id,
        amount: current.adjustment,
        reason: current.reason ?? suggestion.reason,
        status: current.status,
      }
    })
    return { ...message, normalisationSuggestions: suggestions }
  })
  return { messages: restoredMessages, items, fieldUpdates: [...fields.values()] }
}
