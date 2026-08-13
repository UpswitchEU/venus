import { afterEach, describe, expect, it, vi } from 'vitest'
import { businessCardService } from './BusinessCardService'

describe('BusinessCardService', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('strips company graph authority from legacy token cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        company_name: 'Legacy Card BV',
        company_graph_context: {
          company_node_id: '11111111-1111-4111-8111-111111111111',
          graph_revision: `sha256:${'a'.repeat(64)}`,
          maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
          ruleset_version: 'company-graph-maturity/v3',
          audience: 'owner',
        },
      }),
    } as Response)

    const card = await businessCardService.fetchBusinessCard('legacy token/with spaces')

    expect(card).toEqual({ company_name: 'Legacy Card BV' })
    expect(card).not.toHaveProperty('company_graph_context')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('token=legacy%20token%2Fwith%20spaces'),
      expect.any(Object)
    )
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
    expect(result.business_type_mix).toEqual(result.business_type_segments)
    expect(result.business_type_weights).toEqual({
      accounting: 65,
      'tax-advisory': 35,
    })
  })

  it('falls back to business-card mix when segments are present but empty', () => {
    const result = businessCardService.transformToValuationRequest({
      company_name: 'Boekhoudkantoor Venus',
      business_type_segments: [],
      business_type_mix: [
        { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
        { business_type_id: 'tax-advisory', business_type_title: 'Tax advisory', weight: 35 },
      ],
    })

    expect(result.business_type_id).toBe('accounting')
    expect(result.business_type_segments).toEqual([
      { business_type_id: 'accounting', business_type_title: 'Accounting', weight: 65 },
      { business_type_id: 'tax-advisory', business_type_title: 'Tax advisory', weight: 35 },
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
    expect(result.business_type_mix).toEqual(result.business_type_segments)
    expect(result.business_type_weights).toEqual({
      software: 0.6,
      consulting: 0.4,
    })
  })
})
