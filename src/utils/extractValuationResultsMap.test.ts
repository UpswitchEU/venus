import { describe, expect, it } from 'vitest'

import { extractValuationResultsMap } from './extractValuationResultsMap'

describe('extractValuationResultsMap', () => {
  it('normalizes adaptive multiple from canonical report context', () => {
    const payload = {
      details: {
        valuation_results: {
          upswitch_adaptive: {
            available: true,
            value: 357000,
            multiple_used: 4.75,
            details: {},
          },
        },
      },
      report_context: {
        applied_multiple: 3.45,
        multiple_low: 2.59,
        multiple_high: 4.6,
      },
    }

    expect(extractValuationResultsMap(payload)).toMatchObject({
      upswitch_adaptive: {
        multiple_used: 3.45,
        details: {
          p25_multiple: 2.59,
          p75_multiple: 4.6,
        },
      },
    })
  })

  it('coerces string canonical multiples to numbers', () => {
    const payload = {
      details: {
        valuation_results: {
          upswitch_adaptive: { available: true, value: 357000, multiple_used: 4.75, details: {} },
        },
      },
      report_context: {
        applied_multiple: '3.45' as unknown as number,
        multiple_low: '2.59' as unknown as number,
        multiple_high: '4.6' as unknown as number,
      },
    };

    const out = extractValuationResultsMap(payload);
    expect(out?.upswitch_adaptive?.multiple_used).toBe(3.45);
    expect(out?.upswitch_adaptive?.details?.p25_multiple).toBe(2.59);
    expect(out?.upswitch_adaptive?.details?.p75_multiple).toBe(4.6);
  })

  it('synthesizes from report_context when valuation_results paths are empty', () => {
    const payload = {
      valuation_results: {},
      details: { valuation_results: {} },
      report_context: {
        equity_value_mid: 500_000,
        applied_multiple: 4.2,
        multiple_low: 3.1,
        multiple_high: 5.4,
      },
    }
    const out = extractValuationResultsMap(payload, { selectedValuationMethod: 'upswitch_adaptive' })
    expect(out?.upswitch_adaptive?.value).toBe(500_000)
    expect(out?.upswitch_adaptive?.multiple_used).toBe(4.2)
  })

  it('does not synthesize from multiple alone', () => {
    expect(
      extractValuationResultsMap({
        valuation_results: {},
        report_context: { applied_multiple: 4.5 },
      }),
    ).toBeNull()
  })
})
