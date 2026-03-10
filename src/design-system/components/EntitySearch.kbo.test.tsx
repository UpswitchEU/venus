import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    typeof values?.count === 'number' ? `${key}:${values.count}` : key,
}))

import { KBOSearchInput } from './EntitySearch'

function TestHarness({
  searchFn,
}: {
  searchFn: (query: string, signal?: AbortSignal) => Promise<unknown[]>
}) {
  const [value, setValue] = React.useState('')

  return (
    <KBOSearchInput
      label="Bedrijfsnaam of KBO-nummer"
      value={value}
      onChange={setValue}
      onCompanySelect={vi.fn()}
      onClear={vi.fn()}
      searchFn={searchFn}
      selectedCompany={null}
      debounceMs={10}
    />
  )
}

describe('Venus KBOSearchInput', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores whitespace-only input for min-length gating', async () => {
    vi.useFakeTimers()
    const searchFn = vi.fn().mockResolvedValue([])

    render(<TestHarness searchFn={searchFn} />)

    const input = screen.getByLabelText('Bedrijfsnaam of KBO-nummer')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '   ' } })

    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    expect(searchFn).not.toHaveBeenCalled()
  })

  it('passes a trimmed query to the search function', async () => {
    vi.useFakeTimers()
    const searchFn = vi.fn().mockResolvedValue([])

    render(<TestHarness searchFn={searchFn} />)

    const input = screen.getByLabelText('Bedrijfsnaam of KBO-nummer')
    fireEvent.change(input, { target: { value: '  mix-media  ' } })

    await act(async () => {
      vi.advanceTimersByTime(20)
      await Promise.resolve()
    })

    expect(searchFn).toHaveBeenCalledTimes(1)
    expect(searchFn.mock.calls[0]?.[0]).toBe('mix-media')
    expect(searchFn.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal)
  })
})
