import { describe, expect, it } from 'vitest'
import { extractFormData } from '../../services/session/SessionFormDataNormalizer'
import type { YearDataInput } from '../../types/valuation'
import { buildValuationRequest } from '../buildValuationRequest'
import { mergeOptionalSessionPrefillFields } from '../mergeOptionalSessionPrefillFields'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  isCompleteYearlyFinancial,
  turnoverOf,
} from '../yearlyFinancials'
import { makeFormData } from './buildValuationRequest.testUtils'

const zero: YearDataInput = {
  year: 2023,
  revenue: 0,
  ebitda: 0,
  cash: 0,
  financial_observations: { revenue: 'observed', ebitda: 'derived', cash: 'observed' },
}

describe('financial observations across session and calculation boundaries', () => {
  it('retains observed zero current and historical periods in the Titan request', () => {
    const result = buildValuationRequest(
      makeFormData({
        revenue: 0,
        ebitda: 0,
        current_year_data: zero,
        historical_years_data: [{ ...zero, year: 2022 }],
      }),
      []
    )
    expect(result.current_year_data).toMatchObject(zero)
    expect(result.historical_years_data).toHaveLength(1)
    expect(result.historical_years_data?.[0]).toMatchObject({ ...zero, year: 2022 })
  })

  it('does not replace an observed zero period with an older profitable one during restore', () => {
    const original = {
      current_year_data: zero,
      historical_years_data: [{ year: 2022, revenue: 100000, ebitda: 20000 }],
    }
    const result = extractFormData(original)
    expect(result.current_year_data).toEqual(zero)
    expect(original.current_year_data).toEqual(zero)
  })

  it('preserves source cash and metadata when promoting a year-data map', () => {
    const result = extractFormData({
      year_data: { '2023': { ...zero, revenue: 1000, ebitda: 100, total_debt: 100.01 } },
    })
    expect(result.current_year_data).toMatchObject({
      year: 2023,
      cash: 0,
      total_debt: 100.01,
      financial_observations: zero.financial_observations,
    })
  })

  it('copies same-year balances before removing the duplicate historical row', () => {
    const original = {
      current_year_data: { year: 2023, revenue: 1000, ebitda: 100 },
      historical_years_data: [{ ...zero, revenue: 1000, ebitda: 100, total_debt: 100.01 }],
    }
    const result = extractFormData(original)
    expect(result.current_year_data).toMatchObject({
      cash: 0,
      total_debt: 100.01,
      financial_observations: { cash: 'observed' },
    })
    expect(result.historical_years_data).toEqual([])
    expect(original.current_year_data).not.toHaveProperty('cash')
  })

  it('keeps observed zeros when stale session prefill offers non-zero replacements', () => {
    const result = mergeOptionalSessionPrefillFields(
      { current_year_data: { year: 2023, revenue: 1000, ebitda: 100, cash: 300 } },
      { current_year_data: zero }
    )
    expect(result.current_year_data?.revenue ?? zero.revenue).toBe(0)
    expect(result.current_year_data?.ebitda ?? zero.ebitda).toBe(0)
    expect(result.current_year_data?.cash ?? zero.cash).toBe(0)
  })

  it('shows an evidenced zero year as complete and keeps its metadata in the manual grid', () => {
    const [row] = buildYearlyFinancialsFromCurrentAndHistorical(zero, [])
    expect(row?.financial_observations).toEqual(zero.financial_observations)
    if (!row) throw new Error('Expected an observed financial row')
    expect(isCompleteYearlyFinancial(row)).toBe(true)
  })

  it('preserves a one-cent revenue correction in the turnover panel', () => {
    expect(
      turnoverOf({ revenue: 100000.13, operating_revenue: 90000.11, financial_income: 10000.01 })
    ).toBe(100000.13)
    expect(
      turnoverOf({ revenue: 100000.12, operating_revenue: 90000.11, financial_income: 10000.01 })
    ).toBe(90000.11)
  })
})

describe('observed current-year basis wins over stale headline mirrors', () => {
  it('does not overwrite an observed zero with earlier positive headline figures', () => {
    const result = buildValuationRequest(
      makeFormData({
        revenue: 100000,
        ebitda: 20000,
        current_year_data: zero,
        historical_years_data: [],
      }),
      []
    )
    expect(result.current_year_data?.revenue).toBe(0)
    expect(result.current_year_data?.ebitda).toBe(0)
  })

  it('does not treat a placeholder zero as EBITDA even with a nonzero headline mirror', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          current_year_data: {
            ...zero,
            revenue: 1000,
            financial_observations: { revenue: 'observed', ebitda: 'missing' },
          },
          historical_years_data: [],
        }),
        []
      )
    ).toThrow('EBITDA is not available')
  })
})

describe('financial observation dates and duplicate display rows', () => {
  it('does not relabel an observed open-year snapshot as closed accounts', () => {
    const year = new Date().getFullYear()
    const current = { ...zero, year, revenue: 1000, ebitda: 100 }
    const restored = extractFormData({ current_year_data: current })
    expect(restored.current_year_data?.year).toBe(year)
    const request = buildValuationRequest(
      makeFormData({
        current_year_data: current,
        historical_years_data: [],
      }),
      []
    )
    expect(request.current_year_data?.year).toBe(year)
  })

  it('keeps the current row when history duplicates its fiscal year', () => {
    const [row] = buildYearlyFinancialsFromCurrentAndHistorical(zero, [{ ...zero, revenue: 1000 }])
    expect(row?.revenue).toBe(0)
  })
})
