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

  it('uses weighted_valuation blend for version nav when synthesis is stored', () => {
    const createdAt = new Date('2026-03-01T00:00:00.000Z')
    const [navItem] = buildManualVersionHistoryForNav({
      report: null,
      selectedMethod: 'upswitch_adaptive',
      currentVersionLabel: 'Current',
      versions: [
        {
          id: 'v-synth',
          versionLabel: 'Synthesis',
          createdAt,
          isActive: true,
          formData: { selected_method: 'upswitch_adaptive' },
          valuationResult: {
            weighted_valuation: {
              blended_equity_value: 567_771,
              contributions: [
                { method_key: 'dcf', equity_value: 616_744, weight: 0.7 },
                { method_key: 'ebitda_multiple', equity_value: 453_502, weight: 0.3 },
              ],
            },
            valuation_results: {
              upswitch_adaptive: {
                available: true,
                value: 384_000,
                details: { equity_range_low: 300_000, equity_range_high: 450_000 },
              },
            },
          },
        } as unknown as ValuationVersion,
      ],
    })

    expect(navItem.askPrice).toBe(567_771)
    expect(navItem.priceRange).toEqual({ min: 453_502, max: 616_744 })
  })

  it('uses the live nav summary for the current lightweight persisted version', () => {
    const createdAt = new Date('2026-06-02T08:00:00.000Z')
    const [navItem] = buildManualVersionHistoryForNav({
      report: {
        companyName: 'Restaurant Decan',
        valuation: 293_000,
        valuationLow: 220_000,
        valuationHigh: 367_000,
        recommendedAskingPrice: 293_000,
        generatedAt: createdAt,
      } as unknown as ValuationReportData,
      selectedMethod: 'upswitch_adaptive',
      currentVersionLabel: 'Current',
      currentValuationSummary: {
        askPrice: 293_000,
        priceRange: { min: 220_000, max: 367_000 },
      },
      versions: [
        {
          id: 'version-1',
          versionNumber: 1,
          versionLabel: 'Version 1',
          createdAt,
          isActive: true,
          formData: { selected_method: 'upswitch_adaptive' },
          valuationResult: null,
        } as unknown as ValuationVersion,
      ],
    })

    expect(navItem).toMatchObject({
      id: 'version-1',
      label: 'Version 1',
      askPrice: 293_000,
      priceRange: { min: 220_000, max: 367_000 },
      isActive: true,
    })
  })

  it('uses activeVersionNumber to identify the current lightweight version', () => {
    const createdAt = new Date('2026-06-02T08:00:00.000Z')
    const navItems = buildManualVersionHistoryForNav({
      report: {
        companyName: 'Restaurant Decan',
        valuation: 293_000,
        valuationLow: 220_000,
        valuationHigh: 367_000,
        recommendedAskingPrice: 293_000,
        generatedAt: createdAt,
      } as unknown as ValuationReportData,
      selectedMethod: 'upswitch_adaptive',
      currentVersionLabel: 'Current',
      currentValuationSummary: {
        askPrice: 293_000,
        priceRange: { min: 220_000, max: 367_000 },
      },
      activeVersionNumber: 2,
      versions: [
        {
          id: 'version-1',
          versionNumber: 1,
          versionLabel: 'Version 1',
          createdAt,
          formData: { selected_method: 'upswitch_adaptive' },
          valuationResult: {
            valuation_results: {
              upswitch_adaptive: {
                available: true,
                value: 180_000,
                details: { equity_range_low: 150_000, equity_range_high: 210_000 },
              },
            },
          },
        } as unknown as ValuationVersion,
        {
          id: 'version-2',
          versionNumber: 2,
          versionLabel: 'Version 2',
          createdAt,
          formData: { selected_method: 'upswitch_adaptive' },
          valuationResult: null,
        } as unknown as ValuationVersion,
      ],
    })

    expect(navItems[0]).toMatchObject({
      id: 'version-1',
      askPrice: 180_000,
      priceRange: { min: 150_000, max: 210_000 },
      isActive: false,
    })
    expect(navItems[1]).toMatchObject({
      id: 'version-2',
      askPrice: 293_000,
      priceRange: { min: 220_000, max: 367_000 },
      isActive: true,
    })
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
      isActive: true,
    })
  })
})
