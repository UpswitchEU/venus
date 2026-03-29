import { describe, expect, it } from 'vitest'
import { resolveBookEquityFromYearRow } from './bookEquityFromYearRow'

describe('resolveBookEquityFromYearRow', () => {
  it('prefers explicit total_equity', () => {
    expect(resolveBookEquityFromYearRow({ total_equity: 100 })).toBe(100)
  })

  it('uses assets minus liabilities', () => {
    expect(resolveBookEquityFromYearRow({ total_assets: 500, total_liabilities: 200 })).toBe(300)
  })
})
