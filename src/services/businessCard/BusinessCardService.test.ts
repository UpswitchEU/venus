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

  it('maps weighted business-card mix into canonical valuation segments', () => {
    const result = businessCardService.transformToValuationRequest({
      company_name: 'Boekhoudkantoor Venus',
      business_type_id: 'accounting',
      business_type_mix: [
        {
          business_type_id: 'accounting',
          business_type_title: 'Accounting',
          weight: 65,
        },
        {
          business_type_id: 'tax-advisory',
          business_type_title: 'Tax advisory',
          weight: 35,
        },
      ],
    })

    expect(result.business_type_id).toBe('accounting')
    expect(result.business_type_segments).toEqual([
      {
        business_type_id: 'accounting',
        business_type_title: 'Accounting',
        weight: 65,
      },
      {
        business_type_id: 'tax-advisory',
        business_type_title: 'Tax advisory',
        weight: 35,
      },
    ])
  })

  it('derives business-card segments from compact weights when no list is present', () => {
    const result = businessCardService.transformToValuationRequest({
      company_name: 'Weighted Co',
      business_type_weights: {
        consulting: '0.4',
        software: '0.6',
      },
    })

    expect(result.business_type_id).toBe('software')
    expect(result.business_type_segments).toEqual([
      { business_type_id: 'software', weight: 0.6 },
      { business_type_id: 'consulting', weight: 0.4 },
    ])
  })
})
