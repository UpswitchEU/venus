import { describe, expect, it } from 'vitest'
import type { ValuationVersion } from '../types/ValuationVersion'
import { formatVersionLabel } from './formatters'

function version(valuationResult: ValuationVersion['valuationResult']): ValuationVersion {
  return {
    id: 'v1',
    reportId: 'r1',
    versionNumber: 1,
    versionLabel: 'Version 1',
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
    createdBy: null,
    formData: {} as ValuationVersion['formData'],
    valuationResult,
    htmlReport: null,
    changesSummary: { totalChanges: 0, significantChanges: [] },
    isActive: true,
    isPinned: false,
  }
}

describe('formatVersionLabel', () => {
  it('retains observed zero and withholds a contradictory positive range', () => {
    expect(
      formatVersionLabel(
        version({
          equity_value_low: 12_800_000,
          equity_value_mid: 0,
          equity_value_high: 18_400_000,
          recommended_asking_price: 0,
          currency: 'EUR',
        } as ValuationVersion['valuationResult'])
      )
    ).toBe('€0.00 (Ask: €0.00)')
  })

  it('does not invent an asking price for a loss or default its currency to euros', () => {
    expect(
      formatVersionLabel(
        version({
          equity_value_mid: -10.25,
          currency: 'USD',
        } as ValuationVersion['valuationResult'])
      )
    ).toBe('-$10.25')
    expect(
      formatVersionLabel(version({ equity_value_mid: 0 } as ValuationVersion['valuationResult']))
    ).toBe('0 (currency unknown)')
  })

  it('uses the native currency precision and preserves an enterprise basis', () => {
    expect(
      formatVersionLabel(
        version({
          value: 1000,
          value_basis: 'enterprise_value',
          currency: 'JPY',
          recommended_asking_price: 1200,
        } as ValuationVersion['valuationResult'])
      )
    ).toBe('Enterprise value: ¥1,000')
  })
})
