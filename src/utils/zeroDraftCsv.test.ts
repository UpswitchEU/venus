import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult } from '@/types/valuation'
import { buildZeroDraftCsv } from './zeroDraftCsv'

const method: ValuationMethodResult = {
  label: 'DCF',
  available: true,
  value: 1.123,
  details: { equity_range_low: -0.125, equity_range_high: 2.456 },
}
describe('Zero Draft financial export', () => {
  it('preserves native precision, currency, and value basis', () => {
    const csv = buildZeroDraftCsv({ reportId: 'r', currency: 'USD', methods: { dcf: method } })
    expect(csv).toContain('Currency,USD')
    expect(csv).toContain('dcf,DCF,yes,USD,equity_value,1.123,-0.125,2.456,model')
    expect(csv).not.toContain('_eur')
  })
  it('exports an enterprise method as enterprise value with its own band', () => {
    const csv = buildZeroDraftCsv({
      reportId: 'r',
      currency: 'EUR',
      methods: {
        dcf: {
          ...method,
          currency: 'GBP',
          value_basis: 'enterprise_value',
          value_low: 0,
          value_high: 3,
        },
      },
    })
    expect(csv).toContain('dcf,DCF,yes,GBP,enterprise_value,1.123,0,3,model')
  })
  it('does not fabricate currency or expose unavailable/teaser values', () => {
    const csv = buildZeroDraftCsv({
      reportId: 'r',
      methods: {
        dcf: { ...method, available: false, multiple_used: 3 },
        teaser: { ...method, plan_teaser: true, wacc: 0.1 },
      },
    })
    expect(csv).toContain('Currency,unknown')
    expect(csv).toContain('dcf,DCF,no,,equity_value,,,,,,,')
    expect(csv).not.toContain('1.123')
  })
  it('rejects coercible malformed amounts', () => {
    const csv = buildZeroDraftCsv({
      reportId: 'r',
      currency: 'EUR',
      methods: {
        dcf: {
          ...method,
          value: true,
          multiple_used: [],
          wacc: '1e999',
        } as unknown as ValuationMethodResult,
      },
    })
    expect(csv).toContain('dcf,DCF,no,EUR,equity_value,,,,,,,')
    expect(csv).not.toContain('NaN')
  })
})
