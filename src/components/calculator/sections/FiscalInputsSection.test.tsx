import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { FiscalInputsSection } from './FiscalInputsSection'

// Mirror the next-intl mock pattern used by sibling section tests so the
// rendered text we assert on stays stable across locales.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
  useLocale: () => 'nl',
}))

// `ValuationSectionHeader` is exercised by its own tests; stub it down
// to a stable signature so we can assert composition without coupling
// to its DOM (it also pulls cn/utils which aren't worth wiring up here).
vi.mock('./ValuationSectionHeader', () => ({
  ValuationSectionHeader: ({
    step,
    title,
    complete,
  }: {
    step: number | string
    title: React.ReactNode
    complete?: boolean
  }) => (
    <div data-testid="section-header" data-complete={complete ? 'true' : 'false'}>
      <span data-testid="section-step">{step}</span>
      <span data-testid="section-title">{title}</span>
    </div>
  ),
}))

// AuroraInput drags in framer-motion, CVA variants, and clipboard
// handling that aren't relevant to a section-level test. Replace
// CurrencyInput with a plain controlled input that preserves the
// public contract our component depends on (id + ariaLabel + onChange).
vi.mock('../CurrencyInput', () => ({
  CurrencyInput: ({
    id,
    ariaLabel,
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    id?: string
    ariaLabel?: string
    value?: number
    onChange: (next: number | undefined) => void
    disabled?: boolean
    placeholder?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '')
        onChange(raw ? parseInt(raw, 10) : undefined)
      }}
    />
  ),
}))

function makeProps(overrides: Partial<React.ComponentProps<typeof FiscalInputsSection>> = {}) {
  return {
    step: 5,
    onFieldChange: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof FiscalInputsSection>
}

describe('FiscalInputsSection', () => {
  it('renders title + subtitle + step header with no anchors filled', () => {
    render(<FiscalInputsSection {...makeProps()} />)

    expect(screen.getByTestId('section-title')).toHaveTextContent('title')
    expect(screen.getByTestId('section-header')).toHaveAttribute('data-complete', 'true')
    expect(screen.getByText('subtitle')).toBeTruthy()
    expect(screen.getByTestId('fiscal-inputs-progress')).toHaveTextContent(
      'progress:filled=0,total=4'
    )
  })

  it('wires the first visible label to the input through htmlFor and aria-label', () => {
    render(<FiscalInputsSection {...makeProps()} />)

    // `getByLabelText` reaches into both <label htmlFor> and aria-label;
    // we want both signals because sighted users get the visible label
    // and assistive technology gets one clear composite name.
    const input = screen.getByLabelText('anchor1Eyebrow: anchor1Label')
    expect(input).toBeTruthy()
    expect(input.tagName).toBe('INPUT')
  })

  it('marks the section complete and increments the progress chip when anchor 1 is filled', () => {
    render(<FiscalInputsSection {...makeProps({ fiscalAcquisitionCost: 1_500_000 })} />)

    expect(screen.getByTestId('section-header')).toHaveAttribute('data-complete', 'true')
    expect(screen.getByTestId('fiscal-inputs-progress')).toHaveTextContent(
      'progress:filled=1,total=4'
    )
  })

  it('keeps the alternative-anchors disclosure collapsed by default', () => {
    render(<FiscalInputsSection {...makeProps()} />)

    const toggle = screen.getByTestId('fiscal-alternative-anchors-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('fiscal-alternative-anchors-panel')).toBeNull()
    // Counter chip reads 0 of 3 when nothing is filled.
    expect(screen.getByTestId('fiscal-alternative-anchors-count')).toHaveTextContent(
      'alternativeAnchorsCount:filled=0'
    )
  })

  it('opens the disclosure on click and flips aria-expanded', () => {
    render(<FiscalInputsSection {...makeProps()} />)

    fireEvent.click(screen.getByTestId('fiscal-alternative-anchors-toggle'))

    expect(screen.getByTestId('fiscal-alternative-anchors-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByTestId('fiscal-alternative-anchors-panel')).toBeTruthy()
    // All three alternative anchor inputs are now in the DOM.
    expect(screen.getByLabelText('anchor2Eyebrow: anchor2Short')).toBeTruthy()
    expect(screen.getByLabelText('anchor3Eyebrow: anchor3Short')).toBeTruthy()
    expect(screen.getByLabelText('anchor4Eyebrow: anchor4Short')).toBeTruthy()
  })

  it('auto-opens the disclosure when an alternative anchor is already filled on mount', () => {
    render(
      <FiscalInputsSection
        {...makeProps({
          fiscalAnchor3Value: 1_800_000,
        })}
      />
    )

    expect(screen.getByTestId('fiscal-alternative-anchors-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByTestId('fiscal-alternative-anchors-panel')).toBeTruthy()
    expect(screen.getByTestId('fiscal-alternative-anchors-count')).toHaveTextContent(
      'alternativeAnchorsCount:filled=1'
    )
  })

  it('auto-opens the disclosure when alt values hydrate after the initial render', () => {
    // Mounts cold, then receives an alternative anchor value via prop
    // hydration (e.g. saved-draft fetch resolving). Without the
    // hydration-aware effect this stayed collapsed and silently hid
    // the user's data.
    const { rerender } = render(<FiscalInputsSection {...makeProps()} />)
    expect(screen.getByTestId('fiscal-alternative-anchors-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    rerender(
      <FiscalInputsSection
        {...makeProps({
          fiscalAnchor2Value: 2_500_000,
        })}
      />
    )

    expect(screen.getByTestId('fiscal-alternative-anchors-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByTestId('fiscal-alternative-anchors-panel')).toBeTruthy()
  })

  it('does not auto-close the disclosure when the user blanks the only filled alt value', () => {
    // Opening the disclosure is a one-way ratchet so blanking a value
    // mid-edit doesn't yank the panel out from under the user.
    const { rerender } = render(
      <FiscalInputsSection
        {...makeProps({
          fiscalAnchor2Value: 1_000_000,
        })}
      />
    )
    expect(screen.getByTestId('fiscal-alternative-anchors-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    )

    rerender(<FiscalInputsSection {...makeProps()} />)

    expect(screen.getByTestId('fiscal-alternative-anchors-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('propagates field changes to onFieldChange with the engine field name', () => {
    const onFieldChange = vi.fn()
    render(<FiscalInputsSection {...makeProps({ onFieldChange })} />)

    fireEvent.change(screen.getByLabelText('anchor1Eyebrow: anchor1Label'), {
      target: { value: '1500000' },
    })

    expect(onFieldChange).toHaveBeenCalledWith('fiscal_acquisition_cost', 1_500_000)
  })

  it('propagates blank input as undefined (not 0)', () => {
    const onFieldChange = vi.fn()
    render(
      <FiscalInputsSection
        {...makeProps({
          fiscalAcquisitionCost: 1_500_000,
          onFieldChange,
        })}
      />
    )

    fireEvent.change(screen.getByLabelText('anchor1Eyebrow: anchor1Label'), {
      target: { value: '' },
    })

    // Engine field clears to undefined — not 0 — so the engine
    // distinguishes "advisor cleared the field" from "advisor typed 0".
    expect(onFieldChange).toHaveBeenCalledWith('fiscal_acquisition_cost', undefined)
  })

  it('disables every input when disabled=true', () => {
    render(
      <FiscalInputsSection
        {...makeProps({
          disabled: true,
          fiscalAnchor2Value: 1, // force disclosure open so we can probe alt inputs
        })}
      />
    )

    expect(screen.getByLabelText('anchor1Eyebrow: anchor1Label')).toBeDisabled()
    expect(screen.getByLabelText('anchor2Eyebrow: anchor2Short')).toBeDisabled()
    expect(screen.getByLabelText('anchor3Eyebrow: anchor3Short')).toBeDisabled()
    expect(screen.getByLabelText('anchor4Eyebrow: anchor4Short')).toBeDisabled()
  })

  it('counts all four anchors in the progress chip total', () => {
    render(
      <FiscalInputsSection
        {...makeProps({
          fiscalAcquisitionCost: 1_500_000,
          fiscalAnchor2Value: 1_700_000,
          fiscalAnchor3Value: 1_800_000,
          fiscalAnchor4Value: 2_100_000,
        })}
      />
    )

    expect(screen.getByTestId('fiscal-inputs-progress')).toHaveTextContent(
      'progress:filled=4,total=4'
    )
    expect(screen.getByTestId('fiscal-alternative-anchors-count')).toHaveTextContent(
      'alternativeAnchorsCount:filled=3'
    )
  })
})
