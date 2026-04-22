/**
 * StartupValuationPanel — render + interaction smoke tests.
 *
 * Locks in the **stacked-section contract** (the panel renders the
 * three numbered sections one beneath the other — no Next/Back wizard,
 * matching the rhythm of every other left-panel method like DCF) and
 * guards against the historical scalar-Slider-API regression that
 * previously rendered Berkus sliders silently broken.
 *
 * Mirrors the `SaasMetricsSection.test.tsx` translation-mocking style
 * so we keep the suite snappy without spinning up next-intl.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { StartupValuationPanel } from './StartupValuationPanel'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

function renderStartupValuationPanel(
  props: React.ComponentProps<typeof StartupValuationPanel> = {},
) {
  return render(<StartupValuationPanel {...props} />)
}

// `t` is the function the panels call: `t(key, values?)`.
// `t.rich` is the next-intl helper for messages with React-element
// fragments (e.g. <strong> tokens).  We mock it to render the same
// templated key-with-values string and concatenate any rendered
// fragments so assertions can grep through the resulting text.
vi.mock('next-intl', () => {
  const renderValues = (values?: Record<string, unknown>) =>
    values
      ? `:${Object.entries(values)
          .map(([k, v]) => `${k}=${typeof v === 'function' ? '[fn]' : String(v)}`)
          .join(',')}`
      : ''

  const t = (key: string, values?: Record<string, string | number>) =>
    `${key}${renderValues(values)}`
  ;(t as unknown as { rich: typeof t }).rich = (
    key: string,
    values?: Record<string, unknown>,
  ) => `${key}${renderValues(values)}`

  return {
    useTranslations: () => t,
    useLocale: () => 'en',
  }
})

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
    localStorage.removeItem('venus.startup_valuation.v1')
    useStartupValuationStore.getState().reset()
  })

  afterEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('renders the panel header, setup bar, and all three numbered sections at once', () => {
    renderStartupValuationPanel()

    // Header + setup bar are persistent.
    expect(screen.getByText('panelTitle')).toBeInTheDocument()
    expect(screen.getByText('setupStageLabel')).toBeInTheDocument()
    expect(screen.getByText('setupSectorLabel')).toBeInTheDocument()

    // All three numbered sections are visible simultaneously — this is
    // the load-bearing assertion that the old wizard-with-Next/Back
    // pattern has been replaced by stacked sections (matching DCF, NAV,
    // SaaS layout). If the panel ever regresses to step-based hiding,
    // the Year-5 input will disappear from the DOM.
    expect(screen.getByText('section1Title')).toBeInTheDocument()
    expect(screen.getByText('section2Title')).toBeInTheDocument()
    expect(screen.getByText('section3Title')).toBeInTheDocument()

    // Section 1 — Berkus sliders are visible on first paint.
    expect(screen.getByText('soundIdea')).toBeInTheDocument()
    expect(screen.getByText('productRollout')).toBeInTheDocument()

    // Section 3 — VC inputs visible on first paint (no Next click required).
    expect(screen.getByTestId('currency-y5Revenue')).toBeInTheDocument()
    expect(screen.getByTestId('pct-dilutionAssumptionOptional')).toBeInTheDocument()
  })

  it('every Berkus slider carries an aria-label and writes back to the store on keyboard input', () => {
    renderStartupValuationPanel()

    // The Aurora `Slider` primitive renders div[role="slider"] (no
    // native <input>), so the panel must forward `aria-label` derived
    // from the i18n label key. Without this, AT users hear an
    // anonymous "slider, 50".
    expect(screen.getByRole('slider', { name: 'soundIdea' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'prototypeStatus' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'managementStrength' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'strategicRelationships' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'productRollout' })).toBeInTheDocument()

    // Scalar-API regression guard — if the section ever regresses to
    // `value={[v]}` / `onValueChange`, aria-valuenow becomes NaN/0
    // and ArrowRight stops writing to the store.
    const sound = screen.getByRole('slider', { name: 'soundIdea' })
    expect(sound).toHaveAttribute('aria-valuenow', '50')
    fireEvent.keyDown(sound, { key: 'ArrowRight' })
    expect(useStartupValuationStore.getState().sound_idea).toBe(55)
  })

  it('Berkus section surfaces the regional baseline pill and the live subtotal', () => {
    renderStartupValuationPanel()

    // Baseline pill: the engine-injected "Up to €X across 5 milestones"
    // line. We assert the templated key is rendered with the right
    // tokens — keeps the academic anchor in the founder's eyeline.
    const baseline = screen.getByText((content) =>
      content.startsWith('section1BaselineCallout:'),
    )
    expect(baseline).toBeInTheDocument()
    expect(baseline.textContent).toContain('region=BE')
    expect(baseline.textContent).toContain('stage=stageSeed')

    // Live subtotal pill — confirms the per-slider EUR rollup the
    // founder will see in the report.
    expect(screen.getByText('berkusSubtotalLabel')).toBeInTheDocument()
  })

  it('forward-SaaS section shows fields by default and clears them on the skip toggle', () => {
    // Pretend the founder typed some traction data before deciding
    // they're pre-revenue; the skip toggle must scrub MRR/ARR/growth/
    // churn so ValuationIQ does not silently anchor to stale numbers.
    useStartupValuationStore.setState({
      mrr: 25_000,
      arr: 300_000,
      mrr_growth_rate_pct: 18,
      monthly_churn_pct: 4,
      cac: 500,
      burn_rate_monthly: 40_000,
      runway_months: 14,
    })

    renderStartupValuationPanel()

    // Fields are visible since not-skipped.
    expect(screen.getByTestId('currency-mrr')).toBeInTheDocument()
    expect(screen.getByTestId('pct-mrrGrowth')).toBeInTheDocument()

    // Toggle says "I'm pre-revenue" while not-skipped.
    fireEvent.click(screen.getByText('section2SkipBadgeOff'))

    const state = useStartupValuationStore.getState()
    expect(state.mrr).toBeNull()
    expect(state.arr).toBeNull()
    expect(state.mrr_growth_rate_pct).toBeNull()
    expect(state.monthly_churn_pct).toBeNull()
    expect(state.cac).toBeNull()
    expect(state.burn_rate_monthly).toBeNull()
    expect(state.runway_months).toBeNull()

    // Toggle now reads "Re-enable" — explicit pre-revenue mode.
    expect(screen.getByText('section2SkipBadgeOn')).toBeInTheDocument()
    expect(screen.queryByTestId('currency-mrr')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('section2SkipBadgeOn'))
    expect(screen.getByTestId('currency-mrr')).toBeInTheDocument()
    expect(screen.getByText('section2SkipBadgeOff')).toBeInTheDocument()
  })

  it('exit scenario shows validity todo until required VC fields are filled', () => {
    renderStartupValuationPanel()

    const todo = screen.getByRole('status')
    expect(todo.textContent).toContain('vcSectionValidityTodo:')
    expect(todo.textContent).toContain('y5Revenue')
    expect(todo.textContent).toContain('exitMultiple')
    expect(todo.textContent).toContain('targetRoi')

    const roiDesc = screen.getByText((content) =>
      content.startsWith('targetRoiDescription:'),
    )
    expect(roiDesc.textContent).toContain('stageRoi=20')
    expect(roiDesc.textContent).toContain('defaultRoi=15')
  })

  it('advanced drawer is collapsed by default and reveals scorecard + cap-table inputs when toggled', () => {
    renderStartupValuationPanel()

    expect(screen.queryByText('advancedScorecardTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('advancedCapTableTitle')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('advancedToggleTitle'))

    expect(screen.getByText('advancedScorecardTitle')).toBeInTheDocument()
    expect(screen.getByText('advancedCapTableTitle')).toBeInTheDocument()
    expect(screen.getByText('addSafeNote')).toBeInTheDocument()
  })

  it('founder mode hides the Scorecard fine-tuning section but keeps cap-table inside the advanced drawer', () => {
    // The founder triangulation deliberately drops Scorecard from the
    // headline 3-leg blend (consortium spec). Showing the Scorecard
    // sliders in founder mode would create the false impression that
    // those numbers move the headline pre-money — they don't, until
    // an accountant later switches the same valuation to advisor view.
    renderStartupValuationPanel({ mode: 'founder' })

    fireEvent.click(screen.getByText('advancedToggleTitle'))

    expect(screen.queryByText('advancedScorecardTitle')).not.toBeInTheDocument()
    expect(screen.getByText('advancedCapTableTitle')).toBeInTheDocument()
    expect(screen.getByText('addSafeNote')).toBeInTheDocument()
  })

  it('founder mode swaps the panel header copy', () => {
    // Distinct keys (panelTitleFounder / panelIntroFounder) so the
    // Mercury-driven founder funnel can A/B copy without touching
    // accountant flows.
    renderStartupValuationPanel({ mode: 'founder' })
    expect(screen.getByText('panelTitleFounder')).toBeInTheDocument()
    expect(screen.getByText('panelIntroFounder')).toBeInTheDocument()
    expect(screen.queryByText('panelTitle')).not.toBeInTheDocument()
  })

  it('the stage SegmentedControl writes the picked stage back to the store', () => {
    renderStartupValuationPanel()

    fireEvent.click(screen.getByText('stagePreSeed'))
    expect(useStartupValuationStore.getState().stage).toBe('pre_seed')

    fireEvent.click(screen.getByText('stageSeriesA'))
    expect(useStartupValuationStore.getState().stage).toBe('series_a')
  })
})
