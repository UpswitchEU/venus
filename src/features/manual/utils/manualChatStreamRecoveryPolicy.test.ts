import { describe, expect, it } from 'vitest'
import { shouldShowTerminalErrorAfterSkippedRecovery } from './manualChatStreamRecoveryPolicy'

describe('shouldShowTerminalErrorAfterSkippedRecovery', () => {
  it('requires terminal cleanup after BFF fallback failed or empty stream', () => {
    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        bffStreamRecoverySource: 'bff-fallback-failed',
      })
    ).toBe(true)
    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        bffStreamRecoverySource: null,
        emptyStream: true,
      })
    ).toBe(true)
  })

  it('requires terminal cleanup when BFF recovered on wire but client saw no content', () => {
    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        bffStreamRecoverySource: 'bff-fallback',
        emptyStream: true,
      })
    ).toBe(true)
  })

  it('does not force terminal when tool-only stream ended normally', () => {
    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        bffStreamRecoverySource: null,
        emptyStream: false,
      })
    ).toBe(false)
  })

  it('does not overwrite partial BFF content when layer-3 recovery is skipped', () => {
    expect(
      shouldShowTerminalErrorAfterSkippedRecovery({
        streamEndedWithoutCompletion: true,
        bffStreamRecoverySource: 'bff-fallback',
        hasVisibleContent: true,
      })
    ).toBe(false)
  })
})
