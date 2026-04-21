import { afterEach, describe, expect, it, vi } from 'vitest'
import { businessCardService } from './BusinessCardService'

describe('BusinessCardService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps revenue-only business cards to the filing year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const result = businessCardService.transformToValuationRequest({
      company_name: 'Northwind BV',
      industry: 'Technology',
      revenue: 900_000,
    })

    expect(result.current_year_data).toMatchObject({
      year: 2024,
      revenue: 900_000,
      ebitda: 0,
    })
  })

  it('maps explicit zero revenue to current_year_data (pre-revenue card)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const result = businessCardService.transformToValuationRequest({
      company_name: 'Startup BV',
      industry: 'Technology',
      revenue: 0,
    })

    expect(result.current_year_data).toMatchObject({
      year: 2024,
      revenue: 0,
      ebitda: 0,
    })
  })
})
