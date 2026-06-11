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
  it('falls back to the positive range midpoint when recommended ask is zero', () => {
    expect(
      formatVersionLabel(
        version({
          equity_value_low: 12_800_000,
          equity_value_mid: 0,
          equity_value_high: 18_400_000,
          recommended_asking_price: 0,
        } as ValuationVersion['valuationResult'])
      )
    ).toBe('€12.8M - €18.4M (Ask: €15.6M)')
  })
})
