/**
 * Aurora Clarity wiring tests for `LiquidationInputsSection`.
 *
 * Locks in the contracts that the panel rebuild relies on:
 *   1. Every label-looking element is anchored to a real input via
 *      `htmlFor` → clicking the label focuses the input. Without this,
 *      labels are decorative and the panel feels "broken" (the bug the
 *      user reported on the previous chrome).
 *   2. Auto-prefill fires when the source signal arrives async after
 *      mount — covers the case where Hermes mappers settle after the
 *      form has rendered with blanks.
 *   3. Premise picker routes via `onAnyFieldChange` (string value), not
 *      `onFieldChange` (number/undefined only) — string values would
 *      silently drop on the numeric path.
 *   4. Reset button clears every `liq_*` field back to `undefined` so
 *      the engine falls through to its cohort defaults.
 *   5. Disclosure toggles pair `aria-expanded` + `aria-controls` and
 *      the panel they reveal carries the matching id — a11y wiring
 *      regression guard.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LiquidationInputsSection } from './LiquidationInputsSection'

// Lean, deterministic next-intl stub: returns keys / "key:k=v,…" strings so
// every assertion checks structure rather than copy.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}`
      : key,
  useLocale: () => 'en',
}))

const baseProps = {
  step: '5e' as const,
  onFieldChange: vi.fn(),
  onAnyFieldChange: vi.fn(),
}

function setup(extra: Partial<React.ComponentProps<typeof LiquidationInputsSection>> = {}) {
  const onFieldChange = vi.fn()
  const onAnyFieldChange = vi.fn()
  const result = render(
    <LiquidationInputsSection
      {...baseProps}
      onFieldChange={onFieldChange}
      onAnyFieldChange={onAnyFieldChange}
      {...extra}
    />
  )
  return { ...result, onFieldChange, onAnyFieldChange }
}

describe('LiquidationInputsSection', () => {
  it('anchors every essential label to a real input via htmlFor', () => {
    const { container } = setup()
    // Every <label> with a for/htmlFor must point at an element that
    // exists in the DOM — orphan labels are decorative and don't focus
    // their target on click, which is exactly the regression we want
    // to guard against.
    const labels = container.querySelectorAll<HTMLLabelElement>('label[for]')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of Array.from(labels)) {
      const targetId = label.getAttribute('for')!
      const target = container.querySelector(`#${CSS.escape(targetId)}`)
      expect(target, `label "${label.textContent}" should point at an input`).not.toBeNull()
    }
  })

  it('auto-prefills headcount when the source signal arrives after mount', () => {
    const { onFieldChange, rerender } = setup({ prefillSourceHeadcount: undefined })
    expect(onFieldChange).not.toHaveBeenCalled()

    // Simulate Hermes mapper settling: source signal arrives → prefill fires.
    rerender(
      <LiquidationInputsSection
        {...baseProps}
        onFieldChange={onFieldChange}
        prefillSourceHeadcount={5}
      />
    )
    expect(onFieldChange).toHaveBeenCalledWith('liq_headcount', 5)
  })

  it('routes premise override to onAnyFieldChange (string payload)', () => {
    const { container, onFieldChange, onAnyFieldChange } = setup()
    const select = container.querySelector(
      '[data-testid="liq-premise-override-select"]'
    ) as HTMLSelectElement
    expect(select).toBeTruthy()
    fireEvent.change(select, { target: { value: 'orderly_liquidation' } })
    expect(onAnyFieldChange).toHaveBeenCalledWith('liq_premise_override', 'orderly_liquidation')
    // Routing belongs on onAnyFieldChange — onFieldChange is for
    // number/undefined values only. Defending the contract.
    expect(onFieldChange).not.toHaveBeenCalledWith('liq_premise_override', expect.anything())
  })

  it('toggle pairs aria-expanded + aria-controls with a matching panel id', () => {
    setup()
    const toggle = screen.getByTestId('liq-advanced-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const controlsId = toggle.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    // Panel isn't rendered until the toggle opens.
    expect(document.getElementById(controlsId!)).toBeNull()
    act(() => {
      fireEvent.click(toggle)
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(controlsId!)
    expect(panel).not.toBeNull()
    expect(panel).toHaveAttribute('role', 'region')
  })

  it('reset button clears every liq_* essential + advanced + override field', () => {
    const { onFieldChange, onAnyFieldChange } = setup({
      liqHeadcount: 5,
      liqMonthlyRent: 1500,
      liqPaidUpCapital: 100_000,
      liqDeferredTax: 5000,
      liqPremiseOverride: 'orderly_liquidation',
      liqLiabilityBuckets: { unsecured: 25_000 },
      liqAssetOverrides: { cash: 10_000 },
    })
    onFieldChange.mockClear()
    onAnyFieldChange.mockClear()

    act(() => {
      fireEvent.click(screen.getByTestId('liq-reset-button'))
    })

    // Essentials clear via onFieldChange.
    expect(onFieldChange).toHaveBeenCalledWith('liq_headcount', undefined)
    expect(onFieldChange).toHaveBeenCalledWith('liq_monthly_rent', undefined)
    expect(onFieldChange).toHaveBeenCalledWith('liq_paid_up_capital', undefined)
    expect(onFieldChange).toHaveBeenCalledWith('liq_deferred_tax', undefined)
    // Per-tier liability buckets clear too.
    expect(onFieldChange).toHaveBeenCalledWith('liq_lb_unsecured', undefined)
    // Per-asset overrides clear too.
    expect(onFieldChange).toHaveBeenCalledWith('liq_ao_cash', undefined)
    // Premise override clears via onAnyFieldChange (it's a string field).
    expect(onAnyFieldChange).toHaveBeenCalledWith('liq_premise_override', undefined)
  })

  it('section header renders the localised subtitle (regression guard)', () => {
    // Previously the `ValuationSectionHeader.subtitle` prop was declared
    // but never rendered. The Liquidation panel was the only caller, so
    // this is the closest test we have to a regression alarm. The next-intl
    // mock returns the bare key the caller passed to `t(…)`, which is
    // `subtitle` for the header copy.
    const { container } = setup()
    expect(within(container).getByText('subtitle')).toBeInTheDocument()
  })
})
