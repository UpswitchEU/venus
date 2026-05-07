import { describe, expect, it } from 'vitest'
import { resolveBookEquityFromYearRow } from './bookEquityFromYearRow'

describe('resolveBookEquityFromYearRow', () => {
  it('prefers explicit total_equity', () => {
    expect(resolveBookEquityFromYearRow({ total_equity: 100 })).toBe(100)
  })

  it('uses assets minus liabilities when equity absent', () => {
    expect(resolveBookEquityFromYearRow({ total_assets: 500, total_liabilities: 200 })).toBe(300)
  })

  it('prefers assets minus total_debt before liabilities when equity is absent (Titan ordering)', () => {
    expect(
      resolveBookEquityFromYearRow({
        total_assets: 500,
        total_liabilities: 999,
        total_debt: 200,
      })
    ).toBe(300)
  })

  it('derives equity when explicit total_equity is zero placeholder but assets and debt exist', () => {
    expect(
      resolveBookEquityFromYearRow({
        total_equity: 0,
        total_assets: 500,
        total_debt: 200,
      })
    ).toBe(300)
  })

  it('returns literal zero equity when declared zero and balance sheet lines cannot derive', () => {
    expect(resolveBookEquityFromYearRow({ total_equity: 0 })).toBe(0)
  })
})
