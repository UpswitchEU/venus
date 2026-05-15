// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationReportData } from '@/components/calculator'
import type { ValuationVersion } from '@/types/ValuationVersion'
import { buildManualVersionHistoryForNav } from './manualVersionNav'

describe('manualVersionNav', () => {
  it('builds a current-report nav item when no persisted versions exist', () => {
    expect(
      buildManualVersionHistoryForNav({
        versions: [],
        selectedMethod: 'upswitch_adaptive',
        currentVersionLabel: 'Current',
        report: {
          companyName: 'Acme',
          valuation: 1000,
          valuationLow: 800,
          valuationHigh: 1200,
          recommendedAskingPrice: 1100,
          generatedAt: new Date('2026-01-01T00:00:00.000Z'),
        } as unknown as ValuationReportData,
      })
    ).toEqual([
      {
        id: 'current',
        label: 'Current',
        priceRange: { min: 800, max: 1200 },
        askPrice: 1100,
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        isActive: true,
      },
    ])
  })

  it('maps persisted versions through method-aware nav pricing', () => {
    const createdAt = new Date('2026-02-01T00:00:00.000Z')
    const [navItem] = buildManualVersionHistoryForNav({
      report: null,
      selectedMethod: 'ebitda_multiple',
      currentVersionLabel: 'Current',
      versions: [
        {
          id: 'v1',
          versionLabel: 'Initial',
          createdAt,
          isActive: false,
          formData: { selected_method: 'upswitch_adaptive' },
          valuationResult: {
            valuation_results: {
              upswitch_adaptive: {
                available: true,
                value: 500_000,
                details: {
                  equity_range_low: 400_000,
                  equity_range_high: 600_000,
                },
              },
            },
          },
        } as unknown as ValuationVersion,
      ],
    })

    expect(navItem).toEqual({
      id: 'v1',
      label: 'Initial',
      priceRange: { min: 400_000, max: 600_000 },
      askPrice: 500_000,
      timestamp: createdAt,
      isActive: false,
    })
  })
})
