/**
 * Pins Venus manual-chat layer-3 recovery after BFF `bff-fallback-failed` + error SSE.
 * Mirrors Mercury AdvisorAIDock.smoke "auto-recovers via non-streaming chat…".
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../../components/calculator'
import { useManualChatMessageActions } from './useManualChatMessageActions'

type StreamCallbacks = {
  onBffStreamRecovery?: (source: string) => void
  onError?: (error: string) => void
  onDone?: () => void
}

const streamHarness = vi.hoisted(() => ({
  callbacks: null as StreamCallbacks | null,
  cleanup: vi.fn(),
}))

const sendMessageMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    success: true,
    content: 'Recovered after BFF fallback failure',
    conversationId: 'conv-recovered',
    fallback: false,
  })
)

vi.mock('../../../services/ai/AIChatService', () => ({
  aiChatService: {
    streamMessage: vi.fn((_req: unknown, callbacks: StreamCallbacks) => {
      streamHarness.callbacks = callbacks
      return streamHarness.cleanup
    }),
    sendMessage: sendMessageMock,
  },
}))

vi.mock('../../../store/useVersionHistoryStore', () => ({
  useVersionHistoryStore: {
    getState: () => ({ versions: {} }),
  },
}))

vi.mock('../../../stores/clientContext', () => ({
  useClientContext: (selector: (state: { client: null }) => unknown) =>
    selector({ client: null }),
}))

vi.mock('../utils/manualChatAttachments', () => ({
  buildManualChatAttachmentSummaries: vi.fn().mockResolvedValue([]),
  appendManualChatAttachmentContext: (message: string) => message,
}))

function makeHookParams(overrides: Partial<Parameters<typeof useManualChatMessageActions>[0]> = {}) {
  const chatMessages: ChatMessage[] = []
  const latestFormDataRef = { current: {} }
  const streamCleanupRef = { current: null as (() => void) | null }

  return {
    chatMessages,
    collectedData: { companyName: 'METAALBEWERKING M.A.C.' },
    conversationId: null,
    currentLocale: 'nl',
    fieldContext: undefined,
    handleApplyFieldUpdate: vi.fn(),
    isAccountantMode: false,
    isChatGenerating: false,
    isLoadingHistory: false,
    latestFormDataRef,
    manualChatReportId: 'report-1',
    normalizationItems: [],
    persistNormalizationsToSession: vi.fn(),
    reportId: 'report-1',
    resolvedReportId: 'report-1',
    setChatMessages: vi.fn((updater) => {
      if (typeof updater === 'function') {
        const next = updater(chatMessages)
        chatMessages.length = 0
        chatMessages.push(...next)
      }
    }),
    setConversationId: vi.fn(),
    setIsChatGenerating: vi.fn(),
    setPendingUpdates: vi.fn(),
    setSuggestedNormalisations: vi.fn(),
    setToolInProgress: vi.fn(),
    streamCleanupRef,
    translate: (key: string) => key,
    addNormalizationItems: vi.fn(),
    ...overrides,
  }
}

describe('useManualChatMessageActions stream recovery', () => {
  beforeEach(() => {
    streamHarness.callbacks = null
    streamHarness.cleanup.mockClear()
    sendMessageMock.mockClear()
    sendMessageMock.mockResolvedValue({
      success: true,
      content: 'Recovered after BFF fallback failure',
      conversationId: 'conv-recovered',
      fallback: false,
    })
  })

  it('recovers via non-streaming chat after BFF stream_recovery failed + error SSE', async () => {
    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage(
        'Leg de waarde uit',
        undefined,
        undefined,
        undefined,
        'explain_value'
      )
    })

    expect(streamHarness.callbacks).toBeTruthy()

    await act(async () => {
      streamHarness.callbacks?.onBffStreamRecovery?.('bff-fallback-failed')
      streamHarness.callbacks?.onError?.('AI stream fallback failed')
    })

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
          recoverFromStreamTurn: true,
          assistantIntent: 'explain_value',
        })
      )
    })

    const assistant = params.chatMessages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toContain('Recovered after BFF fallback failure')
    expect(params.setIsChatGenerating).toHaveBeenCalledWith(false)
  })

  it('marks isOfflineFallback when layer-3 returns dossier-aware local fallback', async () => {
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      content: '> **AI tijdelijk niet beschikbaar**\n\nEBITDA-bridge vanuit dossier.',
      fallback: true,
    })

    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Verklaar deze EBITDA', undefined, undefined, undefined, 'explain_ebitda')
    })

    await act(async () => {
      streamHarness.callbacks?.onBffStreamRecovery?.('bff-fallback-failed')
      streamHarness.callbacks?.onError?.('AI stream fallback failed')
    })

    await waitFor(() => {
      const assistant = params.chatMessages.find((m) => m.role === 'assistant')
      expect(assistant?.isOfflineFallback).toBe(true)
    })
  })

  it('shows terminal error when tools ran but produced no visible cards or text', async () => {
    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Run valuation tools')
    })

    await act(async () => {
      streamHarness.callbacks?.onToolStart?.('run_valuation')
      streamHarness.callbacks?.onToolResult?.('run_valuation', {})
      streamHarness.callbacks?.onDone?.()
    })

    await waitFor(() => {
      expect(params.setIsChatGenerating).toHaveBeenCalledWith(false)
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
    const assistant = params.chatMessages.find((m) => m.role === 'assistant')
    expect(assistant?.isError).toBe(true)
  })

  it('marks offline fallback when a completed stream delivers offline banner text', async () => {
    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Verklaar deze EBITDA', undefined, undefined, undefined, 'explain_ebitda')
    })

    await act(async () => {
      streamHarness.callbacks?.onText?.(
        '> **AI tijdelijk niet beschikbaar** — beperkt antwoord\n\nEBITDA-bridge.'
      )
      streamHarness.callbacks?.onDone?.('conv-stream-offline')
    })

    await waitFor(() => {
      const assistant = params.chatMessages.find((m) => m.role === 'assistant')
      expect(assistant?.isOfflineFallback).toBe(true)
    })
  })

  it('does not start a new AI turn while already generating', async () => {
    const params = makeHookParams({ isChatGenerating: true })
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Second message while busy')
    })

    expect(streamHarness.callbacks).toBeNull()
    expect(params.setChatMessages).not.toHaveBeenCalled()
  })
})
