import type { AssistantIntent } from '@/services/ai/local-chat-fallback'
import type { SuggestionContext } from './ChatAssistantTypes'

const MIN_SUGGESTIONS = 3
const PAD_KEY = 'suggestions.askQuestion'

export type SuggestionItem = {
  key: string
  params?: Record<string, string>
  intent?: AssistantIntent
}

const SUGGESTION_INTENT_BY_KEY: Partial<Record<string, AssistantIntent>> = {
  'suggestions.explainValue': 'explain_value',
  'suggestions.whatWorth': 'explain_value',
  'suggestions.explainEbitda': 'explain_ebitda',
  'suggestions.explainEbitdaFor': 'explain_ebitda',
  'suggestions.whichNorms': 'suggest_normalizations',
  'suggestions.whichNormsApply': 'suggest_normalizations',
  'suggestions.explainCapBreach': 'explain_ebitda',
}

export function getSuggestionIntent(key: string): AssistantIntent | undefined {
  return SUGGESTION_INTENT_BY_KEY[key]
}

export function getContextualSuggestionKeys(ctx: SuggestionContext): SuggestionItem[] {
  const {
    fieldContext,
    hasReport = false,
    hasEbitda = false,
    pendingNormalizationsCount = 0,
    acceptedNormalizationsCount = 0,
    hasCapBreach = false,
  } = ctx

  const items: SuggestionItem[] = []
  const normsAlreadyApplied = acceptedNormalizationsCount > 0 && pendingNormalizationsCount === 0

  items.push({
    key: hasReport ? 'suggestions.explainValue' : 'suggestions.whatWorth',
    intent: 'explain_value',
  })

  if (!hasReport) {
    items.push({ key: 'suggestions.generateReport' })
  }

  if (hasCapBreach) {
    items.push({ key: 'suggestions.explainCapBreach', intent: 'explain_ebitda' })
  } else if (!normsAlreadyApplied) {
    items.push({ key: 'suggestions.whichNorms', intent: 'suggest_normalizations' })
  }

  if (pendingNormalizationsCount > 0) {
    items.push({ key: 'suggestions.whichNormsApply', intent: 'suggest_normalizations' })
  }

  if (hasEbitda) {
    const year = extractEbitdaYear(fieldContext?.field, fieldContext?.label)
    items.push(
      year
        ? { key: 'suggestions.explainEbitdaFor', params: { year }, intent: 'explain_ebitda' }
        : { key: 'suggestions.explainEbitda', intent: 'explain_ebitda' }
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
