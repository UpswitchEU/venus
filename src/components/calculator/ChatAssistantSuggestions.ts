import type { SuggestionContext } from './ChatAssistantTypes'

const MIN_SUGGESTIONS = 3
const PAD_KEY = 'suggestions.askQuestion'

export type SuggestionItem = { key: string; params?: Record<string, string> }

export function getContextualSuggestionKeys(ctx: SuggestionContext): SuggestionItem[] {
  const { fieldContext, hasReport = false, hasEbitda = false, pendingNormalizationsCount = 0 } = ctx

  const items: SuggestionItem[] = []

  items.push({ key: hasReport ? 'suggestions.explainValue' : 'suggestions.whatWorth' })

  if (!hasReport) {
    items.push({ key: 'suggestions.generateReport' })
  }

  items.push({ key: 'suggestions.whichNorms' })

  if (pendingNormalizationsCount > 0) {
    items.push({ key: 'suggestions.whichNormsApply' })
  }

  if (hasEbitda) {
    const year = extractEbitdaYear(fieldContext?.field, fieldContext?.label)
    items.push(
      year
        ? { key: 'suggestions.explainEbitdaFor', params: { year } }
        : { key: 'suggestions.explainEbitda' }
    )
  }

  while (items.length < MIN_SUGGESTIONS) {
    items.push({ key: PAD_KEY })
  }

  return items
}

function extractEbitdaYear(field?: string, label?: string): string | undefined {
  if (field !== 'ebitda' || !label) {
    return undefined
  }

  return label.match(/\b(20\d{2})\b/)?.[1]
}
