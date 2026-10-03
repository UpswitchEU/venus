import { fireEvent, render, screen } from '@testing-library/react'
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

    expect(screen.getByLabelText('Negative amount')).toHaveAttribute('inputmode', 'decimal')
  })

  it('formats zero as a visible amount (not blank)', () => {
    render(<CurrencyInput value={0} onChange={vi.fn()} ariaLabel="Zero amount" />)
    const input = screen.getByLabelText('Zero amount') as HTMLInputElement
    expect(input.value).not.toBe('')
    expect(input.value).toMatch(/0/)
  })
  it('keeps numeric input mode for standard positive-only fields', () => {
    render(<CurrencyInput value={10} onChange={vi.fn()} ariaLabel="Positive amount" />)

    expect(screen.getByLabelText('Positive amount')).toHaveAttribute('inputmode', 'decimal')
  })

  it('preserves cents and rejects malformed or unrepresentable monetary input visibly', () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={10} onChange={onChange} ariaLabel="Money" allowNegative />)
    const input = screen.getByLabelText('Money')
    fireEvent.change(input, { target: { value: '1,000.25' } })
    expect(onChange).toHaveBeenLastCalledWith(1000.25)
    fireEvent.change(input, { target: { value: '-100.25' } })
    expect(onChange).toHaveBeenLastCalledWith(-100.25)
    for (const value of ['12abc', '9007199254740993.01']) {
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)
      expect(onChange).toHaveBeenLastCalledWith(undefined)
      expect(input).toHaveValue(value)
      expect(input).toHaveAttribute('aria-invalid', 'true')
    }
    fireEvent.paste(input, { clipboardData: { getData: () => '0' } })
    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(input).toHaveValue('0')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })
})
