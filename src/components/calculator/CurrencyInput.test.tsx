import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CurrencyInput } from './CurrencyInput'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

describe('CurrencyInput', () => {
  it('uses text input mode when negative values are allowed', () => {
    render(
      <CurrencyInput value={-10} onChange={vi.fn()} allowNegative ariaLabel="Negative amount" />
    )

    expect(screen.getByLabelText('Negative amount')).toHaveAttribute('inputmode', 'text')
  })

  it('formats zero as a visible amount (not blank)', () => {
    render(<CurrencyInput value={0} onChange={vi.fn()} ariaLabel="Zero amount" />)
    const input = screen.getByLabelText('Zero amount') as HTMLInputElement
    expect(input.value).not.toBe('')
    expect(input.value).toMatch(/0/)
  })
  it('keeps numeric input mode for standard positive-only fields', () => {
    render(<CurrencyInput value={10} onChange={vi.fn()} ariaLabel="Positive amount" />)

    expect(screen.getByLabelText('Positive amount')).toHaveAttribute('inputmode', 'numeric')
  })
})
