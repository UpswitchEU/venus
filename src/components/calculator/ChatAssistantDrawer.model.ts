import type { AssistantIntent } from '@/services/ai/local-chat-fallback'
import { hasAssistantRenderableContent } from './ChatAssistantDrawer.utils'
import type { SuggestionItem } from './ChatAssistantSuggestions'
import type { ChatMessage } from './ChatAssistantTypes'

export interface ChatAssistantSuggestionView {
  id: string
  label: string
  intent?: AssistantIntent
}

type SuggestionTranslator = (key: string, params?: Record<string, string>) => string

export function resolveChatAssistantCurrencyLocale(locale: string): string {
  if (locale === 'fr') return 'fr-BE'
  if (locale === 'en') return 'en-BE'
  return 'nl-BE'
}

export function buildChatAssistantSuggestionViews(
  items: SuggestionItem[],
  translate: SuggestionTranslator
): ChatAssistantSuggestionView[] {
  return items.map((item, index) => ({
    id: `${item.key}:${index}`,
    label: item.params ? translate(item.key, item.params) : translate(item.key),
    intent: item.intent,
  }))
}

export function findChatAssistantSuggestionIntent(
  suggestions: ChatAssistantSuggestionView[],
  label: string
): AssistantIntent | undefined {
  return suggestions.find((suggestion) => suggestion.label === label)?.intent
}

export function resolveChatAssistantHeaderSubtitle({
  fieldLabel,
  companyName,
  translateAnalysisFor,
}: {
  fieldLabel?: string | null
  companyName?: string | null
  translateAnalysisFor: (companyName: string) => string
}): string | null {
  if (fieldLabel) return fieldLabel
  if (companyName) return translateAnalysisFor(companyName)
  return null
}

export function getVisibleChatAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(hasAssistantRenderableContent)
}

export function shouldShowChatAssistantLoadingSkeleton({
  isGenerating,
  lastVisibleRole,
}: {
  isGenerating: boolean
  lastVisibleRole?: ChatMessage['role']
}): boolean {
  return isGenerating && lastVisibleRole !== 'assistant'
}

export function buildChatAssistantScrollTriggerKey({
  attentionRailsKey,
  messageRenderKey,
  showLoadingSkeleton,
  viewportScrollKey,
}: {
  attentionRailsKey: string
  messageRenderKey: string
  showLoadingSkeleton: boolean
  viewportScrollKey: string
}): string {
  return `${messageRenderKey}:${showLoadingSkeleton ? '1' : '0'}:${attentionRailsKey}:${viewportScrollKey}`
}

export function resolveChatAssistantToolLabelKey({
  hasTranslation,
  toolInProgress,
}: {
  hasTranslation: (key: string) => boolean
  toolInProgress?: string | null
}): 'typing' | 'tools.default' | `tools.${string}` {
  if (!toolInProgress) return 'typing'
  const toolLabelKey = `tools.${toolInProgress}` as const
  return hasTranslation(toolLabelKey) ? toolLabelKey : 'tools.default'
}
