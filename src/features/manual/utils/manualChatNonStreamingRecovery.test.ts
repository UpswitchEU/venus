import { describe, expect, it, vi } from 'vitest'
import {
  requestManualChatNonStreamingRecovery,
  shouldAttemptManualChatNonStreamingRecovery,
} from './manualChatNonStreamingRecovery'

const translate = (key: string) => key

describe('shouldAttemptManualChatNonStreamingRecovery', () => {
  it('allows recovery after BFF fallback failed', () => {
    expect(
      shouldAttemptManualChatNonStreamingRecovery({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: false,
        bffStreamRecoverySource: 'bff-fallback-failed',
      })
    ).toBe(true)
  })

  it('skips recovery when BFF already recovered on the wire', () => {
    expect(
      shouldAttemptManualChatNonStreamingRecovery({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: false,
        bffStreamRecoverySource: 'bff-fallback',
      })
    ).toBe(false)
  })

  it('skips recovery after tool activity or when already started', () => {
    expect(
      shouldAttemptManualChatNonStreamingRecovery({
        nonStreamingRecoveryStarted: true,
        didObserveToolActivity: false,
        bffStreamRecoverySource: null,
      })
    ).toBe(false)
    expect(
      shouldAttemptManualChatNonStreamingRecovery({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: true,
        bffStreamRecoverySource: 'bff-fallback-failed',
      })
    ).toBe(false)
  })
})

describe('requestManualChatNonStreamingRecovery', () => {
  it('returns recovered content when non-streaming chat succeeds', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      content: 'Recovered answer',
      conversationId: 'conv-1',
      fallback: false,
    })

    const outcome = await requestManualChatNonStreamingRecovery({
      aiRequest: { message: 'Leg de waarde uit', sessionId: 'sess-1' },
      sendMessage,
      translate,
      createId: () => 'card-1',
    })

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Leg de waarde uit', stream: false })
    )
    expect(outcome).toMatchObject({
      status: 'recovered',
      patch: { content: 'Recovered answer' },
      conversationId: 'conv-1',
      showAiUnavailableToast: false,
    })
  })

  it('returns terminal_error for quota and consent envelopes', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: false,
      requires_upgrade: true,
      error: 'No credits left',
    })

    const outcome = await requestManualChatNonStreamingRecovery({
      aiRequest: { message: 'hi', sessionId: 'sess-1' },
      sendMessage,
      translate,
      createId: () => 'card-1',
    })

    expect(outcome.status).toBe('terminal_error')
    if (outcome.status === 'terminal_error') {
      expect(outcome.patch.content).toBe('quotaExhausted')
    }
  })

  it('returns miss when the non-streaming payload is still empty', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      content: '   ',
    })

    const outcome = await requestManualChatNonStreamingRecovery({
      aiRequest: { message: 'hi', sessionId: 'sess-1' },
      sendMessage,
      translate,
      createId: () => 'card-1',
    })

    expect(outcome).toEqual({ status: 'miss' })
  })

  it('returns recovered tool cards when non-streaming chat only returns fieldUpdates', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      content: '',
      fieldUpdates: [
        {
          field: 'revenue',
          value: 100000,
          label: 'Revenue',
          source: 'ai' as const,
        },
      ],
    })

    const outcome = await requestManualChatNonStreamingRecovery({
      aiRequest: { message: 'zet omzet op 100k', sessionId: 'sess-1' },
      sendMessage,
      translate,
      createId: () => 'card-1',
    })

    expect(outcome.status).toBe('recovered')
    if (outcome.status === 'recovered') {
      expect(outcome.patch.fieldUpdates?.length).toBeGreaterThan(0)
    }
  })

  it('returns generic terminal_error when sendMessage throws', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('network down'))

    const outcome = await requestManualChatNonStreamingRecovery({
      aiRequest: { message: 'hi', sessionId: 'sess-1' },
      sendMessage,
      translate,
      createId: () => 'card-1',
    })

    expect(outcome.status).toBe('terminal_error')
    if (outcome.status === 'terminal_error') {
      expect(outcome.patch.content).toBe('chatError')
    }
  })
})
