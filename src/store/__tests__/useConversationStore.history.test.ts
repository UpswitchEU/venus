// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const load = vi.hoisted(() => vi.fn())
vi.mock('@/services/ai/AIChatService', () => ({ aiChatService: { loadHistory: load } }))

import { useConversationStore } from '../useConversationStore'

beforeEach(() => {
  load.mockReset()
  useConversationStore.getState().clearMessages()
})

describe('conversation history requests', () => {
  it('refreshes a cached client conversation when returning from Mercury', async () => {
    useConversationStore.setState({ historyLoaded: true, lastLoadedReportId: 'client-a' })
    load.mockResolvedValue({
      conversationId: 'shared',
      messages: [
        {
          id: 'new',
          role: 'assistant',
          content: 'Proposal from Mercury',
          created_at: '2026-10-07T10:00:00Z',
        },
      ],
    })
    await useConversationStore.getState().loadHistory('client-a', true)
    expect(load).toHaveBeenCalledOnce()
    expect(useConversationStore.getState().messages[0].content).toBe('Proposal from Mercury')
  })

  it('discards the first request after switching A → B → A', async () => {
    let completeOld!: (value: unknown) => void
    load
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeOld = resolve
          })
      )
      .mockResolvedValueOnce({ conversationId: 'b', messages: [] })
      .mockResolvedValueOnce({ conversationId: 'fresh-a', messages: [] })
    const stale = useConversationStore.getState().loadHistory('a', true)
    await useConversationStore.getState().loadHistory('b', true)
    await useConversationStore.getState().loadHistory('a', true)
    completeOld({ conversationId: 'stale-a', messages: [] })
    await stale
    expect(useConversationStore.getState().conversationId).toBe('fresh-a')
  })

  it('does not resurrect a cleared conversation after an outstanding read completes', async () => {
    let complete!: (value: unknown) => void
    load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const stale = useConversationStore.getState().loadHistory('a', true)
    useConversationStore.getState().clearMessages()
    complete({ conversationId: 'stale', messages: [] })
    await stale
    expect(useConversationStore.getState().conversationId).toBeNull()
  })
})
