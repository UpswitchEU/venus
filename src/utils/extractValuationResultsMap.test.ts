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
})
