import type { ManualChatBffStreamRecoverySource } from './manualChatNonStreamingRecovery'

/**
 * When layer-3 recovery is skipped, the UI must still leave the generating state.
 * Mirrors Mercury dock terminal cleanup after `tryNonStreamingRecovery` returns false.
 */
export function shouldShowTerminalErrorAfterSkippedRecovery({
  streamEndedWithoutCompletion = false,
  bffStreamRecoverySource,
  emptyStream = false,
  hasVisibleContent = false,
}: {
  streamEndedWithoutCompletion?: boolean
  bffStreamRecoverySource: ManualChatBffStreamRecoverySource
  emptyStream?: boolean
  /** When true, recovery was skipped but the user already has a partial answer — do not overwrite. */
  hasVisibleContent?: boolean
}): boolean {
  if (hasVisibleContent) return false
  if (streamEndedWithoutCompletion) return true
  if (bffStreamRecoverySource === 'bff-fallback-failed') return true
  if (bffStreamRecoverySource === 'bff-fallback') return true
  if (emptyStream) return true
  return false
}
