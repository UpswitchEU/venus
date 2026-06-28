// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolvePointStatusLabel } from './ValuationGraphVisuals.model'
import type { ChartLabels } from './valuation-graph-model'
import { buildTimelineChartRows } from './valuation-timeline-rows'

const labels: ChartLabels = {
  date: 'Date',
  range: 'Range',
  midpoint: 'Midpoint',
  askingPrice: 'Asking',
  method: 'Method',
  version: 'Version',
  reportSnapshot: 'VALUATION',
  status: 'Status',
  triggerManual: 'Manual',
  triggerAutoRecalculation: 'Auto',
  triggerConversation: 'Assistant',
  triggerAdjustment: 'Adjustment',
  confidence: 'Confidence',
  actual: 'ACTUAL',
  forecast: 'FORECAST',
}

describe('resolvePointStatusLabel', () => {
  it('labels engine-timeline points Actual / Forecast by their flag', () => {
    const rows = buildTimelineChartRows([
      { fiscal_year: 2024, equity_low: 1, equity_mid: 2, equity_high: 3 },
      { fiscal_year: 2025, equity_low: 1, equity_mid: 2, equity_high: 3, is_forecast: true },
    ])
    expect(resolvePointStatusLabel(rows[0], labels)).toBe('ACTUAL')
    expect(resolvePointStatusLabel(rows[1], labels)).toBe('FORECAST')
  })
})
