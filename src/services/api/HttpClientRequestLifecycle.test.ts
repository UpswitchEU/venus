import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManagedRequestLifecycle } from './HttpClientRequestLifecycle'

describe('HttpClientRequestLifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts the managed request signal when the transport timeout fires', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const lifecycle = createManagedRequestLifecycle({ onTimeout, timeoutMs: 50 })

    vi.advanceTimersByTime(50)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(lifecycle.signal.aborted).toBe(true)
    lifecycle.cleanup()
  })

  it('forwards caller aborts to the managed request signal', () => {
    const callerController = new AbortController()
    const lifecycle = createManagedRequestLifecycle({
      externalSignal: callerController.signal,
      onTimeout: vi.fn(),
      timeoutMs: 30000,
    })

    callerController.abort('caller-cancelled')

    expect(lifecycle.signal.aborted).toBe(true)
    expect(lifecycle.signal.reason).toBe('caller-cancelled')
    lifecycle.cleanup()
  })

  it('detaches the caller abort listener during cleanup', () => {
    const callerController = new AbortController()
    const lifecycle = createManagedRequestLifecycle({
      externalSignal: callerController.signal,
      onTimeout: vi.fn(),
      timeoutMs: 30000,
    })

    lifecycle.cleanup()
    callerController.abort()

    expect(lifecycle.signal.aborted).toBe(false)
  })
})
