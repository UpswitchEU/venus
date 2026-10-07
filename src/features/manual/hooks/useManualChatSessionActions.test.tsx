import { act, renderHook, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/components/calculator'
import { useConversationStore } from '@/store/useConversationStore'
import { useManualChatSessionActions } from './useManualChatSessionActions'

const mocks = vi.hoisted(() => ({ reset: vi.fn(), error: vi.fn() }))
vi.mock('@/services/ai/AIChatService', () => ({
  aiChatService: { resetConversation: mocks.reset },
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
const saved = {
  id: 'saved',
  role: 'assistant' as const,
  type: 'ai' as const,
  content: 'Saved answer',
  timestamp: new Date(),
}

function setup(scope: string, loadHistory: (id: string) => Promise<void>) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const handlers = useRef({
    setPending: vi.fn(),
    setGenerating: vi.fn(),
    setTool: vi.fn(),
    send: vi.fn(),
    stream: { current: null },
  }).current
  const actions = useManualChatSessionActions({
    chatDrawerOpen: true,
    chatMessages: messages,
    clearConversationMessages: useConversationStore.getState().clearMessages,
    handleChatMessage: handlers.send,
    isChatGenerating: false,
    isLoadingHistory: loading,
    loadHistory,
    manualChatReportId: scope,
    setChatMessages: setMessages,
    setConversationId: useConversationStore.getState().setConversationId,
    setIsChatGenerating: handlers.setGenerating,
    setIsLoadingHistory: setLoading,
    setPendingUpdates: handlers.setPending,
    setToolInProgress: handlers.setTool,
    streamCleanupRef: handlers.stream,
  })
  return { ...actions, messages, loading, setMessages }
}

beforeEach(() => {
  vi.clearAllMocks()
  useConversationStore.getState().clearMessages()
})

describe('manual conversation lifecycle', () => {
  it('hydrates cached server history after a component remount', async () => {
    useConversationStore.setState({
      messages: [saved],
      lastLoadedReportId: 'client-a',
      historyLoaded: true,
    })
    const load = vi.fn().mockResolvedValue(undefined)
    const first = renderHook(() => setup('client-a', load))
    await waitFor(() => expect(first.result.current.messages[0]?.content).toBe('Saved answer'))
    first.unmount()
    const second = renderHook(() => setup('client-a', load))
    await waitFor(() => expect(second.result.current.messages[0]?.content).toBe('Saved answer'))
  })

  it('ignores history from a previous scope and preserves a turn started during hydration', async () => {
    const pending = new Map<string, () => void>()
    const load = vi.fn(
      (scope: string) => new Promise<void>((resolve) => pending.set(scope, resolve))
    )
    const hook = renderHook(({ scope }) => setup(scope, load), { initialProps: { scope: 'a' } })
    hook.rerender({ scope: 'b' })
    await act(async () => {
      useConversationStore.setState({
        messages: [{ ...saved, content: 'Other client' }],
        lastLoadedReportId: 'a',
      })
      pending.get('a')?.()
    })
    expect(hook.result.current.messages).toEqual([])
    act(() =>
      hook.result.current.setMessages([
        { id: 'live', role: 'user', content: 'New question', timestamp: new Date() },
      ])
    )
    await act(async () => {
      useConversationStore.setState({ messages: [saved], lastLoadedReportId: 'b' })
      pending.get('b')?.()
    })
    expect(hook.result.current.messages.map((message) => message.content)).toEqual([
      'Saved answer',
      'New question',
    ])
  })

  it('keeps history when server reset fails and replaces it only after reset succeeds', async () => {
    useConversationStore.setState({
      messages: [saved],
      lastLoadedReportId: 'a',
      historyLoaded: true,
    })
    const load = vi.fn().mockResolvedValue(undefined)
    const hook = renderHook(() => setup('a', load))
    await waitFor(() => expect(hook.result.current.messages).toHaveLength(1))
    mocks.reset.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      await hook.result.current.handleNewConversation()
    })
    expect(hook.result.current.messages).toHaveLength(1)
    expect(mocks.error).toHaveBeenCalledOnce()
    mocks.reset.mockResolvedValueOnce('fresh-conversation')
    await act(async () => {
      await hook.result.current.handleNewConversation()
    })
    expect(hook.result.current.messages).toEqual([])
    expect(useConversationStore.getState().conversationId).toBe('fresh-conversation')
    expect(mocks.reset).toHaveBeenLastCalledWith('a')
  })
})
