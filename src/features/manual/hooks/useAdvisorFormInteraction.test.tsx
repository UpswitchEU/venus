import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAdvisorFormInteraction } from './useAdvisorFormInteraction'

describe('useAdvisorFormInteraction', () => {
  it('starts false and stays false without a real user event', () => {
    const { result } = renderHook(() => useAdvisorFormInteraction())
    expect(result.current()).toBe(false)
  })

  it('does not trip when a value is set programmatically (prefill / restoration)', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const { result } = renderHook(() => useAdvisorFormInteraction())

    // What hydration does: assign the value. No native event is dispatched.
    input.value = 'BV'

    expect(result.current()).toBe(false)
    input.remove()
  })

  it.each(['input', 'change', 'keydown'])('trips on a real %s event', (eventType) => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const { result } = renderHook(() => useAdvisorFormInteraction())

    input.dispatchEvent(new Event(eventType, { bubbles: true }))

    expect(result.current()).toBe(true)
    input.remove()
  })

  it('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useAdvisorFormInteraction())
    const read = result.current
    unmount()

    document.body.dispatchEvent(new Event('input', { bubbles: true }))

    expect(read()).toBe(false)
  })
})
