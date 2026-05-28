import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVenusAiDockFocus } from './useVenusAiDockFocus'

describe('useVenusAiDockFocus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores focus to the previously focused element when the dock closes', () => {
    vi.useFakeTimers()
    const trigger = document.createElement('button')
    const textarea = document.createElement('textarea')
    document.body.append(trigger, textarea)
    trigger.focus()

    const focusRef = createRef<HTMLTextAreaElement>()
    focusRef.current = textarea

    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useVenusAiDockFocus(open, focusRef, false),
      { initialProps: { open: true } }
    )

    rerender({ open: false })

    expect(document.activeElement).toBe(trigger)
    trigger.remove()
    textarea.remove()
  })
})
