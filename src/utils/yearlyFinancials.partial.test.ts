import { describe, expect, it } from 'vitest'
import { buildManualPartialInput } from '@/features/manual/utils/manualPartialAssessment'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  isCompleteYearlyFinancial,
} from './yearlyFinancials'

describe('missing financial observations through manual intake', () => {
  it('keeps absent EBITDA out of pricing even when a display slot contains zero', () => {
    const rows = buildYearlyFinancialsFromCurrentAndHistorical(
      { year: 2025, revenue: 100.05 } as Parameters<
        typeof buildYearlyFinancialsFromCurrentAndHistorical
      >[0],
      []
    )
    expect(rows[0].financial_observations?.ebitda).toBe('missing')
    expect(isCompleteYearlyFinancial(rows[0])).toBe(false)
    expect(
      buildManualPartialInput({ yearlyFinancials: rows }, 'r', '2026-10-02').financials.ebitda
    ).toBeNull()
  })
  it.each([
    'missing',
    'placeholder',
    'unknown',
  ] as const)('does not admit an EBITDA %s as earnings', (status) => {
    expect(
      isCompleteYearlyFinancial({
        year: 2025,
        revenue: 100,
        ebitda: 0,
        financial_observations: { revenue: 'observed', ebitda: status },
      })
    ).toBe(false)
  })
  it('accepts observed zero earnings and turnover', () => {
    expect(
      isCompleteYearlyFinancial({
        year: 2025,
        revenue: 0,
        ebitda: 0,
        financial_observations: { revenue: 'observed', ebitda: 'observed' },
      })
    ).toBe(true)
  })
  it('does not let unrelated observed cash make placeholder earnings complete', () => {
    expect(
      isCompleteYearlyFinancial({
        year: 2025,
        revenue: 0,
        ebitda: 0,
        financial_observations: { cash: 'observed' },
      })
    ).toBe(false)
  })
})
