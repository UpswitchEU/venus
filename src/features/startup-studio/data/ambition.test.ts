import { describe, expect, it } from 'vitest'
import {
  AMBITION_ORDER,
  getAmbitionAnchors,
  inferAmbition,
} from './ambition'

describe('ambition module', () => {
  it('returns sector-specific anchors for every (sector × ambition) pair', () => {
    const sectors = [
      'saas',
      'marketplace',
      'fintech',
      'biotech_healthtech',
      'deeptech_ai',
      'consumer',
      'hardware',
      'other',
    ] as const
    for (const sector of sectors) {
      for (const level of AMBITION_ORDER) {
        const a = getAmbitionAnchors(sector, level)
        expect(a.year5_revenue).toBeGreaterThan(0)
        expect(a.exit_revenue_multiple).toBeGreaterThan(0)
        expect(a.target_roi_x).toBeGreaterThan(0)
      }
    }
  })

  it('Y5 revenue strictly increases with ambition (within sector)', () => {
    // Every sector must respect the calibration invariant: more ambition
    // = more upside the founder is committing to defend.  A miscalibrated
    // table that flips this order would silently give bullish founders a
    // *lower* engine number — exactly the wrong direction.
    const sectors = ['saas', 'marketplace', 'fintech', 'consumer'] as const
    for (const sector of sectors) {
      const c = getAmbitionAnchors(sector, 'conservative').year5_revenue
      const s = getAmbitionAnchors(sector, 'standard').year5_revenue
      const a = getAmbitionAnchors(sector, 'ambitious').year5_revenue
      expect(c).toBeLessThan(s)
      expect(s).toBeLessThan(a)
    }
  })

  it('target ROI strictly decreases with ambition (within sector)', () => {
    // Stronger team / more ambitious story → VCs accept lower required-
    // return multiple.  Strebulaev "Venture Mindset" 2024 calibration.
    const sectors = ['saas', 'marketplace', 'fintech', 'deeptech_ai'] as const
    for (const sector of sectors) {
      const c = getAmbitionAnchors(sector, 'conservative').target_roi_x
      const s = getAmbitionAnchors(sector, 'standard').target_roi_x
      const a = getAmbitionAnchors(sector, 'ambitious').target_roi_x
      expect(c).toBeGreaterThanOrEqual(s)
      expect(s).toBeGreaterThanOrEqual(a)
    }
  })

  it('Upswitch preset values map to standard marketplace ambition', () => {
    // The Demo: Value Upswitch preset sets Y5=€15M, exit=5×, ROI=15×.
    // These MUST match the standard-marketplace anchor row exactly so a
    // founder who lands on the preset sees the AmbitionPicker correctly
    // highlighting "Category leader" as the active card (without us
    // having to track preset state separately).
    const a = getAmbitionAnchors('marketplace', 'standard')
    expect(a.year5_revenue).toBe(15_000_000)
    expect(a.exit_revenue_multiple).toBe(5)
    expect(a.target_roi_x).toBe(15)
  })

  it('inferAmbition reverse-looks-up the active card from store values', () => {
    expect(inferAmbition('marketplace', 15_000_000, 5, 15)).toBe('standard')
    expect(inferAmbition('saas', 8_000_000, 6, 20)).toBe('standard')
    expect(inferAmbition('saas', 18_000_000, 7, 15)).toBe('ambitious')
    expect(inferAmbition('saas', 3_000_000, 5, 25)).toBe('conservative')
  })

  it('inferAmbition returns null for non-matching values', () => {
    // A founder who manually typed €11M Y5 doesn't match any pre-set
    // bucket — the picker should show all three cards inactive so the
    // founder can pick one to overwrite with a clean baseline.
    expect(inferAmbition('saas', 11_000_000, 5, 18)).toBeNull()
    expect(inferAmbition('marketplace', null, 5, 15)).toBeNull()
  })

  it('inferAmbition tolerates small rounding drift', () => {
    // Preset values + ambition lookup share the same constants today,
    // but the engine round-trips Decimals → JSON → numbers and could
    // easily produce 4.9999 instead of 5.  The tolerance band must
    // catch these.
    expect(inferAmbition('marketplace', 15_050_000, 5.1, 14.9)).toBe('standard')
  })

  it('falls back to "other" when sector key is missing from the table', () => {
    // Defensive — guards against a future store migration that adds a
    // sector before the ambition table catches up.  Caller still gets
    // *some* numbers instead of a runtime crash.
    const a = getAmbitionAnchors(
      'this_sector_does_not_exist' as unknown as 'saas',
      'standard',
    )
    expect(a.year5_revenue).toBeGreaterThan(0)
  })
})
