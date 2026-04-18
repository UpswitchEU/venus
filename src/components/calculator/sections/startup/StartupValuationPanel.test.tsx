/**
 * StartupValuationPanel — render + interaction smoke tests.
 *
 * Locks in the 3-screen wizard contract and the scalar `Slider` API
 * regression that previously rendered Berkus sliders silently broken
 * (we were passing `value={[v]}` / `onValueChange`, but the Aurora
 * primitive expects scalar `value` + `onChange`).
 *
 * Mirrors the `SaasMetricsSection.test.tsx` translation-mocking style
 * so we keep the suite snappy without spinning up next-intl.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StartupValuationPanel } from './StartupValuationPanel'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join(',')}`
        : key,
  useLocale: () => 'en',
}))

// Note: relative-path mocks must match the *importer's* resolved specifier.
// `StartupValuationPanel.tsx` lives at `sections/startup/` and imports
// `../../CurrencyInput`, which resolves to `components/calculator/CurrencyInput`.
vi.mock('../../CurrencyInput', () => ({
  CurrencyInput: ({ label }: { label: string }) => (
    <div data-testid={`currency-${label}`}>{label}</div>
  ),
}))

vi.mock('../AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => (
    <div data-testid={`pct-${label}`}>{label}</div>
  ),
}))

describe('StartupValuationPanel', () => {
  beforeEach(() => {
    useStartupValuationStore.getState().reset()
  })

  afterEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('renders the wizard chrome on first paint (step 1 / setup bar / progress)', () => {
    render(<StartupValuationPanel />)

    expect(screen.getByText('panelTitle')).toBeInTheDocument()
    expect(screen.getByText('setupStageLabel')).toBeInTheDocument()
    expect(screen.getByText('setupSectorLabel')).toBeInTheDocument()

    // ProgressBar exposes role=progressbar with the canonical aria attrs.
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')

    // Step 1 surfaces the Berkus sliders (label + value badge).
    expect(screen.getByText('soundIdea')).toBeInTheDocument()
    expect(screen.getByText('managementStrength')).toBeInTheDocument()
  })

  it('Berkus sliders honour the Aurora scalar API and write back to the store', () => {
    render(<StartupValuationPanel />)

    // The Aurora `Slider` primitive exposes role="slider" with
    // aria-valuenow reflecting the scalar `value` prop. If the panel
    // ever regresses to `value={[v]}` / `onValueChange`, this assertion
    // fails because aria-valuenow becomes NaN / 0 instead of the
    // store-default 50, and ArrowRight will not write back to the store.
    const sliders = screen.getAllByRole('slider')
    expect(sliders.length).toBeGreaterThanOrEqual(5)

    const first = sliders[0]
    expect(first).toHaveAttribute('aria-valuenow', '50')

    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(useStartupValuationStore.getState().sound_idea).toBe(55)
  })

  it('each Berkus slider carries an aria-label so screen readers announce the milestone', () => {
    render(<StartupValuationPanel />)

    // Step 1 surfaces all 5 Berkus sliders. They render as div[role="slider"]
    // (no native <input>), so the panel forwards `aria-label` derived from
    // the i18n label key. Without this, AT users hear an anonymous "slider, 50".
    expect(screen.getByRole('slider', { name: 'soundIdea' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'prototypeStatus' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'managementStrength' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'strategicRelationships' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'productRollout' })).toBeInTheDocument()
  })

  it('wizardNext advances to step 2 and updates the progressbar aria value', () => {
    render(<StartupValuationPanel />)

    const next = screen.getAllByText('wizardNext')[0]
    fireEvent.click(next)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText('wizardStep2Title')).toBeInTheDocument()
  })

  it('reaching step 3 surfaces the VC inputs and the sector hint', () => {
    render(<StartupValuationPanel />)

    const next = screen.getAllByText('wizardNext')[0]
    fireEvent.click(next)
    fireEvent.click(next)

    expect(screen.getByText('wizardStep3Title')).toBeInTheDocument()
    // hint copy is templated `wizardStep3SectorHint:sector=…,multiple=…`
    expect(
      screen.getByText((content) =>
        content.startsWith('wizardStep3SectorHint:sector=sectorSaas,multiple=6')
      )
    ).toBeInTheDocument()
    // VC method-specific input slots present
    expect(screen.getByTestId('currency-y5Revenue')).toBeInTheDocument()
    expect(screen.getByTestId('pct-dilutionAssumption')).toBeInTheDocument()
  })

  it('advanced drawer is collapsed by default and reveals scorecard + cap-table inputs when toggled', () => {
    render(<StartupValuationPanel />)

    expect(screen.queryByText('advancedScorecardTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('advancedCapTableTitle')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('advancedToggleTitle'))

    expect(screen.getByText('advancedScorecardTitle')).toBeInTheDocument()
    expect(screen.getByText('advancedCapTableTitle')).toBeInTheDocument()
    expect(screen.getByText('addSafeNote')).toBeInTheDocument()
  })

  it('"skip pre-revenue" clears traction inputs and jumps from step 2 straight to step 3', () => {
    // Pretend the founder typed some traction data on step 2 before deciding
    // they're pre-revenue; the skip CTA must scrub MRR/ARR/growth/churn so
    // ValuationIQ does not silently anchor to stale numbers.
    useStartupValuationStore.setState({
      mrr: 25000,
      arr: 300000,
      mrr_growth_rate_pct: 18,
      monthly_churn_pct: 4,
    })

    render(<StartupValuationPanel />)
    fireEvent.click(screen.getAllByText('wizardNext')[0]) // → step 2

    fireEvent.click(screen.getByText('wizardStep2SkipPreRevenue'))

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
    const state = useStartupValuationStore.getState()
    expect(state.mrr).toBeNull()
    expect(state.arr).toBeNull()
    expect(state.mrr_growth_rate_pct).toBeNull()
    expect(state.monthly_churn_pct).toBeNull()
  })

  it('the stage SegmentedControl writes the picked stage back to the store', () => {
    // The stage segmented control is the only setup-bar control that
    // doesn't depend on a popover (which is finicky in jsdom). It still
    // gives us a strong signal that `state.setField('stage', value)` is
    // wired correctly on every option click.
    render(<StartupValuationPanel />)

    fireEvent.click(screen.getByText('stagePreSeed'))
    expect(useStartupValuationStore.getState().stage).toBe('pre_seed')

    fireEvent.click(screen.getByText('stageSeriesA'))
    expect(useStartupValuationStore.getState().stage).toBe('series_a')
  })
})
