import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import {
  bestBlendedValue,
  evaluateSynthesisBlend,
  type SynthesisEvaluation,
  shouldWarnSynthesisSkipped,
} from './synthesisEngine'

function method(
  partial: Partial<ValuationMethodResult> & { value: number | null; available: boolean }
): ValuationMethodResult {
  return {
    label: 'Method',
    ...partial,
  }
}

function response(
  partial: Partial<ValuationResponse> & {
    valuation_results?: Record<string, ValuationMethodResult>
    weighted_valuation?: ValuationResponse['weighted_valuation']
  }
): ValuationResponse {
  return {
    valuation_id: 'val_test',
    company_name: 'Test BV',
    ...partial,
  } as ValuationResponse
}

describe('evaluateSynthesisBlend', () => {
  describe('gating', () => {
    it('returns not-multi-method for a single selected method', () => {
      const ev = evaluateSynthesisBlend({
        result: response({}),
        preSelectedMethods: ['dcf'],
        userWeights: {},
      })
      expect(ev.client.kind).toBe('not-multi-method')
      expect(ev.serverBlended).toBeNull()
    })

    it('returns not-multi-method when upswitch_adaptive is among methods', () => {
      const ev = evaluateSynthesisBlend({
        result: response({}),
        preSelectedMethods: ['upswitch_adaptive', 'dcf'],
        userWeights: { upswitch_adaptive: 50, dcf: 50 },
      })
      expect(ev.client.kind).toBe('not-multi-method')
    })

    it('returns no-hydrated-results when the response has no method rows', () => {
      const ev = evaluateSynthesisBlend({
        result: response({}),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('no-hydrated-results')
    })
  })

  describe('client blend', () => {
    it('blends two methods with explicit 50/50 weights', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: 600_000, available: true, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        expect(ev.client.value).toBe(800_000)
        expect(ev.client.weightsByMethod).toEqual({ dcf: 50, multiples: 50 })
      }
    })

    it('uses net multiples equity for synthesis when the method row still contains gross EV', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 616_744, available: true, label: 'DCF' }),
            ebitda_multiple: method({
              value: 532_125,
              available: true,
              label: 'EBITDA Multiple',
            }),
          },
          multiples_valuation: {
            adjusted_equity_value: 427_549.555,
          } as ValuationResponse['multiples_valuation'],
        }),
        preSelectedMethods: ['dcf', 'ebitda_multiple'],
        userWeights: { dcf: 70, ebitda_multiple: 30 },
      })

      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        expect(ev.client.value).toBe(559_986)
      }
    })

    it('blends three methods with 20/70/10 weights', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_500_000, available: true, label: 'DCF' }),
            multiples: method({ value: 900_000, available: true, label: 'EBITDA Multiple' }),
            nav: method({ value: 400_000, available: true, label: 'NAV' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples', 'nav'],
        userWeights: { dcf: 20, multiples: 70, nav: 10 },
      })
      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        // 0.20 * 1_500_000 + 0.70 * 900_000 + 0.10 * 400_000 = 300_000 + 630_000 + 40_000 = 970_000
        expect(ev.client.value).toBe(970_000)
      }
    })

    it('falls back to equal weights when userWeights are missing', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: 600_000, available: true, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: {},
      })
      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        expect(ev.client.value).toBe(800_000) // 50/50 fallback
        expect(ev.client.weightsByMethod).toEqual({ dcf: 50, multiples: 50 })
      }
    })

    it('skips zero-weight methods when summing', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: 600_000, available: true, label: 'EBITDA Multiple' }),
            nav: method({ value: 99_999_999, available: false, label: 'NAV' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples', 'nav'],
        userWeights: { dcf: 50, multiples: 50, nav: 0 },
      })
      // The nav method is unavailable but weight=0 → must be ignored, blend succeeds.
      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        expect(ev.client.value).toBe(800_000)
      }
    })

    it('resolves the omzet_multiple / revenue_multiple sibling alias', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            // Engine echoed the EN key; UI uses the NL key.
            revenue_multiple: method({ value: 600_000, available: true, label: 'Revenue ×' }),
          },
        }),
        preSelectedMethods: ['dcf', 'omzet_multiple'],
        userWeights: { dcf: 50, omzet_multiple: 50 },
      })
      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        expect(ev.client.value).toBe(800_000)
      }
    })

    it('rounds non-integer sums', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_001, available: true, label: 'DCF' }),
            multiples: method({ value: 600_000, available: true, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blended')
      if (ev.client.kind === 'blended') {
        expect(ev.client.value).toBe(800_001) // (1_000_001 + 600_000) / 2 = 800_000.5 → 800_001
      }
    })
  })

  describe('blocked', () => {
    it('returns blocked when a positive-weight method is unavailable', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: null, available: false, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blocked')
      if (ev.client.kind === 'blocked') {
        expect(ev.client.blockerMethod).toBe('multiples')
      }
    })

    it('returns blocked when a positive-weight method has a non-finite value', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: Number.NaN, available: true, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blocked')
      if (ev.client.kind === 'blocked') {
        expect(ev.client.blockerMethod).toBe('multiples')
      }
    })

    it('reports the first blocker encountered when several methods are missing', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: null, available: false, label: 'DCF' }),
            multiples: method({ value: null, available: false, label: 'EBITDA Multiple' }),
            nav: method({ value: 100, available: true, label: 'NAV' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples', 'nav'],
        userWeights: { dcf: 33, multiples: 33, nav: 34 },
      })
      expect(ev.client.kind).toBe('blocked')
      if (ev.client.kind === 'blocked') {
        expect(ev.client.blockerMethod).toBe('dcf')
      }
    })

    it('passes through the unavailable_reason of the blocker method', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({
              value: null,
              available: false,
              label: 'EBITDA Multiple',
              unavailable_reason: 'Negative EBITDA — multiple does not apply',
            }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blocked')
      if (ev.client.kind === 'blocked') {
        expect(ev.client.blockerMethod).toBe('multiples')
        expect(ev.client.blockerReason).toBe('Negative EBITDA — multiple does not apply')
      }
    })

    it('normalises an empty unavailable_reason string to null', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({
              value: null,
              available: false,
              label: 'EBITDA Multiple',
              unavailable_reason: '   ',
            }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blocked')
      if (ev.client.kind === 'blocked') {
        expect(ev.client.blockerReason).toBeNull()
      }
    })

    it('does not report blocked when an unavailable method has zero weight', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: null, available: false, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 100, multiples: 0 },
      })
      // weights sum to 100 with one positive entry → resolveSynthesisPercentWeightsForMethods
      // returns the explicit weights; the zero-weight blocker is skipped.
      expect(ev.client.kind).toBe('blended')
    })
  })

  describe('invalid-sum (defensive)', () => {
    it('returns invalid-sum when every positive-weight method is zero-valued', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 0, available: true, label: 'DCF' }),
            multiples: method({ value: 0, available: true, label: 'EBITDA Multiple' }),
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('invalid-sum')
    })
  })

  describe('server blend', () => {
    it('reads weighted_valuation.blended_equity_value as a number', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          weighted_valuation: {
            blended_equity_value: 750_000,
            contributions: [],
          },
        }),
        preSelectedMethods: ['dcf'],
        userWeights: {},
      })
      expect(ev.serverBlended).toBe(750_000)
    })

    it('coerces a string blended_equity_value', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          weighted_valuation: {
            blended_equity_value: '750000.5',
            contributions: [],
          },
        }),
        preSelectedMethods: ['dcf'],
        userWeights: {},
      })
      expect(ev.serverBlended).toBe(750_000.5)
    })

    it('returns null serverBlended for a non-finite blended_equity_value', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          weighted_valuation: {
            blended_equity_value: 'not-a-number',
            contributions: [],
          },
        }),
        preSelectedMethods: ['dcf'],
        userWeights: {},
      })
      expect(ev.serverBlended).toBeNull()
    })

    it('exposes serverBlended alongside a blocked client outcome', () => {
      const ev = evaluateSynthesisBlend({
        result: response({
          valuation_results: {
            dcf: method({ value: 1_000_000, available: true, label: 'DCF' }),
            multiples: method({ value: null, available: false, label: 'EBITDA Multiple' }),
          },
          weighted_valuation: {
            blended_equity_value: 850_000,
            contributions: [],
          },
        }),
        preSelectedMethods: ['dcf', 'multiples'],
        userWeights: { dcf: 50, multiples: 50 },
      })
      expect(ev.client.kind).toBe('blocked')
      expect(ev.serverBlended).toBe(850_000)
    })
  })
})

describe('bestBlendedValue', () => {
  it('prefers the client blend over the server blend (live weights win)', () => {
    const ev: SynthesisEvaluation = {
      client: { kind: 'blended', value: 800_000, weightsByMethod: {} },
      serverBlended: 999_999,
    }
    expect(bestBlendedValue(ev)).toBe(800_000)
  })

  it('falls back to the server blend when the client did not produce a value', () => {
    const ev: SynthesisEvaluation = {
      client: { kind: 'blocked', blockerMethod: 'dcf', blockerReason: null, weightsByMethod: {} },
      serverBlended: 850_000,
    }
    expect(bestBlendedValue(ev)).toBe(850_000)
  })

  it('returns null when neither side produced a value', () => {
    const ev: SynthesisEvaluation = {
      client: { kind: 'no-hydrated-results' },
      serverBlended: null,
    }
    expect(bestBlendedValue(ev)).toBeNull()
  })
})

describe('shouldWarnSynthesisSkipped', () => {
  it('warns when the client is blocked and the server has no value', () => {
    const ev: SynthesisEvaluation = {
      client: {
        kind: 'blocked',
        blockerMethod: 'multiples',
        blockerReason: null,
        weightsByMethod: {},
      },
      serverBlended: null,
    }
    expect(shouldWarnSynthesisSkipped(ev)).toBe(true)
  })

  it('does not warn when the server provided a blend, even if the client is blocked', () => {
    const ev: SynthesisEvaluation = {
      client: {
        kind: 'blocked',
        blockerMethod: 'multiples',
        blockerReason: null,
        weightsByMethod: {},
      },
      serverBlended: 850_000,
    }
    expect(shouldWarnSynthesisSkipped(ev)).toBe(false)
  })

  it('does not warn for the not-multi-method outcome', () => {
    const ev: SynthesisEvaluation = {
      client: { kind: 'not-multi-method' },
      serverBlended: null,
    }
    expect(shouldWarnSynthesisSkipped(ev)).toBe(false)
  })

  it('does not warn for the no-hydrated-results outcome (we have no data, not a blocker)', () => {
    const ev: SynthesisEvaluation = {
      client: { kind: 'no-hydrated-results' },
      serverBlended: null,
    }
    expect(shouldWarnSynthesisSkipped(ev)).toBe(false)
  })

  it('does not warn for a successful client blend', () => {
    const ev: SynthesisEvaluation = {
      client: { kind: 'blended', value: 800_000, weightsByMethod: {} },
      serverBlended: null,
    }
    expect(shouldWarnSynthesisSkipped(ev)).toBe(false)
  })
})
