import { describe, expect, it } from 'vitest'
import type { ValuationResponse } from '../../../types/valuation'
import { deriveNavPricesForVersionNav } from '../components/manualReportPresentation'
import versions from './incidentVersionSummary.fixture.json'

describe('incident version history summary parity', () => {
  it('retains the published prices for all four immutable snapshots without report assets', () => {
    for (const version of versions) {
      const serialized = JSON.stringify(version)
      expect(serialized).not.toContain('html_report')
      expect(serialized).not.toContain('pdf_bytes')
      expect(serialized.length).toBeLessThan(3000)
      const prices = deriveNavPricesForVersionNav(
        version.valuation_result as unknown as ValuationResponse,
        'upswitch_adaptive'
      )
      if (version.version_number === 1) {
        expect(prices.askPrice).toBe(1400832)
        expect(prices.priceRange.min).toBeCloseTo(1047822.40332, 2)
        expect(prices.priceRange.max).toBeCloseTo(1753841.77668, 2)
      } else {
        expect(prices).toEqual({ askPrice: 1218800, priceRange: { min: 950057, max: 1487543 } })
      }
    }
  })
})
