/**
 * OWNER-PROFILING-1 OP-6 — cover-chip derivation.
 *
 * Pin the cap-applied vs. pass-through discriminant. The renderer keys
 * off `mode` so missing this distinction leaks the raw figure to clients
 * without the "cap applied" framing — SPIKE-1 §5.4 R8.
 */

import { describe, expect, it } from 'vitest'
import { deriveOwnerProfilingChip } from './coverChip'

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
    expect(
      deriveOwnerProfilingChip({ owner_dependency_result: baseResult }),
    ).toBeNull()
  })

  it('pass-through: cap not binding (raw == applied)', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, raw_adjustment: -0.1 },
      owner_dependency_adjustment: -0.1,
    })
    expect(chip).not.toBeNull()
    expect(chip!.mode).toBe('pass-through')
    if (chip!.mode === 'pass-through') {
      expect(chip!.adjustment).toBe(-0.1)
      expect(chip!.transferabilityRiskIndex).toBe(35)
      expect(chip!.colorBand).toBe('neutral')
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
    expect(chip!.mode).toBe('capped')
    if (chip!.mode === 'capped') {
      expect(chip!.appliedAdjustment).toBe(-0.15)
      expect(chip!.rawAdjustment).toBe(-0.32)
      expect(chip!.colorBand).toBe('caution')
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
    expect(chip!.mode).toBe('pass-through')
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
    expect(chip!.mode).toBe('pass-through')
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
    expect(minimal!.colorBand).toBe('good')
    expect(high!.colorBand).toBe('caution')
    expect(critical!.colorBand).toBe('warn')
  })

  it('handles ApiNumeric string adjustment via toNumber coercion', () => {
    const chip = deriveOwnerProfilingChip({
      owner_dependency_result: { ...baseResult, raw_adjustment: -0.1 },
      // The Python wire emits Decimal-as-string for precision.
      owner_dependency_adjustment: '-0.10' as unknown as number,
    })
    expect(chip!.mode).toBe('pass-through')
  })
})
