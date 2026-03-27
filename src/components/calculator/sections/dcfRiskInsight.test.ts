import { describe, expect, it } from 'vitest'
import { deriveDcfRiskInsight } from './dcfRiskInsight'

describe('deriveDcfRiskInsight', () => {
  it('returns critical insight for owner-only businesses', () => {
    expect(
      deriveDcfRiskInsight({
        ownerManagers: 1,
        fteEmployees: 0,
        smartDefaultWaccPct: 10.5,
      })
    ).toEqual({
      severity: 'critical',
      ownerRatioPct: 100,
      waccUpliftPct: 2,
      suggestedWaccPct: 12.5,
    })
  })

  it('returns high insight for elevated owner dependency', () => {
    expect(
      deriveDcfRiskInsight({
        ownerManagers: 2,
        fteEmployees: 3,
        currentWaccPct: 11.5,
      })
    ).toEqual({
      severity: 'high',
      ownerRatioPct: 66.7,
      waccUpliftPct: 1,
      suggestedWaccPct: 12.5,
    })
  })

  it('returns null when dependency is not material', () => {
    expect(
      deriveDcfRiskInsight({
        ownerManagers: 1,
        fteEmployees: 5,
        smartDefaultWaccPct: 10.5,
      })
    ).toBeNull()
  })
})
