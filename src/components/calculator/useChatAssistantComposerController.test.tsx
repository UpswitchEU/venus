import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChatAssistantComposerController } from './useChatAssistantComposerController'

vi.mock('@/lib/analytics', () => ({
  trackAIAssistantMessage: vi.fn(),
}))

function translateSuggestion(key: string, params?: Record<string, string>) {
  return params ? `${key}:${params.year}` : key
}

describe('useChatAssistantComposerController', () => {
  it('keeps suggestion intent attached through chip insert and submit', () => {
    const onSendMessage = vi.fn()
    const { result } = renderHook(() =>
      useChatAssistantComposerController({
        acceptedNormalizationsCount: 0,
        fieldContext: { field: 'ebitda', label: 'EBITDA 2023' },
        hasCapBreach: false,
        hasEbitda: true,
        hasReport: true,
        isGenerating: false,
        onSendMessage,
        pendingNormalizationsCount: 0,
        translateSuggestion,
      })
    )

    expect(result.current.suggestions).toContain('suggestions.explainEbitdaFor:2023')

    act(() => {
      result.current.handleSuggestionClick('suggestions.explainEbitdaFor:2023')
    })
    expect(result.current.input).toBe('suggestions.explainEbitdaFor:2023 ')

    act(() => {
      result.current.handleSubmit()
    })

    expect(onSendMessage).toHaveBeenCalledTimes(1)
    expect(onSendMessage.mock.calls[0][0]).toBe('suggestions.explainEbitdaFor:2023 ')
    expect(onSendMessage.mock.calls[0][4]).toBe('explain_ebitda')
  })

  it('delegates command pills to the override when provided', () => {
    const onCommandPillClick = vi.fn()
    const onSendMessage = vi.fn()
    const { result } = renderHook(() =>
      useChatAssistantComposerController({
        acceptedNormalizationsCount: 0,
        fieldContext: undefined,
        hasCapBreach: false,
        hasEbitda: false,
        hasReport: true,
        isGenerating: false,
        onCommandPillClick,
        onSendMessage,
        pendingNormalizationsCount: 0,
        translateSuggestion,
      })
    )

    act(() => {
      result.current.handleCommandPillClick('/normalize')
    })

    expect(onCommandPillClick).toHaveBeenCalledWith('/normalize')
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('auto-sends command pills when no override exists', () => {
    const onSendMessage = vi.fn()
    const { result } = renderHook(() =>
      useChatAssistantComposerController({
        acceptedNormalizationsCount: 0,
        fieldContext: undefined,
        hasCapBreach: false,
        hasEbitda: false,
        hasReport: true,
        isGenerating: false,
        onSendMessage,
        pendingNormalizationsCount: 0,
        translateSuggestion,
      })
    )

    act(() => {
      result.current.handleCommandPillClick('/normalize')
    })

    expect(onSendMessage).toHaveBeenCalledTimes(1)
    expect(onSendMessage.mock.calls[0][0]).toBe('/normalize')
  })
})
