import { describe, expect, it } from 'vitest'
import {
  resolveManualChatOnDoneAction,
  resolveManualChatOnErrorAction,
  resolveManualChatRecoverySkipAction,
} from './manualChatStreamTurnHandlers'

describe('resolveManualChatOnDoneAction', () => {
  it('completes when visible content arrived and stream finished cleanly', () => {
    expect(
      resolveManualChatOnDoneAction({
        hasReceivedAnyContent: true,
        bffStreamRecoverySource: null,
      })
    ).toEqual({ kind: 'complete' })
  })

  it('recovers on empty stream', () => {
    expect(
      resolveManualChatOnDoneAction({
        hasReceivedAnyContent: false,
        bffStreamRecoverySource: null,
      })
    ).toEqual({
      kind: 'recover',
      streamEndedWithoutCompletion: false,
      emptyStream: true,
    })
  })

  it('keeps streamed text after bff-stream-incomplete when content already arrived', () => {
    // Regression: an incomplete terminator after visible text used to trigger a
    // non-streaming regenerate that overwrote the bubble (the "rewriting bubble"
    // bug). Visible content must complete, never recover-and-replace.
    expect(
      resolveManualChatOnDoneAction({
        hasReceivedAnyContent: true,
        bffStreamRecoverySource: 'bff-stream-incomplete',
      })
    ).toEqual({ kind: 'complete' })
  })

  it('keeps streamed text when meta.incomplete fires after content', () => {
    expect(
      resolveManualChatOnDoneAction({
        hasReceivedAnyContent: true,
        bffStreamRecoverySource: null,
        streamIncomplete: true,
      })
    ).toEqual({ kind: 'complete' })
  })

  it('still recovers after bff-stream-incomplete when no content arrived', () => {
    expect(
      resolveManualChatOnDoneAction({
        hasReceivedAnyContent: false,
        bffStreamRecoverySource: 'bff-stream-incomplete',
      })
    ).toEqual({
      kind: 'recover',
      streamEndedWithoutCompletion: true,
      emptyStream: false,
    })
  })
})

describe('resolveManualChatOnErrorAction', () => {
  it('matches Mercury: recover on error SSE when no visible content', () => {
    expect(resolveManualChatOnErrorAction({ hasReceivedAnyContent: false })).toEqual({
      kind: 'recover',
      streamEndedWithoutCompletion: true,
    })
  })

  it('finishes when BFF already delivered visible content before error SSE', () => {
    expect(resolveManualChatOnErrorAction({ hasReceivedAnyContent: true })).toEqual({
      kind: 'finish_with_content',
    })
  })
})

describe('resolveManualChatRecoverySkipAction', () => {
  it('starts recovery after bff-fallback-failed', () => {
    expect(
      resolveManualChatRecoverySkipAction({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: true,
        bffStreamRecoverySource: 'bff-fallback-failed',
        streamEndedWithoutCompletion: true,
        emptyStream: false,
        hasReceivedAnyContent: false,
      })
    ).toEqual({ kind: 'started_recovery' })
  })

  it('skips duplicate recovery when BFF already recovered on wire', () => {
    expect(
      resolveManualChatRecoverySkipAction({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: false,
        bffStreamRecoverySource: 'bff-fallback',
        streamEndedWithoutCompletion: false,
        emptyStream: true,
        hasReceivedAnyContent: false,
      })
    ).toEqual({ kind: 'terminal_error' })
  })

  it('preserves partial content when layer-3 is skipped after BFF success', () => {
    expect(
      resolveManualChatRecoverySkipAction({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: false,
        bffStreamRecoverySource: 'bff-fallback',
        streamEndedWithoutCompletion: true,
        emptyStream: false,
        hasReceivedAnyContent: true,
      })
    ).toEqual({ kind: 'finish_with_content' })
  })

  it('shows terminal error when tools ran but nothing user-visible rendered', () => {
    expect(
      resolveManualChatRecoverySkipAction({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: true,
        bffStreamRecoverySource: null,
        streamEndedWithoutCompletion: false,
        emptyStream: false,
        hasReceivedAnyContent: false,
      })
    ).toEqual({ kind: 'terminal_error' })
  })

  it('keeps streamed content instead of regenerating when stream ended incomplete', () => {
    expect(
      resolveManualChatRecoverySkipAction({
        nonStreamingRecoveryStarted: false,
        didObserveToolActivity: false,
        bffStreamRecoverySource: 'bff-stream-incomplete',
        streamEndedWithoutCompletion: true,
        emptyStream: false,
        hasReceivedAnyContent: true,
      })
    ).toEqual({ kind: 'finish_with_content' })
  })
})
