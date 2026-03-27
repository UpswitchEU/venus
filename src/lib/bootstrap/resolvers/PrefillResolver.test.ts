import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrefillResolver } from './PrefillResolver'

describe('PrefillResolver session fallback years', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the filing year when current_year_data has values but no year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const resolver = new PrefillResolver()
    const result = (resolver as any).extractSessionPrefill({
      company_name: 'Northwind BV',
      current_year_data: {
        revenue: 1_000_000,
        ebitda: 120_000,
      },
    })

    expect(result.financials?.yearData).toEqual({
      2024: { revenue: 1_000_000, ebitda: 120_000 },
    })
  })
})
