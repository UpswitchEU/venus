import { describe, expect, it, vi } from 'vitest'
import {
  buildChatAssistantScrollTriggerKey,
  buildChatAssistantSuggestionViews,
  findChatAssistantSuggestionIntent,
  getVisibleChatAssistantMessages,
  resolveChatAssistantCurrencyLocale,
  resolveChatAssistantHeaderSubtitle,
  resolveChatAssistantToolLabelKey,
  shouldShowChatAssistantLoadingSkeleton,
} from './ChatAssistantDrawer.model'
import type { SuggestionItem } from './ChatAssistantSuggestions'
import type { ChatMessage } from './ChatAssistantTypes'

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('ChatAssistantDrawer model', () => {
  it('resolves Belgium currency locales from supported app locales', () => {
    expect(resolveChatAssistantCurrencyLocale('fr')).toBe('fr-BE')
    expect(resolveChatAssistantCurrencyLocale('en')).toBe('en-BE')
    expect(resolveChatAssistantCurrencyLocale('nl')).toBe('nl-BE')
    expect(resolveChatAssistantCurrencyLocale('de')).toBe('nl-BE')
  })

  it('builds translated suggestion views with stable ids and preserved intents', () => {
    const items: SuggestionItem[] = [
      {
        key: 'suggestions.explainEbitdaFor',
        params: { year: '2025' },
        intent: 'explain_ebitda',
      },
      { key: 'suggestions.whichNorms', intent: 'suggest_normalizations' },
    ]
    const translate = vi.fn((key: string, params?: Record<string, string>) =>
      params ? `${key}:${params.year}` : key
    )

    const views = buildChatAssistantSuggestionViews(items, translate)

    expect(views).toEqual([
      {
        id: 'suggestions.explainEbitdaFor:0',
        label: 'suggestions.explainEbitdaFor:2025',
        intent: 'explain_ebitda',
      },
      {
        id: 'suggestions.whichNorms:1',
        label: 'suggestions.whichNorms',
        intent: 'suggest_normalizations',
      },
    ])
    expect(translate).toHaveBeenCalledTimes(2)
  })

  it('resolves suggestion intent from prepared views without re-translating source keys', () => {
    const translate = vi.fn((key: string) => 'Same label')
    const views = buildChatAssistantSuggestionViews(
      [
        { key: 'suggestions.explainValue', intent: 'explain_value' },
        { key: 'suggestions.whichNorms', intent: 'suggest_normalizations' },
      ],
      translate
    )

    expect(findChatAssistantSuggestionIntent(views, 'Same label')).toBe('explain_value')
    expect(findChatAssistantSuggestionIntent(views, 'Missing')).toBeUndefined()
    expect(translate).toHaveBeenCalledTimes(2)
  })

  it('resolves header subtitle with field context taking precedence over company context', () => {
    const translateAnalysisFor = (companyName: string) => `Analysis for ${companyName}`

    expect(
      resolveChatAssistantHeaderSubtitle({
        fieldLabel: 'EBITDA 2025',
        companyName: 'Acme',
        translateAnalysisFor,
      })
    ).toBe('EBITDA 2025')
    expect(
      resolveChatAssistantHeaderSubtitle({
        companyName: 'Acme',
        translateAnalysisFor,
      })
    ).toBe('Analysis for Acme')
    expect(resolveChatAssistantHeaderSubtitle({ translateAnalysisFor })).toBeNull()
  })

  it('filters empty assistant turns while keeping user turns, errors, and card payloads', () => {
    const visible = getVisibleChatAssistantMessages([
      message({ id: 'user', role: 'user' }),
      message({ id: 'empty-assistant' }),
      message({ id: 'assistant-content', content: 'Done' }),
      message({ id: 'assistant-error', isError: true }),
      message({
        id: 'assistant-card',
        fieldUpdates: [{ field: 'ebitda', label: 'EBITDA', value: 100_000 }],
      }),
    ])

    expect(visible.map((entry) => entry.id)).toEqual([
      'user',
      'assistant-content',
      'assistant-error',
      'assistant-card',
    ])
  })

  it('shows the loading skeleton only before an assistant turn becomes visible', () => {
    expect(
      shouldShowChatAssistantLoadingSkeleton({
        isGenerating: true,
      })
    ).toBe(true)
    expect(
      shouldShowChatAssistantLoadingSkeleton({
        isGenerating: true,
        lastVisibleRole: 'user',
      })
    ).toBe(true)
    expect(
      shouldShowChatAssistantLoadingSkeleton({
        isGenerating: true,
        lastVisibleRole: 'assistant',
      })
    ).toBe(false)
    expect(
      shouldShowChatAssistantLoadingSkeleton({
        isGenerating: false,
        lastVisibleRole: 'user',
      })
    ).toBe(false)
  })

  it('builds deterministic scroll keys from message, loading, attention, and viewport state', () => {
    expect(
      buildChatAssistantScrollTriggerKey({
        attentionRailsKey: '1:2:3',
        messageRenderKey: 'm1:12',
        showLoadingSkeleton: true,
        viewportScrollKey: '10:700',
      })
    ).toBe('m1:12:1:1:2:3:10:700')
  })

  it('resolves tool progress labels with a default fallback', () => {
    const availableLabels = new Set(['tools.search_registry'])
    const hasTranslation = (key: string) => availableLabels.has(key)

    expect(resolveChatAssistantToolLabelKey({ hasTranslation })).toBe('typing')
    expect(resolveChatAssistantToolLabelKey({ hasTranslation, toolInProgress: null })).toBe(
      'typing'
    )
    expect(
      resolveChatAssistantToolLabelKey({
        hasTranslation,
        toolInProgress: 'search_registry',
      })
    ).toBe('tools.search_registry')
    expect(
      resolveChatAssistantToolLabelKey({
        hasTranslation,
        toolInProgress: 'unknown_tool',
      })
    ).toBe('tools.default')
  })
})
