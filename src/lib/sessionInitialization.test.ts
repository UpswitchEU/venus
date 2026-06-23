import { describe, expect, it, vi } from 'vitest'
import { waitForAuthStoreReadiness } from './sessionInitialization'

type AuthReadinessState = {
  loading: boolean
}

const timeoutHandle = 42 as unknown as ReturnType<typeof setTimeout>

function makeAuthReadinessStore(initialLoading: boolean) {
  let state: AuthReadinessState = { loading: initialLoading }
  const listeners = new Set<(nextState: AuthReadinessState) => void>()

  const store = {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: (nextState: AuthReadinessState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
  }

  return {
    listenerCount: () => listeners.size,
    setLoading: (loading: boolean) => {
      state = { loading }
      listeners.forEach((listener) => listener(state))
    },
    store,
  }
}

function makeTimerFns() {
  let scheduledHandler: (() => void) | null = null
  const setTimeoutFn = vi.fn((handler: () => void) => {
    scheduledHandler = handler
    return timeoutHandle
  })
  const clearTimeoutFn = vi.fn()

  return {
    clearTimeoutFn,
    fireTimeout: () => scheduledHandler?.(),
    setTimeoutFn,
  }
}

describe('waitForAuthStoreReadiness', () => {
  it('does not subscribe or schedule a timer when auth is already ready', async () => {
    const auth = makeAuthReadinessStore(false)
    const timers = makeTimerFns()

    await waitForAuthStoreReadiness(auth.store, {
      clearTimeoutFn: timers.clearTimeoutFn,
      setTimeoutFn: timers.setTimeoutFn,
    })

    expect(auth.store.subscribe).not.toHaveBeenCalled()
    expect(timers.setTimeoutFn).not.toHaveBeenCalled()
    expect(timers.clearTimeoutFn).not.toHaveBeenCalled()
  })

  it('cleans up the timeout and subscription when auth becomes ready', async () => {
    const auth = makeAuthReadinessStore(true)
    const timers = makeTimerFns()

    const wait = waitForAuthStoreReadiness(auth.store, {
      clearTimeoutFn: timers.clearTimeoutFn,
      setTimeoutFn: timers.setTimeoutFn,
      timeoutMs: 1234,
    })

    expect(auth.listenerCount()).toBe(1)
    expect(timers.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1234)

    auth.setLoading(false)
    await expect(wait).resolves.toBeUndefined()

    expect(timers.clearTimeoutFn).toHaveBeenCalledWith(timeoutHandle)
    expect(auth.listenerCount()).toBe(0)
  })

  it('cleans up the subscription when auth readiness times out', async () => {
    const auth = makeAuthReadinessStore(true)
    const timers = makeTimerFns()

    const wait = waitForAuthStoreReadiness(auth.store, {
      clearTimeoutFn: timers.clearTimeoutFn,
      setTimeoutFn: timers.setTimeoutFn,
      timeoutMs: 1234,
    })

    expect(auth.listenerCount()).toBe(1)

    timers.fireTimeout()
    await expect(wait).rejects.toThrow('Auth initialization timeout')

    expect(timers.clearTimeoutFn).toHaveBeenCalledWith(timeoutHandle)
    expect(auth.listenerCount()).toBe(0)
  })
})
