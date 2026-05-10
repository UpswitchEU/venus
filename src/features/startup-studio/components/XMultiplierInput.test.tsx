/**
 * XMultiplierInput — direct unit tests.
 *
 * Pins three contract guarantees:
 *   1. Renders the floating label and the trailing ``×`` glyph (so the
 *      founder cannot mistake it for a percentage input).
 *   2. Numeric input typing fires ``onChange`` with the parsed number,
 *      not the raw string.
 *   3. Empty input fires ``onChange(undefined)`` so the consumer can
 *      clear the underlying store field.
 *
 * The component is otherwise a thin wrapper around ``AuroraInput`` +
 * ``useDecimalTextInputState`` — both have their own tests, so we only
 * cover the wiring and the affordance here.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { XMultiplierInput } from './XMultiplierInput'

describe('XMultiplierInput', () => {
  it('renders the label and the trailing × glyph', () => {
    render(
      <XMultiplierInput
        label="VC's target return multiple"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText("VC's target return multiple")).toBeTruthy()
    // The right-icon glyph is rendered as a literal ``×`` character.
    // ``aria-hidden`` keeps it off the a11y tree but it's still in the
    // DOM, so we can still assert on its presence.
    expect(screen.getByText('×')).toBeTruthy()
  })

  it('fires onChange with the parsed number when the founder types', () => {
    const onChange = vi.fn()
    render(<XMultiplierInput label="Target ROI" onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalled()
    // The decimal-text helper passes the parsed numeric value to the
    // consumer (not the raw string) — that's the contract callers rely
    // on when they write ``setField('target_roi_x', value ?? null)``.
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall?.[0]).toBe(30)
  })

  it('fires onChange(undefined) when the input is cleared', () => {
    const onChange = vi.fn()
    render(<XMultiplierInput label="Target ROI" value={30} onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall?.[0]).toBeUndefined()
  })

  it('renders the placeholder when value is empty', () => {
    render(
      <XMultiplierInput
        label="Target ROI"
        placeholder="20"
        onChange={vi.fn()}
      />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.placeholder).toBe('20')
  })

  it('renders a description below the input when supplied (engine-default hint)', () => {
    render(
      <XMultiplierInput
        label="Target ROI"
        onChange={vi.fn()}
        description="We pre-filled 20× for seed."
      />,
    )
    expect(screen.getByText('We pre-filled 20× for seed.')).toBeTruthy()
  })
})
