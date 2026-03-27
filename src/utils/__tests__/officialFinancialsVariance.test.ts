import { describe, expect, it } from 'vitest'
import { applyUserVsOfficialVariance } from '../officialFinancialsVariance'

const baseOfficial = {
  source: 'staatsbladmonitor',
  revenue: 1_000_000,
  ebitda: 100_000,
  variancePolicy: { softThresholdPercent: 10, hardThresholdPercent: 25 },
  varianceAnalysis: { state: 'not_started' as const, explanationRequired: false },
  verificationBadge: { state: 'verified' as const, label: 'OK' },
}

describe('applyUserVsOfficialVariance', () => {
  it('sets pending when revenue variance exceeds 10%', () => {
    const out = applyUserVsOfficialVariance(
      { ...baseOfficial },
      1_200_000,
      100_000
    )
    expect(out.varianceAnalysis?.state).toBe('pending')
    expect(out.varianceAnalysis?.explanationRequired).toBe(true)
  })

  it('sets not_required when within 10%', () => {
    const out = applyUserVsOfficialVariance(
      { ...baseOfficial },
      1_050_000,
      100_000
    )
    expect(out.varianceAnalysis?.state).toBe('not_required')
    expect(out.varianceAnalysis?.explanationRequired).toBe(false)
  })

  it('returns not_started when both user figures are missing (no variance)', () => {
    const out = applyUserVsOfficialVariance({ ...baseOfficial }, undefined, undefined)
    expect(out.varianceAnalysis?.state).toBe('not_started')
  })

  it('ignores revenue when official revenue is zero; still ebitda-only variance', () => {
    const out = applyUserVsOfficialVariance(
      { ...baseOfficial, revenue: 0 },
      500_000,
      100_000
    )
    // Revenue vs 0: undefined; ebitda 100k vs 100k → 0% → not_required (matches Titan)
    expect(out.varianceAnalysis?.state).toBe('not_required')
    expect(out.varianceAnalysis?.explanationRequired).toBe(false)
  })

  it('keeps explained state when variance stays material and explanation exists', () => {
    const out = applyUserVsOfficialVariance(
      { ...baseOfficial },
      1_200_000,
      100_000,
      10,
      {
        state: 'explained',
        explanationRequired: true,
        explanation: 'One-off restructuring',
      }
    )
    expect(out.varianceAnalysis?.state).toBe('explained')
    expect(out.varianceAnalysis?.explanation).toBe('One-off restructuring')
  })
})
