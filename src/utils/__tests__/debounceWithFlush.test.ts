import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounceWithFlush } from '../debounce'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('flush completion', () => {
  it('saves the newest queued value immediately without waiting for the debounce timer', async () => {
    const save = vi.fn(async (value: number) => value)
    const debounced = debounceWithFlush(save, 500)
    const first = debounced(1)
    const latest = debounced(2)
    await debounced.flush()
    expect(save).toHaveBeenCalledExactlyOnceWith(2)
    await expect(first).resolves.toBe(2)
    await expect(latest).resolves.toBe(2)
  })

  it('keeps flush and queued callers pending until the last write is acknowledged', async () => {
    const a = deferred<number>(),
      b = deferred<number>(),
      c = deferred<number>()
    const save = vi
      .fn()
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
      .mockReturnValueOnce(c.promise)
    const debounced = debounceWithFlush(save, 500)
    const first = debounced(1)
    await vi.advanceTimersByTimeAsync(500)
    const second = debounced(2)
    const settled = vi.fn()
    const flush = debounced.flush().then(settled)
    a.resolve(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenNthCalledWith(2, 2)
    expect(settled).not.toHaveBeenCalled()
    const third = debounced(3)
    b.resolve(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenNthCalledWith(3, 3)
    expect(settled).not.toHaveBeenCalled()
    c.resolve(3)
    await flush
    await expect(Promise.all([first, second, third])).resolves.toEqual([3, 3, 3])
    expect(settled).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('reports a queued write failure to flush and permits an explicit retry', async () => {
    const first = deferred<number>()
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(2)
    const debounced = debounceWithFlush(save, 500)
    const a = debounced(1).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(500)
    const b = debounced(2).catch(() => undefined)
    const flush = expect(debounced.flush()).rejects.toThrow('offline')
    first.resolve(1)
    await flush
    await Promise.all([a, b])
    const retry = debounced(2)
    await debounced.flush()
    await expect(retry).resolves.toBe(2)
  })
})
