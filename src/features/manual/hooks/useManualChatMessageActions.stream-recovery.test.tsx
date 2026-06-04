/**
 * Pins Venus manual-chat layer-3 recovery after BFF `bff-fallback-failed` + error SSE.
 * Mirrors Mercury AdvisorAIDock.smoke "auto-recovers via non-streaming chat…".
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../../components/calculator'
import { buildManualChatAttachmentSummaries } from '../utils/manualChatAttachments'
import { useManualChatMessageActions } from './useManualChatMessageActions'

type StreamCallbacks = {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onBffStreamRecovery?: (source: string) => void
  onError?: (error: string) => void
  onDone?: (conversationId?: string) => void
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
    loadHistory: vi.fn().mockResolvedValue({ conversationId: null, messages: [] }),
  },
}))

const pollHistoryMock = vi.hoisted(() => vi.fn(() => Promise.resolve(null)))
vi.mock('../utils/manualChatPersistedAnswerRecovery', () => ({
  pollHistoryForPersistedAnswer: pollHistoryMock,
}))

vi.mock('../../../store/useVersionHistoryStore', () => ({
  useVersionHistoryStore: {
    getState: () => ({ versions: {} }),
  },
}))

const clientContextHarness = vi.hoisted(() => ({
  state: { client: null as null | { id: string } },
}))
vi.mock('../../../stores/clientContext', () => ({
  useClientContext: (selector: (state: { client: null | { id: string } }) => unknown) =>
    selector(clientContextHarness.state),
}))

vi.mock('../utils/manualChatAttachments', () => ({
  buildManualChatAttachmentSummaries: vi.fn().mockResolvedValue([]),
  appendManualChatAttachmentContext: (message: string) => message,
}))

function makeHookParams(
  overrides: Partial<Parameters<typeof useManualChatMessageActions>[0]> = {}
) {
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
    pollHistoryMock.mockClear()
    pollHistoryMock.mockResolvedValue(null)
    vi.mocked(buildManualChatAttachmentSummaries).mockReset()
    vi.mocked(buildManualChatAttachmentSummaries).mockResolvedValue([])
    clientContextHarness.state = { client: null }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
      await result.current.handleChatMessage(
        'Verklaar deze EBITDA',
        undefined,
        undefined,
        undefined,
        'explain_ebitda'
      )
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
      await result.current.handleChatMessage(
        'Verklaar deze EBITDA',
        undefined,
        undefined,
        undefined,
        'explain_ebitda'
      )
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

  it('coalesces bursty text chunks into one frame-paced message patch', async () => {
    let rafCallback: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Leg de waarde uit')
    })

    const callsBeforeText = params.setChatMessages.mock.calls.length
    await act(async () => {
      streamHarness.callbacks?.onText?.('Waarde')
      streamHarness.callbacks?.onText?.('ring ')
      streamHarness.callbacks?.onText?.('klaar.')
    })

    expect(params.setChatMessages).toHaveBeenCalledTimes(callsBeforeText)
    expect(params.chatMessages.find((m) => m.role === 'assistant')?.content).toBe('')

    await act(async () => {
      rafCallback?.(16)
    })

    expect(params.chatMessages.find((m) => m.role === 'assistant')?.content).toBe(
      'Waardering klaar.'
    )
    vi.unstubAllGlobals()
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

  it('drops rapid duplicate sends before React busy state rerenders', async () => {
    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await Promise.all([
        result.current.handleChatMessage('First turn'),
        result.current.handleChatMessage('Second same-frame turn'),
      ])
    })

    expect(params.chatMessages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(params.chatMessages.find((message) => message.role === 'user')?.content).toBe(
      'First turn'
    )
  })

  it('ignores late stream callbacks after the active turn is cancelled', async () => {
    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Start then cancel')
    })

    const callsBeforeCancel = params.setChatMessages.mock.calls.length
    await act(async () => {
      params.streamCleanupRef.current?.()
    })

    await act(async () => {
      streamHarness.callbacks?.onText?.('late text')
      streamHarness.callbacks?.onDone?.('late-conversation')
    })

    expect(params.setChatMessages).toHaveBeenCalledTimes(callsBeforeCancel)
    expect(params.setConversationId).not.toHaveBeenCalledWith('late-conversation')

    await act(async () => {
      await result.current.handleChatMessage('Fresh turn after cancel')
    })

    expect(params.chatMessages.filter((message) => message.role === 'user')).toHaveLength(2)
  })

  it('renders a visible assistant error if setup fails before the stream placeholder is added', async () => {
    vi.mocked(buildManualChatAttachmentSummaries).mockRejectedValueOnce(
      new Error('file read failed')
    )
    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Read this file')
    })

    const assistant = params.chatMessages.find((message) => message.role === 'assistant')
    expect(assistant?.isError).toBe(true)
    expect(params.setIsChatGenerating).toHaveBeenCalledWith(false)
    expect(streamHarness.callbacks).toBeNull()
  })

  it('self-heals from persisted history when stream + /chat recovery both fail', async () => {
    // /chat recovery connection dies (the staging 499) → recovery resolves
    // terminal_error, but Titan already persisted the answer server-side.
    sendMessageMock.mockRejectedValueOnce(new Error('proxy 499 — connection died'))
    pollHistoryMock.mockResolvedValueOnce({
      content: 'Transactieklaar-stappenplan (server-side persisted).',
    })

    const params = makeHookParams()
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage('Help mij dit bedrijf transactieklaar maken')
    })

    await act(async () => {
      streamHarness.callbacks?.onBffStreamRecovery?.('bff-fallback-failed')
      streamHarness.callbacks?.onError?.('AI stream fallback failed')
    })

    await waitFor(() => {
      const assistant = params.chatMessages.find((m) => m.role === 'assistant')
      expect(assistant?.content).toContain('Transactieklaar-stappenplan (server-side persisted).')
    })
    expect(pollHistoryMock).toHaveBeenCalledTimes(1)
    const assistant = params.chatMessages.find((m) => m.role === 'assistant')
    expect(assistant?.isError).toBeFalsy()
  })

  it('polls the client-scoped advisor history key during persisted-answer recovery', async () => {
    clientContextHarness.state = { client: { id: 'client-123' } }
    sendMessageMock.mockRejectedValueOnce(new Error('proxy 499 — connection died'))
    pollHistoryMock.mockResolvedValueOnce({
      content: 'Waardering: €560K, met range €428K-€617K.',
    })

    const params = makeHookParams({
      isAccountantMode: true,
      manualChatReportId: '48d52144-1fa9-44e7-b077-8dc22310c2ac',
      reportId: 'route-report-id',
      resolvedReportId: '48d52144-1fa9-44e7-b077-8dc22310c2ac',
    })
    const { result } = renderHook(() => useManualChatMessageActions(params))

    await act(async () => {
      await result.current.handleChatMessage(
        'Explain the valuation',
        undefined,
        undefined,
        undefined,
        'explain_value'
      )
    })

    await act(async () => {
      streamHarness.callbacks?.onBffStreamRecovery?.('bff-fallback-failed')
      streamHarness.callbacks?.onError?.('AI stream fallback failed')
    })

    await waitFor(() => {
      expect(pollHistoryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: 'client_client-123',
          userContent: 'Explain the valuation',
        })
      )
    })
  })
})
