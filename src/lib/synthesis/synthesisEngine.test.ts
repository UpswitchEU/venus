import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import {
  bestBlendedValue,
  evaluateSynthesisBlend,
  hydrateSynthesisValuationResultsMap,
  type SynthesisEvaluation,
  shouldWarnSynthesisSkipped,
} from './synthesisEngine'

function method(
  partial: Partial<ValuationMethodResult> & { value: number | null; available: boolean }
): ValuationMethodResult {
  return { label: 'Method', ...partial }
}

function response(partial: Partial<ValuationResponse>): ValuationResponse {
  return {
    valuation_id: 'val_test',
    company_name: 'Test BV',
    ...partial,
  } as ValuationResponse
}

describe('ValuationIQ-only synthesis adapter', () => {
  it('reads the exact server blend and never creates a client monetary blend', () => {
    const ev = evaluateSynthesisBlend({
      result: response({
        valuation_results: {
          dcf: method({ value: 1_000_000, available: true }),
          multiples: method({ value: 600_000, available: true }),
        },
        weighted_valuation: {
          blended_equity_value: '750000.5',
          contributions: [],
        },
      }),
      preSelectedMethods: ['dcf', 'multiples'],
      userWeights: { dcf: 50, multiples: 50 },
    })

    expect(ev.client).toEqual({
      kind: 'invalid-sum',
      weightsByMethod: { dcf: 50, multiples: 50 },
    })
    expect(ev.serverBlended).toBe(750_000.5)
    expect(bestBlendedValue(ev)).toBe(750_000.5)
  })

  it('returns no monetary value when ValuationIQ did not provide one', () => {
    const ev = evaluateSynthesisBlend({
      result: response({
        valuation_results: {
          dcf: method({ value: 1_000_000, available: true }),
          multiples: method({ value: 600_000, available: true }),
        },
      }),
      preSelectedMethods: ['dcf', 'multiples'],
      userWeights: { dcf: 50, multiples: 50 },
    })

    expect(bestBlendedValue(ev)).toBeNull()
  })

  it('keeps readiness diagnostics for a positive-weight unavailable method', () => {
    const ev = evaluateSynthesisBlend({
      result: response({
        valuation_results: {
          dcf: method({ value: 1_000_000, available: true }),
          multiples: method({
            value: null,
            available: false,
            unavailable_reason: 'Missing EBITDA',
          }),
        },
      }),
      preSelectedMethods: ['dcf', 'multiples'],
      userWeights: { dcf: 50, multiples: 50 },
    })

    expect(ev.client).toMatchObject({
      kind: 'blocked',
      blockerMethod: 'multiples',
      blockerReason: 'Missing EBITDA',
    })
    expect(shouldWarnSynthesisSkipped(ev)).toBe(true)
  })

  it('suppresses a readiness warning when ValuationIQ already returned a blend', () => {
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
    expect(bestBlendedValue(ev)).toBe(850_000)
  })

  it('does not synthesize Adaptive with another method in Venus', () => {
    const ev = evaluateSynthesisBlend({
      result: response({}),
      preSelectedMethods: ['upswitch_adaptive', 'dcf'],
      userWeights: { upswitch_adaptive: 50, dcf: 50 },
    })

    expect(ev.client.kind).toBe('not-multi-method')
    expect(bestBlendedValue(ev)).toBeNull()
  })

  it('hydrates the engine-provided net multiples equity without doing multiplication', () => {
    const hydrated = hydrateSynthesisValuationResultsMap(
      response({
        valuation_results: {
          ebitda_multiple: method({ value: 532_125, available: true }),
        },
        multiples_valuation: {
          adjusted_equity_value: 427_549.555,
        } as ValuationResponse['multiples_valuation'],
      })
    )

    expect(hydrated?.ebitda_multiple.value).toBe(427_549.555)
  })

  it('rejects non-finite server blend values', () => {
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
})
