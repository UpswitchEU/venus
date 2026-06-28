import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ValuationTrendChart } from './ValuationTrendChart'
import type { ChartLabels } from './valuation-graph-model'
import { buildTimelineChartRows } from './valuation-timeline-rows'

const labels: ChartLabels = {
  date: 'Year',
  range: 'Range',
  midpoint: 'Estimated value',
  askingPrice: 'Asking price',
  method: 'Method',
  version: 'Version',
  reportSnapshot: 'Valuation',
  status: 'Type',
  triggerManual: 'Manual',
  triggerAutoRecalculation: 'Auto',
  triggerConversation: 'Assistant',
  triggerAdjustment: 'Adjustment',
  confidence: 'Confidence',
  actual: 'Actual',
  forecast: 'Forecast',
}

describe('ValuationTrendChart', () => {
  it('renders the loading skeleton when loading with no rows', () => {
    const { container } = render(
      <ValuationTrendChart rows={[]} loading locale="en" labels={labels} />
    )
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders the caller empty state when there are no rows', () => {
    render(
      <ValuationTrendChart
        rows={[]}
        locale="en"
        labels={labels}
        emptyState={<div>nothing yet</div>}
      />
    )
    expect(screen.getByText('nothing yet')).toBeTruthy()
  })

  it('mounts the single-point baseline for one fiscal year', () => {
    const rows = buildTimelineChartRows([
      { fiscal_year: 2025, equity_low: 80, equity_mid: 100, equity_high: 120 },
    ])
    const { container } = render(
      <ValuationTrendChart rows={rows} locale="en" labels={labels} dateMode="year" />
    )
    // The accessible <dl> twin always renders once the baseline mounts.
    expect(container.querySelector('dl.sr-only')).toBeTruthy()
  })

  it('renders the interactive visx chart for two or more fiscal years', () => {
    const rows = buildTimelineChartRows([
      { fiscal_year: 2024, equity_low: 70, equity_mid: 90, equity_high: 110 },
      { fiscal_year: 2025, equity_low: 80, equity_mid: 100, equity_high: 120 },
    ])
    const { container } = render(
      <ValuationTrendChart rows={rows} locale="en" labels={labels} dateMode="year" />
    )
    expect(container.querySelector('[data-testid="valuation-chart-hitbox"]')).toBeTruthy()
    // The Venus port wraps theme tokens in hsl(...) so a channel triplet becomes a
    // real color — assert that wrapping reaches the rendered SVG (not "172 55% 45%").
    expect(container.querySelector('[stroke="hsl(var(--border))"]')).toBeTruthy()
    // No forecast rows ⇒ no dashed forecast segment or projection divider.
    expect(container.querySelector('[data-testid="valuation-forecast-line"]')).toBeNull()
    expect(container.querySelector('[data-testid="valuation-forecast-divider"]')).toBeNull()
  })

  it('distinguishes forecast years with a dashed segment and a projection divider', () => {
    const rows = buildTimelineChartRows([
      { fiscal_year: 2023, equity_low: 70, equity_mid: 90, equity_high: 110 },
      { fiscal_year: 2024, equity_low: 80, equity_mid: 100, equity_high: 120 },
      { fiscal_year: 2025, equity_low: 90, equity_mid: 110, equity_high: 130, is_forecast: true },
    ])
    const { container } = render(
      <ValuationTrendChart rows={rows} locale="en" labels={labels} dateMode="year" />
    )
    expect(container.querySelector('[data-testid="valuation-forecast-line"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="valuation-forecast-divider"]')).toBeTruthy()
  })
})
