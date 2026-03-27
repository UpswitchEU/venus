import { describe, expect, it } from 'vitest'
import { extractEvEquityWaterfallSteps } from './extractEvEquityWaterfallSteps'

describe('extractEvEquityWaterfallSteps', () => {
  it('prefers top-level ev_equity_waterfall_steps', () => {
    const steps = [{ label: 'EV', kind: 'subtotal', tone: 'brand', end_value: 1e6 }]
    expect(
      extractEvEquityWaterfallSteps({
        ev_equity_waterfall_steps: steps,
        report_context: { valuation_waterfall_steps: [{ label: 'wrong' }] },
      })
    ).toEqual(steps)
  })

  it('falls back to report_context.valuation_waterfall_steps', () => {
    const steps = [{ label: 'Cash', tone: 'positive', delta_value: 50_000 }]
    expect(
      extractEvEquityWaterfallSteps({
        report_context: { valuation_waterfall_steps: steps },
      })
    ).toEqual(steps)
  })

  it('returns undefined when empty', () => {
    expect(extractEvEquityWaterfallSteps({})).toBeUndefined()
  })
})
