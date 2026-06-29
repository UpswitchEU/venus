import { describe, expect, it } from 'vitest'
import { mapBelgianOfficialRegistryResponseToOfficialFinancials } from '../mapBelgianOfficialRegistryResponse'

describe('mapBelgianOfficialRegistryResponseToOfficialFinancials', () => {
  it('returns undefined for invalid_input', () => {
    expect(
      mapBelgianOfficialRegistryResponseToOfficialFinancials({ status: 'invalid_input' })
    ).toBeUndefined()
  })

  it('returns undefined for error (no silent failure UI)', () => {
    expect(
      mapBelgianOfficialRegistryResponseToOfficialFinancials({
        status: 'error',
        data_health: { message: 'Official Belgian financial enrichment failed in Titan.' },
      })
    ).toBeUndefined()
  })

  it('returns undefined for unknown status', () => {
    expect(
      mapBelgianOfficialRegistryResponseToOfficialFinancials({ status: 'unknown' })
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
        revenue_source: 'turnover',
        ebitda: 100_000,
        total_assets: 500_000,
        equity: 300_000,
      },
      data_health: { state: 'ok', message: 'fine' },
    })
    expect(mapped?.filingYear).toBe(2023)
    expect(mapped?.revenue).toBe(1_000_000)
    expect(mapped?.revenueSource).toBe('turnover')
    expect(mapped?.ebitda).toBe(100_000)
    expect(mapped?.totalAssets).toBe(500_000)
    expect(mapped?.equity).toBe(300_000)
    expect(mapped?.verificationBadge?.state).toBe('verified')
    expect(mapped?.sourceLinks?.[0]).toBe('https://example.com/pdf')
  })

  it('maps gross-margin revenue source as partial evidence, not verified turnover', () => {
    const mapped = mapBelgianOfficialRegistryResponseToOfficialFinancials({
      status: 'ok',
      official_financials: {
        filing_year: 2024,
        revenue: 102_368.9,
        revenue_source: 'gross_margin',
        ebitda: 99_658.93,
      },
    })

    expect(mapped?.revenueSource).toBe('gross_margin')
    expect(mapped?.verificationBadge).toEqual({
      state: 'partial',
      label: 'NBB filing uses gross margin',
    })
  })

  it('normalizes rejected valuation-input metadata and proxy historical sources', () => {
    const mapped = mapBelgianOfficialRegistryResponseToOfficialFinancials({
      status: 'ok',
      official_financials: {
        filing_year: 2024,
        revenue: 244_665.68,
        revenue_source: 'gross_margin_revenue_proxy',
        ebitda: -34_970.07,
        historical_years: [
          {
            fiscal_year: '2024',
            revenue: '244665.68',
            revenue_source: 'gross_margin_revenue_proxy',
            ebitda: '-34970.07',
          },
        ],
        valuation_input_years: [],
        excluded_valuation_years: [{ fiscal_year: '2024', reason: 'gross_margin_revenue_proxy' }],
        valuation_input_status: ' ALL_REJECTED ',
      },
    })

    expect(mapped?.revenueSource).toBe('gross_margin')
    expect(mapped?.verificationBadge).toEqual({
      state: 'partial',
      label: 'NBB filing uses gross margin',
    })
    expect(mapped?.historicalYears).toEqual([
      expect.objectContaining({
        fiscalYear: 2024,
        revenue: 244_665.68,
        revenueSource: 'gross_margin',
        ebitda: -34_970.07,
      }),
    ])
    expect(mapped?.valuationInputYears).toEqual([])
    expect(mapped?.excludedValuationYears).toEqual([
      { fiscalYear: 2024, reason: 'gross_margin_revenue_proxy' },
    ])
    expect(mapped?.valuationInputStatus).toBe('all_rejected')
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
