import { describe, expect, it } from 'vitest'
import { parseCurrentYearRevenueForMethodNav } from './currentYearRevenueForMethodNav'

describe('parseCurrentYearRevenueForMethodNav', () => {
  it('returns undefined when turnover is unset', () => {
    expect(parseCurrentYearRevenueForMethodNav({})).toBeUndefined()
    expect(parseCurrentYearRevenueForMethodNav({ revenue: null })).toBeUndefined()
  })

  it('prefers current_year_data.revenue over top-level revenue', () => {
    expect(
      parseCurrentYearRevenueForMethodNav({
        revenue: 100,
        current_year_data: { revenue: 0 },
      })
    ).toBe(0)
  })

  it('parses finite numbers including zero', () => {
    expect(parseCurrentYearRevenueForMethodNav({ revenue: 0 })).toBe(0)
    expect(parseCurrentYearRevenueForMethodNav({ revenue: '125000' })).toBe(125000)
  })
})
