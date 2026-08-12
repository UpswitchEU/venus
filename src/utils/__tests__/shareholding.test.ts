import { describe, expect, it } from 'vitest'
import { ValuationRequestSchema } from '../../types/schemas'
import {
  formatShareholdingInput,
  formatShareholdingToast,
  hasAtMostTwoShareholdingDecimals,
  parseShareholdingInput,
} from '../shareholding'

describe('shareholding utilities', () => {
  it('formats shareholding values with exactly two decimals', () => {
    expect(formatShareholdingInput(33)).toBe('33.00')
    expect(formatShareholdingInput(33.3)).toBe('33.30')
    expect(formatShareholdingToast(33.33)).toBe('33.33%')
  })

  it('parses decimal shareholding input safely', () => {
    expect(parseShareholdingInput('33.33')).toBe(33.33)
    expect(parseShareholdingInput('33,33')).toBe(33.33)
    expect(parseShareholdingInput('1e2')).toBeUndefined()
    expect(parseShareholdingInput('')).toBeUndefined()
  })

  it('detects values with more than two decimals', () => {
    expect(hasAtMostTwoShareholdingDecimals(33.33)).toBe(true)
    expect(hasAtMostTwoShareholdingDecimals(33)).toBe(true)
    expect(hasAtMostTwoShareholdingDecimals(33.333)).toBe(false)
  })

  it('ValuationRequestSchema accepts an omitted, full, or partial stake with two decimals', () => {
    const omitted = ValuationRequestSchema.safeParse({
      company_name: 'Precision Co',
      country_code: 'BE',
      industry: 'technology',
      current_year_data: { revenue: 100000, ebitda: 10000 },
    })
    const full = ValuationRequestSchema.safeParse({
      company_name: 'Precision Co',
      country_code: 'BE',
      industry: 'technology',
      current_year_data: { revenue: 100000, ebitda: 10000 },
      shares_for_sale: 100,
    })
    const partial = ValuationRequestSchema.safeParse({
      company_name: 'Precision Co',
      country_code: 'BE',
      industry: 'technology',
      current_year_data: { revenue: 100000, ebitda: 10000 },
      shares_for_sale: 33.33,
    })
    const tooManyDecimals = ValuationRequestSchema.safeParse({
      company_name: 'Precision Co',
      country_code: 'BE',
      industry: 'technology',
      current_year_data: { revenue: 100000, ebitda: 10000 },
      shares_for_sale: 33.333,
    })

    expect(omitted.success).toBe(true)
    expect(full.success).toBe(true)
    expect(partial.success).toBe(true)
    expect(tooManyDecimals.success).toBe(false)
  })

  it('ValuationRequestSchema accepts zero and rejects shares_for_sale above 100', () => {
    const zero = ValuationRequestSchema.safeParse({
      company_name: 'Precision Co',
      country_code: 'BE',
      industry: 'technology',
      current_year_data: { revenue: 100000, ebitda: 10000 },
      shares_for_sale: 0,
    })
    const aboveRange = ValuationRequestSchema.safeParse({
      company_name: 'Precision Co',
      country_code: 'BE',
      industry: 'technology',
      current_year_data: { revenue: 100000, ebitda: 10000 },
      shares_for_sale: 100.01,
    })

    expect(zero.success).toBe(true)
    expect(aboveRange.success).toBe(false)
  })
})
