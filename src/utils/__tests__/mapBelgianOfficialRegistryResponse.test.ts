import { describe, expect, it } from 'vitest'
import { mapBelgianOfficialRegistryResponseToOfficialFinancials } from '../mapBelgianOfficialRegistryResponse'

describe('mapBelgianOfficialRegistryResponseToOfficialFinancials', () => {
  it('returns undefined for invalid_input', () => {
    expect(
      mapBelgianOfficialRegistryResponseToOfficialFinancials({ status: 'invalid_input' })
    ).toBeUndefined()
  })

  it('maps ok payload with official_financials snake_case', () => {
    const mapped = mapBelgianOfficialRegistryResponseToOfficialFinancials({
      status: 'ok',
      source_links: ['https://example.com/pdf'],
      official_financials: {
        source: 'staatsbladmonitor',
        source_label: 'NBB',
        filing_year: 2023,
        revenue: 1_000_000,
        ebitda: 100_000,
        total_assets: 500_000,
        equity: 300_000,
      },
      data_health: { state: 'ok', message: 'fine' },
    })
    expect(mapped?.filingYear).toBe(2023)
    expect(mapped?.revenue).toBe(1_000_000)
    expect(mapped?.ebitda).toBe(100_000)
    expect(mapped?.totalAssets).toBe(500_000)
    expect(mapped?.equity).toBe(300_000)
    expect(mapped?.verificationBadge?.state).toBe('verified')
    expect(mapped?.sourceLinks?.[0]).toBe('https://example.com/pdf')
  })

  it('coerces numeric strings from JSON', () => {
    const mapped = mapBelgianOfficialRegistryResponseToOfficialFinancials({
      status: 'ok',
      official_financials: {
        filing_year: '2022',
        revenue: '1500000.5',
        ebitda: '175000',
        total_assets: '800000',
        equity: '400000',
      },
    })
    expect(mapped?.filingYear).toBe(2022)
    expect(mapped?.revenue).toBe(1_500_000.5)
    expect(mapped?.ebitda).toBe(175_000)
    expect(mapped?.totalAssets).toBe(800_000)
    expect(mapped?.equity).toBe(400_000)
  })
})
