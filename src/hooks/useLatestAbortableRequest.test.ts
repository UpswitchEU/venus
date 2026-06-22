import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLatestAbortableRequest } from './useLatestAbortableRequest'

describe('useLatestAbortableRequest', () => {
  it('aborts the previous active request when a newer one is reserved', () => {
    const { result } = renderHook(() => useLatestAbortableRequest<{ query: string }>())

    const firstToken = result.current.reserveRequest({ query: 'Acme' })
    const firstRequest = result.current.beginRequest(firstToken)
    expect(firstRequest).not.toBeNull()
    expect(firstRequest?.isCurrent()).toBe(true)

    const secondToken = result.current.reserveRequest({ query: 'Beta' })

    expect(firstRequest?.signal.aborted).toBe(true)
    expect(firstRequest?.isCurrent()).toBe(false)

    const secondRequest = result.current.beginRequest(secondToken)
    expect(secondRequest?.context).toEqual({ query: 'Beta' })
    expect(secondRequest?.signal.aborted).toBe(false)
    expect(secondRequest?.isCurrent()).toBe(true)
  })

  it('ignores cleanup for an older token after a newer request is active', () => {
    const { result } = renderHook(() => useLatestAbortableRequest<{ query: string }>())

    const firstToken = result.current.reserveRequest({ query: 'Acme' })
    const secondToken = result.current.reserveRequest({ query: 'Beta' })
    const secondRequest = result.current.beginRequest(secondToken)

    result.current.cancelRequest(firstToken)

    expect(secondRequest?.signal.aborted).toBe(false)
    expect(secondRequest?.isCurrent()).toBe(true)
  })

  it('releases the active controller without invalidating the completed request token', () => {
    const { result } = renderHook(() => useLatestAbortableRequest<{ query: string }>())

    const token = result.current.reserveRequest({ query: 'Acme' })
    const request = result.current.beginRequest(token)

    request?.release()

    expect(request?.signal.aborted).toBe(false)
    expect(request?.isCurrent()).toBe(true)
  })
})
