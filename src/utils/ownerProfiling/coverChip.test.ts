/**
 * OWNER-PROFILING-1 OP-6 — cover-chip derivation.
 *
 * Pin the cap-applied vs. pass-through discriminant. The renderer keys
 * off `mode` so missing this distinction leaks the raw figure to clients
 * without the "cap applied" framing — SPIKE-1 §5.4 R8.
 */

import { describe, expect, it } from 'vitest'
import {
  deriveOwnerProfilingChip,
  deriveOwnerProfilingChipPreferSessionThenResult,
  deriveOwnerProfilingState,
} from './coverChip'

const baseResult = {
  factors: {
    client_concentration: 'medium',
    operational_knowledge: 'medium',
    sales_relationship: 'medium',
    technical_expertise: 'medium',
    industry_network: 'medium',
    decision_making: 'medium',
    brand_reputation: 'medium',
    process_documentation: 'medium',
    team_capability: 'medium',
    succession_planning: 'medium',
    business_scalability: 'medium',
    contract_transferability: 'medium',
  },
  overall_score: 65,
  risk_level: 'MEDIUM',
  valuation_adjustment: -0.1,
  explanation: '',
  key_risks: [],
  recommendations: [],
}

describe('deriveOwnerProfilingChip', () => {
  it('returns null when no assessment is on the response', () => {
    expect(deriveOwnerProfilingChip({})).toBeNull()
  })

  it('returns null when result is present but adjustment is missing', () => {
    expect(deriveOwnerProfilingChip({ owner_dependency_result: baseResult })).toBeNull()
  })

  it('pass-through: cap not binding (raw == applied)', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, raw_adjustment: -0.1 },
      owner_dependency_adjustment: -0.1,
    })
    expect(chip).not.toBeNull()
    expect(chip?.mode).toBe('pass-through')
    if (chip?.mode === 'pass-through') {
      expect(chip?.adjustment).toBe(-0.1)
      expect(chip?.transferabilityRiskIndex).toBe(35)
      expect(chip?.colorBand).toBe('neutral')
    }
  })

  it('capped: raw beyond floor → cap-applied chip', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        risk_level: 'HIGH',
        raw_adjustment: -0.32,
      },
      owner_dependency_adjustment: -0.15,
    })
    expect(chip).not.toBeNull()
    expect(chip?.mode).toBe('capped')
    if (chip?.mode === 'capped') {
      expect(chip?.appliedAdjustment).toBe(-0.15)
      expect(chip?.rawAdjustment).toBe(-0.32)
      expect(chip?.colorBand).toBe('caution')
    }
  })

  it('boundary: raw exactly at floor is NOT considered capped', () => {
    // The cap fires when raw < FLOOR (strict). At exactly -0.15 the raw
    // figure was the engine's emit; nothing was clamped. Anything else
    // would force a "Capped — full risk -15%" chip on every binding case
    // which is misleading.
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, raw_adjustment: -0.15 },
      owner_dependency_adjustment: -0.15,
    })
    expect(chip?.mode).toBe('pass-through')
  })

  it('pre-OP-4b response without raw_adjustment renders pass-through', () => {
    // Don't lie about a cap we can't prove was applied. If the synthesizer
    // ran before raw_adjustment was added, default to pass-through and
    // accept the small UX regression of not showing the "capped" framing
    // on those legacy reports.
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: baseResult, // no raw_adjustment
      owner_dependency_adjustment: -0.15,
    })
    expect(chip?.mode).toBe('pass-through')
  })

  it('color band: MINIMAL → good, HIGH → caution, CRITICAL → warn', () => {
    const minimal = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        overall_score: 95,
        risk_level: 'MINIMAL',
      },
      owner_dependency_adjustment: -0.0125,
    })
    const high = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        overall_score: 30,
        risk_level: 'HIGH',
      },
      owner_dependency_adjustment: -0.15,
    })
    const critical = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        overall_score: 10,
        risk_level: 'CRITICAL',
      },
      owner_dependency_adjustment: -0.15,
    })
    expect(minimal?.colorBand).toBe('good')
    expect(high?.colorBand).toBe('caution')
    expect(critical?.colorBand).toBe('warn')
  })

  it('returns null when adjustment is explicitly null', () => {
    expect(
      deriveOwnerProfilingChip({
        owner_dependency_result: baseResult,
        owner_dependency_adjustment: null as unknown as number,
      })
    ).toBeNull()
  })

  it('accepts JSON-numeric strings for overall_score', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        overall_score: '65' as unknown as number,
      },
      owner_dependency_adjustment: -0.1,
    })
    expect(chip?.transferabilityRiskIndex).toBe(35)
  })

  it('clamps extreme overall_score into [0, 100] before TRI', () => {
    const saturated = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, overall_score: 150 },
      owner_dependency_adjustment: -0.05,
    })
    const negative = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, overall_score: -40 },
      owner_dependency_adjustment: -0.05,
    })
    expect(saturated?.transferabilityRiskIndex).toBe(0)
    expect(negative?.transferabilityRiskIndex).toBe(100)
  })

  it('normalizes lowercase risk_level for color band', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, risk_level: 'high' },
      owner_dependency_adjustment: -0.1,
    })
    expect(chip?.colorBand).toBe('caution')
    expect(chip?.riskLevel).toBe('high')
  })

  it('capped mode accepts raw_adjustment as numeric string', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        risk_level: 'HIGH',
        raw_adjustment: '-0.35' as unknown as number,
      },
      owner_dependency_adjustment: -0.15,
    })
    expect(chip?.mode).toBe('capped')
    if (chip?.mode === 'capped') {
      expect(chip?.rawAdjustment).toBeCloseTo(-0.35, 5)
    }
  })

  it('handles ApiNumeric string adjustment via toNumber coercion', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, raw_adjustment: -0.1 },
      // The Python wire emits Decimal-as-string for precision.
      owner_dependency_adjustment: '-0.10' as unknown as number,
    })
    expect(chip?.mode).toBe('pass-through')
  })

  it('rejects owner_dependency_result that is not a plain object', () => {
    expect(
      deriveOwnerProfilingChip({
        owner_dependency_result: [] as unknown as typeof baseResult,
        owner_dependency_adjustment: -0.1,
      })
    ).toBeNull()
  })

  it('rejects non-primitive risk_level values', () => {
    expect(
      deriveOwnerProfilingChip({
        owner_dependency_result: {
          ...baseResult,
          risk_level: { bogus: true } as unknown as string,
        },
        owner_dependency_adjustment: -0.1,
      })
    ).toBeNull()
  })

  it('accepts bigint overall_score from JSON edge transports', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: {
        ...baseResult,
        overall_score: BigInt(65) as unknown as number,
      },
      owner_dependency_adjustment: -0.1,
    })
    expect(chip?.transferabilityRiskIndex).toBe(35)
  })
})

describe('deriveOwnerProfilingChipPreferSessionThenResult', () => {
  it('prefers session when both sources have complete pairs', () => {
    const chip = deriveOwnerProfilingChipPreferSessionThenResult(
      {
        owner_dependency_result: { ...baseResult, overall_score: 90 },
        owner_dependency_adjustment: -0.05,
      },
      {
        owner_dependency_result: baseResult,
        owner_dependency_adjustment: -0.1,
      }
    )
    expect(chip).not.toBeNull()
    expect(chip?.transferabilityRiskIndex).toBe(10)
  })

  it('uses result when session pair is incomplete', () => {
    const chip = deriveOwnerProfilingChipPreferSessionThenResult(
      {
        owner_dependency_result: baseResult,
        owner_dependency_adjustment: undefined as unknown as number,
      },
      {
        owner_dependency_result: baseResult,
        owner_dependency_adjustment: -0.1,
      }
    )
    expect(chip).not.toBeNull()
    expect(chip?.transferabilityRiskIndex).toBe(35)
  })

  it('falls through to result when session has a pair but derivation fails', () => {
    const chip = deriveOwnerProfilingChipPreferSessionThenResult(
      {
        owner_dependency_result: { ...baseResult, risk_level: '' },
        owner_dependency_adjustment: -0.1,
      },
      {
        owner_dependency_result: baseResult,
        owner_dependency_adjustment: -0.1,
      }
    )
    expect(chip).not.toBeNull()
    expect(chip?.transferabilityRiskIndex).toBe(35)
  })

  it('skips session when owner_dependency_result is an array', () => {
    const chip = deriveOwnerProfilingChipPreferSessionThenResult(
      {
        owner_dependency_result: [] as unknown as typeof baseResult,
        owner_dependency_adjustment: -0.1,
      },
      {
        owner_dependency_result: baseResult,
        owner_dependency_adjustment: -0.1,
      }
    )
    expect(chip?.transferabilityRiskIndex).toBe(35)
  })
})

describe('deriveOwnerProfilingState', () => {
  it('returns null when nothing has been loaded yet', () => {
    expect(deriveOwnerProfilingState(undefined, undefined)).toBeNull()
  })

  it('returns chip mode when assessment is present', () => {
    const state = deriveOwnerProfilingState(undefined, {
      owner_dependency_result: baseResult,
      owner_dependency_adjustment: -0.1,
      valuation_id: 'val_123',
    })
    expect(state).not.toBeNull()
    expect(state?.mode).toBe('chip')
    if (state?.mode === 'chip') {
      expect(state.chip.transferabilityRiskIndex).toBe(35)
    }
  })

  it('returns skipped mode for a real result with no assessment', () => {
    const state = deriveOwnerProfilingState(undefined, { valuation_id: 'val_123' })
    expect(state).not.toBeNull()
    expect(state?.mode).toBe('skipped')
  })

  it('returns null for a pre-flight (no valuation_id) with no assessment', () => {
    // Pre-save / pre-flight: showing a "skipped" CTA before the result
    // is even saved would be confusing, so we suppress.
    expect(deriveOwnerProfilingState({}, {})).toBeNull()
  })

  it('prefers session over result when session has the assessment', () => {
    const state = deriveOwnerProfilingState(
      {
        owner_dependency_result: { ...baseResult, overall_score: 80 },
        owner_dependency_adjustment: -0.05,
        valuation_id: 'val_session',
      },
      {
        owner_dependency_result: { ...baseResult, overall_score: 30 },
        owner_dependency_adjustment: -0.2,
        valuation_id: 'val_result',
      }
    )
    expect(state?.mode).toBe('chip')
    if (state?.mode === 'chip') {
      expect(state.chip.transferabilityRiskIndex).toBe(20)
    }
  })
})
