import type { ManualChatBffStreamRecoverySource } from './manualChatNonStreamingRecovery'
import { shouldAttemptManualChatNonStreamingRecovery } from './manualChatNonStreamingRecovery'
import { shouldShowTerminalErrorAfterSkippedRecovery } from './manualChatStreamRecoveryPolicy'

export type ManualChatStreamOnDoneAction =
  | { kind: 'complete' }
  | { kind: 'recover'; streamEndedWithoutCompletion: boolean; emptyStream: boolean }

export type ManualChatStreamOnErrorAction =
  | { kind: 'finish_with_content' }
  | { kind: 'recover'; streamEndedWithoutCompletion: true }

export type ManualChatRecoverySkipAction =
  | { kind: 'started_recovery' }
  | { kind: 'terminal_error' }
  | { kind: 'finish_with_content' }

export function resolveManualChatOnDoneAction({
  hasReceivedAnyContent,
  bffStreamRecoverySource,
  streamIncomplete = false,
}: {
  hasReceivedAnyContent: boolean
  bffStreamRecoverySource: ManualChatBffStreamRecoverySource
  streamIncomplete?: boolean
}): ManualChatStreamOnDoneAction {
  const streamEndedIncomplete =
    streamIncomplete || bffStreamRecoverySource === 'bff-stream-incomplete'

  // Visible text/cards already streamed → keep them. The non-streaming twin
  // regenerates a token-divergent answer, and replacing the bubble with it is
  // the "rewriting bubble" bug (the user watches sentences they already read get
  // swapped out seconds later). An incomplete terminator AFTER content is almost
  // always a healthy turn whose `done` frame was buffered/dropped by the edge —
  // complete it, never recover-and-replace.
  if (hasReceivedAnyContent) {
    return { kind: 'complete' }
  }
  if (streamEndedIncomplete) {
    return { kind: 'recover', streamEndedWithoutCompletion: true, emptyStream: false }
  }
  return { kind: 'recover', streamEndedWithoutCompletion: false, emptyStream: true }
}

export function resolveManualChatOnErrorAction({
  hasReceivedAnyContent,
}: {
  hasReceivedAnyContent: boolean
}): ManualChatStreamOnErrorAction {
  if (hasReceivedAnyContent) {
    return { kind: 'finish_with_content' }
  }
  return { kind: 'recover', streamEndedWithoutCompletion: true }
}

export function resolveManualChatRecoverySkipAction({
  nonStreamingRecoveryStarted,
  didObserveToolActivity,
  bffStreamRecoverySource,
  streamEndedWithoutCompletion,
  emptyStream,
  hasReceivedAnyContent,
}: {
  nonStreamingRecoveryStarted: boolean
  didObserveToolActivity: boolean
  bffStreamRecoverySource: ManualChatBffStreamRecoverySource
  streamEndedWithoutCompletion: boolean
  emptyStream: boolean
  hasReceivedAnyContent: boolean
}): ManualChatRecoverySkipAction {
  // Invariant: never regenerate-and-replace once visible content streamed.
  // Mirrors Mercury's `shouldAttemptDockNonStreamingRecovery` hasVisibleContent
  // guard so both chat surfaces keep what streamed instead of overwriting it.
  if (hasReceivedAnyContent) return { kind: 'finish_with_content' }

  const shouldRecover = shouldAttemptManualChatNonStreamingRecovery({
    nonStreamingRecoveryStarted,
    didObserveToolActivity,
    bffStreamRecoverySource,
    streamEndedWithoutCompletion,
  })
  if (shouldRecover) return { kind: 'started_recovery' }

  if (
    shouldShowTerminalErrorAfterSkippedRecovery({
      streamEndedWithoutCompletion,
      bffStreamRecoverySource,
      emptyStream,
      hasVisibleContent: hasReceivedAnyContent,
    })
  ) {
    return { kind: 'terminal_error' }
  }
  if (hasReceivedAnyContent) return { kind: 'finish_with_content' }
  // Tool ran but nothing user-visible rendered — never leave the drawer spinning.
  return { kind: 'terminal_error' }
}
