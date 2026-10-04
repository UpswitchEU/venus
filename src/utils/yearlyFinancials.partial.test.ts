import { describe, expect, it } from 'vitest'
import { buildManualPartialInput } from '@/features/manual/utils/manualPartialAssessment'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  isCompleteYearlyFinancial,
  turnoverOf,
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
  it.each([
    'observed',
    'derived',
  ] as const)('retains %s zero FCFF independently of missing earnings', (status) => {
    const [row] = buildYearlyFinancialsFromCurrentAndHistorical(
      {
        year: 2025,
        revenue: 100,
        free_cash_flow: 0,
        financial_observations: { revenue: 'observed', free_cash_flow: status },
      },
      []
    )
    expect(row.ebitda).toBeUndefined()
    expect(row.free_cash_flow).toBe(0)
    expect(isCompleteYearlyFinancial(row)).toBe(true)
  })
  it.each([
    'missing',
    'placeholder',
    'unknown',
  ] as const)('does not substitute %s operating revenue for the reported amount', (status) => {
    expect(
      turnoverOf({
        revenue: 105,
        financial_income: 5,
        operating_revenue: 100,
        financial_observations: { revenue: 'observed', operating_revenue: status },
      })
    ).toBe(105)
  })
})
