import { describe, expect, it, vi } from 'vitest'
import { createManualFormPrefillScheduler } from './manualFormPrefillScheduler'

type FrameCallback = FrameRequestCallback
type TimerCallback = () => void

function makeFrameFns() {
  let nextHandle = 1
  const callbacks = new Map<number, FrameCallback>()
  const requestFrame = vi.fn((callback: FrameCallback) => {
    const handle = nextHandle
    nextHandle += 1
    callbacks.set(handle, callback)
    return handle
  })
  const cancelFrame = vi.fn((handle: number) => {
    callbacks.delete(handle)
  })

  return {
    cancelFrame,
    fireFrame: (handle: number) => callbacks.get(handle)?.(0),
    requestFrame,
  }
}

function makeTimerFns() {
  let nextHandle = 100
  const callbacks = new Map<number, TimerCallback>()
  const setTimeoutFn = vi.fn((callback: TimerCallback) => {
    const handle = nextHandle
    nextHandle += 1
    callbacks.set(handle, callback)
    return handle as unknown as ReturnType<typeof setTimeout>
  })
  const clearTimeoutFn = vi.fn((handle: ReturnType<typeof setTimeout>) => {
    callbacks.delete(handle as unknown as number)
  })

  return {
    clearTimeoutFn,
    fireTimer: (handle: number) => callbacks.get(handle)?.(),
    setTimeoutFn,
  }
}

describe('createManualFormPrefillScheduler', () => {
  it('dedupes prefill work until the guard release timer fires', () => {
    const frames = makeFrameFns()
    const timers = makeTimerFns()
    const scheduler = createManualFormPrefillScheduler({
      cancelFrame: frames.cancelFrame,
      clearTimeoutFn: timers.clearTimeoutFn,
      requestFrame: frames.requestFrame,
      setTimeoutFn: timers.setTimeoutFn,
    })
    const run = vi.fn()

    expect(scheduler.trySchedule(run)).toBe(true)
    expect(scheduler.trySchedule(run)).toBe(false)

    frames.fireFrame(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(timers.setTimeoutFn).toHaveBeenCalledTimes(1)
    expect(scheduler.trySchedule(run)).toBe(false)

    timers.fireTimer(100)
    expect(scheduler.trySchedule(run)).toBe(true)
    frames.fireFrame(2)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending frame and release timer when reset runs', () => {
    const frames = makeFrameFns()
    const timers = makeTimerFns()
    const scheduler = createManualFormPrefillScheduler({
      cancelFrame: frames.cancelFrame,
      clearTimeoutFn: timers.clearTimeoutFn,
      requestFrame: frames.requestFrame,
      setTimeoutFn: timers.setTimeoutFn,
    })
    const run = vi.fn()

    expect(scheduler.trySchedule(run)).toBe(true)
    scheduler.reset()
    expect(frames.cancelFrame).toHaveBeenCalledWith(1)

    frames.fireFrame(1)
    expect(run).not.toHaveBeenCalled()

    expect(scheduler.trySchedule(run)).toBe(true)
    frames.fireFrame(2)
    expect(run).toHaveBeenCalledTimes(1)

    scheduler.reset()
    expect(timers.clearTimeoutFn).toHaveBeenCalledWith(100)
  })
})
