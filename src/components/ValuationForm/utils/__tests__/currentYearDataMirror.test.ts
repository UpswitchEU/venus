import { describe, expect, it } from 'vitest'
import { patchCurrentYearDataFromTopLevelFinancials } from '../currentYearDataMirror'

const base = {
  year: 2025,
  revenue: 1_000_000,
  ebitda: 100_000,
}

describe('patchCurrentYearDataFromTopLevelFinancials', () => {
  it('returns null when current_year_data is missing', () => {
    expect(patchCurrentYearDataFromTopLevelFinancials(undefined, { revenue: 5 })).toBeNull()
  })

  it('updates only revenue when only revenue is passed', () => {
    const out = patchCurrentYearDataFromTopLevelFinancials(base, { revenue: 2_000_000 })
    expect(out?.revenue).toBe(2_000_000)
    expect(out?.ebitda).toBe(100_000)
    expect(out?.year).toBe(2025)
  })

  it('allows revenue 0 (pre-revenue) without treating it as a clear', () => {
    const out = patchCurrentYearDataFromTopLevelFinancials(base, { revenue: 0 })
    expect(out?.revenue).toBe(0)
    expect(out?.ebitda).toBe(100_000)
  })

  it('deletes revenue when cleared (undefined) and own property', () => {
    const out = patchCurrentYearDataFromTopLevelFinancials(base, { revenue: undefined })
    expect(Object.prototype.hasOwnProperty.call(out, 'revenue')).toBe(false)
    expect(out?.ebitda).toBe(100_000)
  })

  it('does not touch ebitda when ebitda key is omitted', () => {
    const out = patchCurrentYearDataFromTopLevelFinancials(base, { revenue: 3 })
    expect(out?.ebitda).toBe(100_000)
  })

  it('updates ebitda including negative values', () => {
    const out = patchCurrentYearDataFromTopLevelFinancials(base, { ebitda: -50_000 })
    expect(out?.ebitda).toBe(-50_000)
    expect(out?.revenue).toBe(1_000_000)
  })
})
