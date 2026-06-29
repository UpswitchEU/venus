import { describe, expect, it } from 'vitest'

import {
  shouldBlockUntrustedFinancialPrefill,
  stripBlockedUntrustedOperatingFinancialSurface,
} from '../officialValuationInputPolicy'

type OfficialPayload = Parameters<typeof shouldBlockUntrustedFinancialPrefill>[0]

function runtimeOfficialPayload(value: Record<string, unknown>): OfficialPayload {
  return value as OfficialPayload
}

describe('officialValuationInputPolicy', () => {
  it.each([
    'gross_margin',
    'gross_margin_revenue_proxy',
  ])('blocks official %s revenue from restoring operating valuation inputs', (revenueSource) => {
    const officialFinancials = {
      historicalYears: [
        {
          fiscalYear: 2024,
          revenue: 244_665.68,
          revenueSource,
          ebitda: -34_970.07,
        },
      ],
    }

    expect(shouldBlockUntrustedFinancialPrefill(officialFinancials)).toBe(true)
  })

  it('strips stale operating fields when all official valuation years were rejected', () => {
    const surface = {
      revenue: 1_000_000,
      ebitda: 100_000,
      current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      historical_years_data: [{ year: 2024, revenue: 900_000, ebitda: 90_000 }],
      company_name: 'KEUKEN',
      official_financials: {
        valuationInputStatus: 'all_rejected',
        excludedValuationYears: [{ fiscalYear: 2024, reason: 'gross_margin_revenue_proxy' }],
      },
    }

    const stripped = stripBlockedUntrustedOperatingFinancialSurface(surface)

    expect(stripped.company_name).toBe('KEUKEN')
    expect(stripped.official_financials).toEqual(surface.official_financials)
    expect(stripped.revenue).toBeUndefined()
    expect(stripped.ebitda).toBeUndefined()
    expect(stripped.current_year_data).toBeUndefined()
    expect(stripped.historical_years_data).toBeUndefined()
  })

  it('normalizes rejected status casing and whitespace before restoring operating inputs', () => {
    expect(
      shouldBlockUntrustedFinancialPrefill(
        runtimeOfficialPayload({
          valuation_input_status: ' ALL_REJECTED ',
          excluded_valuation_years: [{ fiscal_year: 2024, reason: 'gross_margin_revenue_proxy' }],
        })
      )
    ).toBe(true)
  })

  it('blocks when every official historical year is excluded even without status metadata', () => {
    expect(
      shouldBlockUntrustedFinancialPrefill(
        runtimeOfficialPayload({
          historical_years: [
            { fiscal_year: '2024', revenue: 244_665.68, revenue_source: 'gross_margin' },
            { fiscal_year: 2023, revenue: 230_000, revenue_source: 'gross_margin_revenue_proxy' },
          ],
          excluded_valuation_years: [
            { fiscal_year: 2024, reason: 'gross_margin_revenue_proxy' },
            { fiscal_year: 2023, reason: 'gross_margin_revenue_proxy' },
          ],
        })
      )
    ).toBe(true)
  })
})
