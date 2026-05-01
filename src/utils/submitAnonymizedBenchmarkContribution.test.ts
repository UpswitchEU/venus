import { describe, expect, it } from 'vitest'

import { __testing__ } from './submitAnonymizedBenchmarkContribution'
import type { ValuationResponse } from '../types/valuation'

const { extractOwnerProfileFields } = __testing__

/**
 * DATA-1 contribution extractor — pins the Venus → Titan wire shape so a
 * regression in Venus can't poison Delphi's anonymized benchmarks.
 *
 * Contract (per SPIKE-1 §5.4 R8): we forward the CAPPED valuation_adjustment
 * (the figure that scaled equity), never the engine raw output. The test
 * for `cap-binding case ships applied figure not raw figure` is the
 * load-bearing one — if it fails, Delphi's median benchmarks would
 * silently understate cap effects.
 */

function baseResponse(extra: Partial<Record<string, unknown>> = {}): ValuationResponse {
  return {
    ...extra,
  } as unknown as ValuationResponse
}

describe('extractOwnerProfileFields', () => {
  it('returns null when no owner_dependency_result is present', () => {
    expect(extractOwnerProfileFields(baseResponse())).toBeNull()
  })

  it('returns null when owner_dependency_adjustment is missing even if result is present', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 65,
        risk_level: 'MEDIUM',
        valuation_adjustment: -0.1,
      },
    })
    expect(extractOwnerProfileFields(r)).toBeNull()
  })

  it('extracts pass-through case (no cap binding)', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 65,
        risk_level: 'MEDIUM',
        valuation_adjustment: -0.1,
      },
      owner_dependency_adjustment: -0.1,
      valuation_methodology: 'MULTIPLES',
    })
    const out = extractOwnerProfileFields(r)
    expect(out).toEqual({
      transferability_risk_index: 35,
      owner_dependency_adjustment: -0.1,
      owner_profiling_risk_level: 'MEDIUM',
      valuation_methodology: 'MULTIPLES',
    })
  })

  it('cap-binding case ships applied figure not raw figure (SPIKE-1 §5.4 R8)', () => {
    // Engine wanted -0.22 raw; cap clamped to -0.15. The benchmark must
    // see -0.15, otherwise Delphi's sector median understates the cap effect.
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 18,
        risk_level: 'HIGH',
        valuation_adjustment: -0.15,
        raw_adjustment: -0.22,
      },
      owner_dependency_adjustment: -0.15,
      valuation_methodology: 'MULTIPLES',
    })
    const out = extractOwnerProfileFields(r)
    expect(out?.owner_dependency_adjustment).toBe(-0.15)
    // raw_adjustment is intentionally NOT in the wire shape.
    expect(out).not.toHaveProperty('raw_adjustment')
    expect(out?.transferability_risk_index).toBe(82)
  })

  it('clamps adjustment outside [-0.40, 0.00] band defensively', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 50,
        risk_level: 'MEDIUM',
        valuation_adjustment: -0.5,
      },
      owner_dependency_adjustment: -0.5, // below floor; engine should never emit this
    })
    const out = extractOwnerProfileFields(r)
    expect(out?.owner_dependency_adjustment).toBe(-0.4)
  })

  it('clamps positive adjustment to 0 (engine has no positive bonus at MVP)', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 95,
        risk_level: 'MINIMAL',
        valuation_adjustment: 0.05,
      },
      owner_dependency_adjustment: 0.05,
    })
    const out = extractOwnerProfileFields(r)
    expect(out?.owner_dependency_adjustment).toBe(0)
  })

  it('clamps TRI to [0, 100] when engine emits out-of-band overall_score', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: -10, // garbage-in
        risk_level: 'CRITICAL',
        valuation_adjustment: -0.15,
      },
      owner_dependency_adjustment: -0.15,
    })
    const out = extractOwnerProfileFields(r)
    expect(out?.transferability_risk_index).toBe(100)
  })

  it('drops unknown risk_level token (does not pass through to wire)', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 50,
        risk_level: 'UNKNOWN_TIER', // not in the enum
        valuation_adjustment: -0.1,
      },
      owner_dependency_adjustment: -0.1,
    })
    const out = extractOwnerProfileFields(r)
    expect(out).not.toHaveProperty('owner_profiling_risk_level')
    // Other fields still emit.
    expect(out?.transferability_risk_index).toBe(50)
  })

  it('drops unknown methodology token (does not poison enum check)', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 50,
        risk_level: 'MEDIUM',
        valuation_adjustment: -0.1,
      },
      owner_dependency_adjustment: -0.1,
      valuation_methodology: 'CUSTOM_BLEND', // not in the enum
    })
    const out = extractOwnerProfileFields(r)
    expect(out).not.toHaveProperty('valuation_methodology')
  })

  it('returns null on garbage adjustment (NaN guard)', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 50,
        risk_level: 'MEDIUM',
        valuation_adjustment: 'not-a-number',
      },
      owner_dependency_adjustment: 'not-a-number',
    })
    expect(extractOwnerProfileFields(r)).toBeNull()
  })

  it('upcases methodology + risk_level tokens before checking enum', () => {
    const r = baseResponse({
      owner_dependency_result: {
        overall_score: 50,
        risk_level: 'medium', // lowercase
        valuation_adjustment: -0.05,
      },
      owner_dependency_adjustment: -0.05,
      valuation_methodology: 'multiples',
    })
    const out = extractOwnerProfileFields(r)
    expect(out?.owner_profiling_risk_level).toBe('MEDIUM')
    expect(out?.valuation_methodology).toBe('MULTIPLES')
  })
})
