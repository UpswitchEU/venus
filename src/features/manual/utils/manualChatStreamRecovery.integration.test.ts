import { describe, expect, it } from 'vitest'
import { shouldAttemptManualChatNonStreamingRecovery } from './manualChatNonStreamingRecovery'
import { shouldShowTerminalErrorAfterSkippedRecovery } from './manualChatStreamRecoveryPolicy'

/**
 * Documents the Venus manual-chat stream recovery decision tree that
 * `useManualChatMessageActions` implements (layer 3 after BFF SSE).
 */
describe('manual chat stream recovery integration', () => {
  it('runs layer-3 recovery after bff-fallback-failed + error SSE (no onDone)', () => {
    const bffSource = 'bff-fallback-failed' as const
    const streamEndedWithoutCompletion = true

    expect(
      shouldAttemptManualChatNonStreamingRecovery({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: true,
        bffStreamRecoverySource: bffSource,
        streamEndedWithoutCompletion,
      })
    ).toBe(true)

    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        streamEndedWithoutCompletion,
        bffStreamRecoverySource: bffSource,
        hasVisibleContent: false,
      })
    ).toBe(true)
  })

  it('skips duplicate recovery when BFF already recovered on the wire', () => {
    expect(
      shouldAttemptManualChatNonStreamingRecovery({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: false,
        bffStreamRecoverySource: 'bff-fallback',
      })
    ).toBe(false)

    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        bffStreamRecoverySource: 'bff-fallback',
        emptyStream: true,
        hasVisibleContent: false,
      })
    ).toBe(true)
  })

  it('preserves visible partial content when recovery is skipped after BFF success', () => {
    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        streamEndedWithoutCompletion: true,
        bffStreamRecoverySource: 'bff-fallback',
        hasVisibleContent: true,
      })
    ).toBe(false)
  })
})
