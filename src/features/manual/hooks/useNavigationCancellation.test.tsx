import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useIsMountedRef, useLatestRef } from './useNavigationCancellation'

describe('useIsMountedRef', () => {
  it('returns ref.current = true while mounted', () => {
    const { result } = renderHook(() => useIsMountedRef())
    expect(result.current.current).toBe(true)
  })

  it('flips ref.current to false on unmount', () => {
    const { result, unmount } = renderHook(() => useIsMountedRef())
    expect(result.current.current).toBe(true)
    unmount()
    expect(result.current.current).toBe(false)
  })

  it('returns the same ref object across rerenders (stable identity)', () => {
    const { result, rerender } = renderHook(() => useIsMountedRef())
    const firstRef = result.current
    rerender()
    expect(result.current).toBe(firstRef)
  })
})

describe('useLatestRef', () => {
  it('initialises ref.current with the passed value', () => {
    const { result } = renderHook(() => useLatestRef('a'))
    expect(result.current.current).toBe('a')
  })

  it('updates ref.current when the value changes', () => {
    const { result, rerender } = renderHook(({ v }) => useLatestRef(v), {
      initialProps: { v: 'a' },
    })
    expect(result.current.current).toBe('a')
    rerender({ v: 'b' })
    expect(result.current.current).toBe('b')
    rerender({ v: 'c' })
    expect(result.current.current).toBe('c')
  })

  it('returns the same ref object across rerenders (stable identity)', () => {
    const { result, rerender } = renderHook(({ v }) => useLatestRef(v), {
      initialProps: { v: 1 },
    })
    const firstRef = result.current
    rerender({ v: 2 })
    expect(result.current).toBe(firstRef)
  })

  it('handles primitive types', () => {
    const { result, rerender } = renderHook(({ v }) => useLatestRef(v), {
      initialProps: { v: 42 as number | null },
    })
    expect(result.current.current).toBe(42)
    rerender({ v: null })
    expect(result.current.current).toBeNull()
  })

  it('handles object identity changes', () => {
    const obj1 = { id: 'a' }
    const obj2 = { id: 'b' }
    const { result, rerender } = renderHook(({ v }) => useLatestRef(v), {
      initialProps: { v: obj1 },
    })
    expect(result.current.current).toBe(obj1)
    rerender({ v: obj2 })
    expect(result.current.current).toBe(obj2)
  })
})
