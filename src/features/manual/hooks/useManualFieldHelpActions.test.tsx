// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FieldHelpContext } from '@/components/calculator'
import { useManualFieldHelpActions } from './useManualFieldHelpActions'

function makeContext(overrides: Partial<FieldHelpContext> = {}): FieldHelpContext {
  return {
    field: 'other',
    label: 'Revenue',
    ...overrides,
  }
}

function renderActions(locale = 'en') {
  const handleChatMessage = vi.fn().mockResolvedValue(undefined)
  const setChatDrawerOpen = vi.fn()
  const setFieldContext = vi.fn()

  const hook = renderHook(() =>
    useManualFieldHelpActions({
      currentLocale: locale,
      handleChatMessage,
      setChatDrawerOpen,
      setFieldContext,
    })
  )

  return {
    ...hook,
    handleChatMessage,
    setChatDrawerOpen,
    setFieldContext,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useManualFieldHelpActions', () => {
  it('opens the drawer immediately and sends the field prompt after the delay', () => {
    vi.useFakeTimers()
    const { result, handleChatMessage, setChatDrawerOpen, setFieldContext } = renderActions()

    act(() => {
      result.current.handleFieldHelpRequest(makeContext({ field: 'ebitda', label: 'EBITDA 2025' }))
    })

    expect(setFieldContext).toHaveBeenCalledWith({
      field: 'ebitda',
      label: 'EBITDA 2025',
      hint: undefined,
      value: undefined,
    })
    expect(setChatDrawerOpen).toHaveBeenCalledWith(true)
    expect(handleChatMessage).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(handleChatMessage).toHaveBeenCalledWith(
      'Explain the EBITDA bridge for EBITDA 2025 — reported vs normalized and applied addbacks.',
      undefined,
      undefined,
      undefined,
      'explain_ebitda'
    )
  })

  it('cancels a stale pending prompt when a newer field-help request arrives', () => {
    vi.useFakeTimers()
    const { result, handleChatMessage } = renderActions('nl')

    act(() => {
      result.current.handleFieldHelpRequest(makeContext({ field: 'rent', label: 'Huur' }))
      vi.advanceTimersByTime(150)
      result.current.handleFieldHelpRequest(
        makeContext({ field: 'ownerSalary', label: 'Eigenaarssalaris' })
      )
      vi.advanceTimersByTime(299)
    })

    expect(handleChatMessage).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(handleChatMessage).toHaveBeenCalledTimes(1)
    expect(handleChatMessage).toHaveBeenCalledWith(
      'Wat is een marktconform eigenaarssalaris voor dit bedrijf?',
      undefined,
      undefined,
      undefined,
      undefined
    )
  })

  it('clears the delayed prompt on unmount', () => {
    vi.useFakeTimers()
    const { result, unmount, handleChatMessage } = renderActions()

    act(() => {
      result.current.handleFieldHelpRequest(makeContext({ label: 'Rent' }))
    })

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(handleChatMessage).not.toHaveBeenCalled()
  })
})
