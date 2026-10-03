import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InlineCurrencyInput } from './InlineCurrencyInput'

const language = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', () => ({ useLocale: () => language.value }))
beforeEach(() => {
  language.value = 'en'
})

function Harness() {
  const [value, setValue] = useState<number | undefined>(0)
  return (
    <>
      <InlineCurrencyInput value={value} onChange={setValue} allowNegative ariaLabel="Cash flow" />
      <output>{String(value)}</output>
    </>
  )
}

describe('inline financial amounts', () => {
  it.each([
    ['en', 'Enter a valid number.'],
    ['nl', 'Voer een geldig getal in.'],
    ['fr', 'Saisissez un nombre valide.'],
  ])('localizes native validation in %s from the first invalid change', (locale, message) => {
    language.value = locale
    render(<Harness />)
    const input = screen.getByLabelText('Cash flow') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'invalid' } })
    expect(input.validationMessage).toBe(message)
    fireEvent.blur(input)
    expect(input.validationMessage).toBe(message)
  })

  it('preserves cents, zero and losses through typing and blur', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Cash flow')
    for (const [draft, expected] of [
      ['1,000.25', '1000.25'],
      ['-100.05', '-100.05'],
      ['0', '0'],
    ]) {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: draft } })
      fireEvent.blur(input)
      expect(screen.getByRole('status')).toHaveTextContent(expected)
      expect(input).toHaveValue(expected)
    }
  })

  it('retains invalid drafts visibly without submitting a truncated or rounded amount', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Cash flow') as HTMLInputElement
    for (const draft of ['12abc', '1.2.3', '9007199254740993.01']) {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: draft } })
      fireEvent.blur(input)
      fireEvent.focus(input)
      expect(input).toHaveValue(draft)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.checkValidity()).toBe(false)
      expect(screen.getByRole('status')).toHaveTextContent('undefined')
    }
  })

  it('rejects negative input in a nonnegative field rather than changing its sign', () => {
    const onChange = vi.fn()
    render(<InlineCurrencyInput value={10} onChange={onChange} ariaLabel="Cash" />)
    const input = screen.getByLabelText('Cash')
    fireEvent.change(input, { target: { value: '-5' } })
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})
