import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuyerReadyRoomPayload } from './types'
import {
  type BuyerReadyRoomFetcher,
  getBuyerReadyRoomErrorMessage,
  useBuyerReadyRoomLoader,
} from './useBuyerReadyRoomLoader'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function room(entityId: string): BuyerReadyRoomPayload {
  return { entityId } as BuyerReadyRoomPayload
}

describe('useBuyerReadyRoomLoader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('aborts entity-change requests and ignores stale completion', async () => {
    const first = deferred<BuyerReadyRoomPayload>()
    const second = deferred<BuyerReadyRoomPayload>()
    const fetcher = vi.fn<BuyerReadyRoomFetcher>((entityId) =>
      entityId === 'entity-a' ? first.promise : second.promise
    )

    const { result, rerender } = renderHook(
      ({ entityId }) => useBuyerReadyRoomLoader(entityId, fetcher),
      { initialProps: { entityId: 'entity-a' } }
    )

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const firstSignal = fetcher.mock.calls[0]?.[1]

    rerender({ entityId: 'entity-b' })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      first.resolve(room('entity-a'))
      await first.promise
    })

    expect(result.current.payload).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => {
      second.resolve(room('entity-b'))
      await second.promise
    })

    expect(result.current.payload?.entityId).toBe('entity-b')
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('keeps the latest manual reload when earlier reloads settle later', async () => {
    const initial = deferred<BuyerReadyRoomPayload>()
    const staleReload = deferred<BuyerReadyRoomPayload>()
    const latestReload = deferred<BuyerReadyRoomPayload>()
    const fetcher = vi
      .fn<BuyerReadyRoomFetcher>()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(staleReload.promise)
      .mockReturnValueOnce(latestReload.promise)

    const { result } = renderHook(() => useBuyerReadyRoomLoader('entity-a', fetcher))

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await act(async () => {
      initial.resolve(room('initial'))
      await initial.promise
    })

    let stalePromise: Promise<void> = Promise.resolve()
    let latestPromise: Promise<void> = Promise.resolve()
    act(() => {
      stalePromise = result.current.reload()
      latestPromise = result.current.reload()
    })

    expect(fetcher).toHaveBeenCalledTimes(3)

    await act(async () => {
      latestReload.resolve(room('latest'))
      await latestPromise
    })

    expect(result.current.payload?.entityId).toBe('latest')
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)

    await act(async () => {
      staleReload.reject(new Error('stale failure'))
      await stalePromise
    })

    expect(result.current.payload?.entityId).toBe('latest')
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('normalizes unknown loader failures', () => {
    expect(getBuyerReadyRoomErrorMessage('broken')).toBe('Buyer-ready room failed')
    expect(getBuyerReadyRoomErrorMessage(new Error('specific failure'))).toBe('specific failure')
  })
})
