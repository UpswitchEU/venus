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

  if (streamEndedIncomplete) {
    return { kind: 'recover', streamEndedWithoutCompletion: true, emptyStream: false }
  }
  if (!hasReceivedAnyContent) {
    return { kind: 'recover', streamEndedWithoutCompletion: false, emptyStream: true }
  }
  return { kind: 'complete' }
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
