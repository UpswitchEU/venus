import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult } from '@/types/valuation'
import { buildZeroDraftCsv } from './zeroDraftCsv'

const method: ValuationMethodResult = {
  label: 'DCF',
  available: true,
  value: 1.123,
  details: { equity_range_low: -0.125, equity_range_high: 2.456 },
}

function readMethod(csv: string) {
  const lines = csv.split('\r\n')
  const index = lines.findIndex((line) => line.startsWith('method_key,'))
  const cells = lines[index + 1].split(',')
  return Object.fromEntries(lines[index].split(',').map((key, i) => [key, cells[i]]))
}

describe('Zero Draft financial export', () => {
  it('preserves native precision, currency, and value basis', () => {
    const csv = buildZeroDraftCsv({ reportId: 'r', currency: 'USD', methods: { dcf: method } })
    expect(csv).toContain('Currency,USD')
    expect(readMethod(csv)).toMatchObject({
      currency: 'USD',
      value_basis: 'equity_value',
      value: '1.123',
      range_low: '-0.125',
      range_high: '2.456',
      range_type: 'model',
      equity_mid_eur: '',
      range_low_eur: '',
      range_high_eur: '',
    })
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
    expect(readMethod(csv)).toMatchObject({
      currency: 'GBP',
      value_basis: 'enterprise_value',
      value: '1.123',
      range_low: '0',
      range_high: '3',
      range_type: 'model',
      equity_mid_eur: '',
    })
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
    expect(readMethod(csv)).toMatchObject({
      available: 'no',
      currency: '',
      value: '',
      equity_mid_eur: '',
    })
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
    expect(readMethod(csv)).toMatchObject({
      available: 'no',
      currency: 'EUR',
      value: '',
      equity_mid_eur: '',
    })
    expect(csv).not.toContain('NaN')
  })

  it('retains the legacy column prefix for EUR equity consumers without rounding', () => {
    const csv = buildZeroDraftCsv({ reportId: 'r', currency: 'EUR', methods: { dcf: method } })
    expect(csv).toContain(
      'method_key,label,available,equity_mid_eur,range_low_eur,range_high_eur,range_type,multiple_used,wacc,unavailable_reason,'
    )
    expect(readMethod(csv)).toMatchObject({
      equity_mid_eur: '1.123',
      range_low_eur: '-0.125',
      range_high_eur: '2.456',
      value: '1.123',
    })
  })

  it.each(['enterprise_value', null] as const)('does not label %s as EUR equity', (basis) => {
    const csv = buildZeroDraftCsv({
      reportId: 'r',
      currency: 'EUR',
      methods: { dcf: { ...method, value_basis: basis } },
    })
    expect(readMethod(csv)).toMatchObject({
      equity_mid_eur: '',
      range_low_eur: '',
      range_high_eur: '',
      value: '1.123',
    })
  })

  it.each([
    '=1+1',
    '+1+1',
    '-1+1',
    '@SUM(1)',
    '\t=1+1',
    '\r=1+1',
    '\n=1+1',
    '  =1+1',
    '＝1+1',
    '＋1+1',
    '－1+1',
    '＠SUM(1)',
  ])('quotes and neutralizes formula-like text %j', (label) => {
    const csv = buildZeroDraftCsv({
      reportId: label,
      businessName: label,
      selectedMethod: label,
      methods: { [label]: { ...method, label, unavailable_reason: label } },
    })
    const escaped = `"\t${label}"`
    expect(csv.split(escaped)).toHaveLength(7)
  })

  it('escapes quotes, separators and line breaks without creating spreadsheet cells', () => {
    const label = '=1+1,"next"\n=2+2'
    const csv = buildZeroDraftCsv({ reportId: 'r', methods: { dcf: { ...method, label } } })
    expect(csv).toContain('"\t=1+1,""next""\n=2+2"')
  })

  it('keeps signed and zero financial amounts numeric', () => {
    const csv = buildZeroDraftCsv({
      reportId: 'r',
      currency: 'EUR',
      fiscalAnchor: -2.5,
      methods: {
        dcf: {
          ...method,
          value: -0.125,
          multiple_used: 0,
          wacc: 0,
          details: { equity_range_low: -1.25, equity_range_high: 0 },
        },
      },
    })
    expect(readMethod(csv)).toMatchObject({
      value: '-0.125',
      equity_mid_eur: '-0.125',
      range_low: '-1.25',
      range_high: '0',
      multiple_used: '0',
      wacc: '0',
    })
    expect(csv).toContain('Forfait 4x EBITDA component,-2.5')
  })
})
