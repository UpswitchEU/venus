import { describe, expect, it } from 'vitest'
import {
  TEAM_LEVEL_ORDER,
  getTeamLevelFlags,
  inferTeamLevel,
} from './teamLevel'
import {
  PEDIGREE_KEYS,
  calculatePedigreeMultiplier,
} from '@/store/manual/useStartupValuationStore'

describe('teamLevel module', () => {
  it('every bucket maps to a complete pedigree-flag set', () => {
    // Calibration invariant: a bucket pick must write a value for every
    // flag the engine consumes — partial flag sets would leave stale
    // values from a previous pick still influencing the multiplier.
    for (const level of TEAM_LEVEL_ORDER) {
      const flags = getTeamLevelFlags(level)
      for (const key of PEDIGREE_KEYS) {
        expect(flags).toHaveProperty(key)
        expect(typeof flags[key]).toBe('boolean')
      }
    }
  })

  it('multiplier increases with team experience (within calibration band)', () => {
    // The four buckets must produce monotonically increasing multipliers.
    // A miscalibrated table that flips ordering would silently penalise
    // experienced founders — exactly the wrong direction.
    const ms = TEAM_LEVEL_ORDER.map((l) =>
      calculatePedigreeMultiplier(getTeamLevelFlags(l)),
    )
    expect(ms[0]).toBe(1.0) // first_time = neutral baseline
    expect(ms[1]).toBeGreaterThan(ms[0])
    expect(ms[2]).toBeGreaterThan(ms[1])
    expect(ms[3]).toBeGreaterThan(ms[2])
    // All within [0.70, 1.80] envelope
    for (const m of ms) {
      expect(m).toBeGreaterThanOrEqual(0.7)
      expect(m).toBeLessThanOrEqual(1.8)
    }
  })

  it('experienced bucket maps to ~1.25× (Atomico Benelux pre-seed median)', () => {
    // The "Recommended" bucket must produce the exact same multiplier
    // founders previously got from the Upswitch demo preset (which
    // previously checked domain_expert + technical_cofounder).  This
    // protects against ambition + team picker drift over time.
    const flags = getTeamLevelFlags('experienced')
    expect(calculatePedigreeMultiplier(flags)).toBeCloseTo(1.25, 5)
  })

  it('first_time bucket = neutral 1.0× multiplier', () => {
    const flags = getTeamLevelFlags('first_time')
    expect(calculatePedigreeMultiplier(flags)).toBe(1.0)
  })

  it('inferTeamLevel reverse-looks-up the active card', () => {
    expect(inferTeamLevel(getTeamLevelFlags('first_time'))).toBe('first_time')
    expect(inferTeamLevel(getTeamLevelFlags('experienced'))).toBe('experienced')
    expect(inferTeamLevel(getTeamLevelFlags('veteran'))).toBe('veteran')
    expect(inferTeamLevel(getTeamLevelFlags('dream_team'))).toBe('dream_team')
  })

  it('inferTeamLevel returns null for non-matching flag sets', () => {
    // A founder who manually toggled a single advanced flag (e.g.
    // checked "second_time_founder" without the rest of the veteran
    // bundle) is in custom territory — picker should show all four
    // cards inactive so they pick a clean baseline.
    expect(
      inferTeamLevel({
        prior_exit: false,
        top_unicorn_alumnus: false,
        domain_expert_10y: false,
        second_time_founder: true, // alone — no bucket matches
        has_technical_cofounder: false,
        solo_founder: false,
      }),
    ).toBeNull()
  })

  it('returns fresh objects (not shared references)', () => {
    // Defensive — without this, mutating the returned object would
    // poison the in-module table for every subsequent caller.  Lots of
    // store reducers spread the result before mutating, so the unit
    // test guards against future regressions in those reducers.
    const a = getTeamLevelFlags('experienced')
    const b = getTeamLevelFlags('experienced')
    expect(a).not.toBe(b)
    a.prior_exit = true
    expect(b.prior_exit).toBe(false)
  })
})
