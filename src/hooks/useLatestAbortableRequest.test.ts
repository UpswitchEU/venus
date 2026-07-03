import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLatestAbortableRequest } from './useLatestAbortableRequest'

describe('useLatestAbortableRequest', () => {
  it('aborts the previous active request when a newer one is reserved', () => {
    const { result } = renderHook(() => useLatestAbortableRequest<{ query: string }>())

    const firstRequestId = result.current.reserveRequest({ query: 'Acme' })
    const firstRequest = result.current.beginRequest(firstRequestId)
    expect(firstRequest).not.toBeNull()
    expect(firstRequest?.isCurrent()).toBe(true)

    const secondRequestId = result.current.reserveRequest({ query: 'Beta' })

    expect(firstRequest?.signal.aborted).toBe(true)
    expect(firstRequest?.isCurrent()).toBe(false)

    const secondRequest = result.current.beginRequest(secondRequestId)
    expect(secondRequest?.context).toEqual({ query: 'Beta' })
    expect(secondRequest?.signal.aborted).toBe(false)
    expect(secondRequest?.isCurrent()).toBe(true)
  })

  it('ignores cleanup for an older request id after a newer request is active', () => {
    const { result } = renderHook(() => useLatestAbortableRequest<{ query: string }>())

    const firstRequestId = result.current.reserveRequest({ query: 'Acme' })
    const secondRequestId = result.current.reserveRequest({ query: 'Beta' })
    const secondRequest = result.current.beginRequest(secondRequestId)

    result.current.cancelRequest(firstRequestId)

    expect(secondRequest?.signal.aborted).toBe(false)
    expect(secondRequest?.isCurrent()).toBe(true)
  })

  it('releases the active controller without invalidating the completed request id', () => {
    const { result } = renderHook(() => useLatestAbortableRequest<{ query: string }>())

    const requestId = result.current.reserveRequest({ query: 'Acme' })
    const request = result.current.beginRequest(requestId)

    request?.release()

    expect(request?.signal.aborted).toBe(false)
    expect(request?.isCurrent()).toBe(true)
  })
})
