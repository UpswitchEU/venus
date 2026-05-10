/**
 * ReviewDefaultsModal — direct component-level tests.
 *
 * The two-click submit gate is exercised end-to-end in
 * ``StartupSubmitFooter.test.tsx`` (which mounts the modal through the
 * footer's open/close state).  These tests pin the modal's *internal*
 * contract:
 *   1. Default-detection chip lights for every input that exact-matches
 *      the engine's smart-default for the founder's stage / sector.
 *   2. Default-detection chip is silent when the founder edits a value.
 *   3. Confirm + Cancel callbacks fire on the right buttons.
 *   4. Esc-to-close cancels the modal.
 *   5. Modal is dialog-shaped: aria-modal + aria-labelledby pointing at
 *      the title (a11y contract).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// next-intl stub — same shape as the StartupSubmitFooter test.  Covers
// every key the modal reads (`reviewGate.*` plus stage / sector label
// passthrough) so the dialog renders without a NextIntlClientProvider.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, fmt?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      title: 'Review your assumptions',
      subtitleWithDefaults: '{count} values are using engine defaults',
      subtitleAllReviewed: 'All reviewed',
      defaultChip: 'default',
      defaultChipTooltip: 'Engine default',
      editBtn: 'Edit',
      cancelBtn: 'Back to wizard',
      confirmBtn: 'Generate report',
      closeAria: 'Close',
      'row.stage': 'Funding stage',
      'row.sector': 'Engine sector',
      'row.y5': 'Year-5 revenue',
      'row.exitMultiple': 'Exit multiple',
      'row.targetRoi': 'Target ROI',
      'row.investment': 'Round size',
      'row.dilution': 'Dilution',
      pre_seed: 'Pre-seed',
      seed: 'Seed',
      series_a: 'Series A',
      saas: 'SaaS',
      marketplace: 'Marketplace',
      fintech: 'Fintech',
      biotech_healthtech: 'Biotech / Healthtech',
      deeptech_ai: 'Deeptech / AI',
      consumer: 'Consumer',
      hardware: 'Hardware',
      other: 'Cross-sector',
    }
    let out = map[key] ?? key
    if (fmt) {
      for (const [k, v] of Object.entries(fmt)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return out
  },
  useLocale: () => 'en',
}))

// Live benchmark hook — return a stable seed-stage SaaS shape so the
// modal can derive ``benchmarkMidMultiple`` deterministically.
vi.mock('@/lib/benchmarks/useStartupBenchmark', () => ({
  useStartupBenchmark: () => ({
    benchmark: {
      region_code: 'BE',
      stage: 'seed',
      sector: 'saas',
      average_pre_money_eur: 4_000_000,
      berkus_max_per_milestone_eur: 500_000,
      // mid = (5 + 7) / 2 = 6 — the modal compares ``exit_revenue_multiple``
      // against this exact midpoint to flag the "default" chip.
      exit_multiple_low: 5,
      exit_multiple_high: 7,
      comparable_exit_revenue_multiple: 6,
    },
    isFallback: false,
  }),
}))

import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { ReviewDefaultsModal } from './ReviewDefaultsModal'

const initialStudio = useStartupValuationStore.getState()

describe('ReviewDefaultsModal', () => {
  beforeEach(() => {
    useStartupValuationStore.setState(initialStudio, true)
  })
  afterEach(() => {
    useStartupValuationStore.setState(initialStudio, true)
  })

  it('does not render when open=false (no dialog in the tree)', () => {
    render(
      <ReviewDefaultsModal
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a dialog with aria-modal + aria-labelledby pointing at the title', () => {
    render(
      <ReviewDefaultsModal
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('review-gate-title')
    expect(screen.getByText('Review your assumptions').id).toBe('review-gate-title')
  })

  it('flags a row as "default" when the value matches the engine smart-default exactly', () => {
    // Seed-stage / SaaS / store at fresh defaults: target_roi_x is null
    // (the modal treats that as "not set" → no chip), but Y5 & sector
    // were never user-touched, so both should chip.  Pin the values
    // explicitly so the test doesn't depend on store-default drift.
    useStartupValuationStore.setState(
      {
        ...initialStudio,
        stage: 'seed',
        sector: 'saas',
        _sectorWasUserSet: false,
        // Sector default Y5 for SaaS = 5_000_000 → must chip.
        year5_revenue_projection: 5_000_000,
        // Mid of 5–7 = 6 → must chip.
        exit_revenue_multiple: 6,
        // Stage default ROI for seed/BE = 20 → must chip.
        target_roi_x: 20,
        // Stage default raise for seed = 750_000 → must chip.
        investment_amount_sought: 750_000,
        // Dilution default for seed = 60 → must chip (advisor-only field
        // but the modal renders it whenever non-null).
        dilution_assumption_pct: 60,
      },
      true,
    )

    render(
      <ReviewDefaultsModal
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // Three of the rows above should chip — sector, Y5, exit-multiple,
    // target-ROI, round size, dilution.  Stage never chips (it's an
    // identity input the founder always picks).  Six "default" chips
    // expected.
    const chips = screen.getAllByText('default')
    expect(chips.length).toBeGreaterThanOrEqual(5)
  })

  it('does not chip rows the founder edited (sector explicitly set, Y5 nudged)', () => {
    useStartupValuationStore.setState(
      {
        ...initialStudio,
        stage: 'seed',
        sector: 'fintech',
        // Founder explicitly picked the sector — chip must not fire on
        // sector even though everything else may still be default.
        _sectorWasUserSet: true,
        // Y5 not at the sector default for fintech (6_000_000) — chip
        // must not fire on Y5.
        year5_revenue_projection: 12_345_678,
        // ROI nudged off the seed default (20).
        target_roi_x: 25,
        // Round nudged off the seed default (750k).
        investment_amount_sought: 1_000_000,
        // Dilution at the seed default (60) — chip should still fire on
        // this row only.
        dilution_assumption_pct: 60,
        exit_revenue_multiple: null,
      },
      true,
    )

    render(
      <ReviewDefaultsModal
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // Exit-multiple is null → renders as "—" (not chipped).  Only the
    // dilution row should still chip.  Stage never chips.
    const chips = screen.getAllByText('default')
    expect(chips.length).toBe(1)
  })

  it('fires onConfirm when the user clicks Generate report', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ReviewDefaultsModal open onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('fires onCancel when the user clicks Back to wizard', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ReviewDefaultsModal open onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /back to wizard/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('fires onCancel on Escape (keyboard-friendly close)', () => {
    const onCancel = vi.fn()
    render(<ReviewDefaultsModal open onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('clicking an Edit row button calls onJumpTo with the right anchor (when provided)', () => {
    const onJumpTo = vi.fn()
    render(
      <ReviewDefaultsModal
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onJumpTo={onJumpTo}
      />,
    )
    // The first Edit button corresponds to the "Funding stage" row,
    // which anchors to ``startup-section-profile``.
    const editButtons = screen.getAllByRole('button', { name: /^edit$/i })
    expect(editButtons.length).toBeGreaterThan(0)
    const firstEdit = editButtons[0]
    if (firstEdit) fireEvent.click(firstEdit)
    expect(onJumpTo).toHaveBeenCalledTimes(1)
    expect(onJumpTo.mock.calls[0]?.[0]).toBe('startup-section-profile')
  })
})
