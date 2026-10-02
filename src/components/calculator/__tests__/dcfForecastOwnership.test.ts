import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { snapshotFromForecastRowLike } from '../sections/dcfForecastModelSync'
import { buildProjectionRowFromForecastRow } from '../sections/dcfProjectionPreview'
import {
  applyManualDcfProjectionAutofill,
  syncManualDcfForecastRowsFromProjection,
} from '../utils/manualDcfForecastTransforms'
import { updateManualYearlyFinancialsRows } from '../utils/manualFinancialRowMutations'
import { buildManualInputFieldValidation } from '../utils/manualInputFieldValidation'

const projections = [
  buildProjectionRowFromForecastRow(
    { year: '2026', revenue: 2000, ebitda: 200 },
    { daPct: 3, capexPct: 4, nwcPct: 1.5, taxRatePct: 25 }
  ),
]
const modelRow: YearlyFinancials = {
  year: '2026',
  revenue: 1000,
  ebitda: 100,
  capex: 0,
  depreciation: 30,
  nwc_change: 0,
  isForecast: true,
  dcf_model_snapshot: {
    schema_version: 'dcf_forecast_inputs.v2',
    revenue: 1000,
    ebitda: 100,
    capex: 0,
    depreciation: 30,
    nwc_change: 0,
  },
}

function sync(rows: YearlyFinancials[]) {
  return syncManualDcfForecastRowsFromProjection({
    yearlyFinancials: rows,
    projectionRows: projections,
    previousModelSnapshots: { '2026': snapshotFromForecastRowLike(modelRow) },
  })
}

describe('DCF forecast ownership and retained manual facts', () => {
  it('retains manual facts despite a stale in-memory model cache', () => {
    const { dcf_model_snapshot: _baseline, ...manualRow } = modelRow
    const rows = [manualRow]
    expect(sync(rows).yearlyFinancials).toBe(rows)
    expect(sync(rows).changed).toBe(false)
  })

  it('updates explicitly autofilled projections after JSON save/reload', () => {
    const form = {
      yearlyFinancials: [
        { year: '2025', revenue: 1000, ebitda: 100 },
        { year: '2026', isForecast: true },
      ],
      dcf_revenue_growth_pct: 10,
      dcf_ebitda_margin_pct: 10,
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 1.5,
    } as ManualValuationFormData
    const restored: ManualValuationFormData = JSON.parse(
      JSON.stringify(applyManualDcfProjectionAutofill(form))
    )
    expect(restored.yearlyFinancials[1].dcf_model_snapshot?.schema_version).toBe(
      'dcf_forecast_inputs.v2'
    )
    const result = syncManualDcfForecastRowsFromProjection({
      yearlyFinancials: restored.yearlyFinancials,
      projectionRows: projections,
      previousModelSnapshots: {},
    })
    expect(result.changed).toBe(true)
    expect(result.yearlyFinancials[1].revenue).toBe(2000)
    expect(result.yearlyFinancials[0]).toBe(restored.yearlyFinancials[0])
  })

  it.each([
    'revenue',
    'ebitda',
    'capex',
    'depreciation',
    'nwc_change',
  ] as const)('protects an explicit %s edit equal to the prior model value after reload', (field) => {
    const edited = updateManualYearlyFinancialsRows({
      yearlyFinancials: [modelRow],
      year: '2026',
      isForecast: true,
      field,
      value: modelRow[field],
    })
    expect(edited[0].dcf_model_snapshot).toBeUndefined()
    const restored: YearlyFinancials[] = JSON.parse(JSON.stringify(edited))
    expect(sync(restored).yearlyFinancials).toBe(restored)
  })

  it.each([
    'revenue',
    'ebitda',
    'capex',
    'depreciation',
    'nwc_change',
  ] as const)('preserves a cleared %s as missing after JSON reload', (field) => {
    const edited = updateManualYearlyFinancialsRows({
      yearlyFinancials: [modelRow],
      year: '2026',
      isForecast: true,
      field,
      value: undefined,
    })
    const restored: YearlyFinancials[] = JSON.parse(JSON.stringify(edited))
    expect(restored[0][field]).toBeUndefined()
    expect(sync(restored).yearlyFinancials).toBe(restored)
  })

  it('keeps blank earnings in the draft and blocks silent zero substitution at manual submit', () => {
    const edited = updateManualYearlyFinancialsRows({
      yearlyFinancials: [modelRow],
      year: '2026',
      isForecast: true,
      field: 'ebitda',
      value: undefined,
    })
    const restored: YearlyFinancials[] = JSON.parse(JSON.stringify(edited))
    const form = {
      yearlyFinancials: restored,
      dcf_input_mode: 'ebitda',
      ownerManagers: 1,
      fteEmployees: 0,
    } as ManualValuationFormData
    expect(buildManualInputFieldValidation(form, (key) => key).errors['ebitda-2026']).toBe(
      'validation.forecastFinancialsRequired'
    )
    const zero = { ...form, yearlyFinancials: [{ ...restored[0], ebitda: 0 }] }
    expect(buildManualInputFieldValidation(zero, (key) => key).hasErrors).toBe(false)
  })

  it('preserves zero and the full earnings bridge on direct FCFF edits', () => {
    const result = updateManualYearlyFinancialsRows({
      yearlyFinancials: [modelRow],
      year: '2026',
      isForecast: true,
      field: 'free_cash_flow',
      value: -12.35,
    })
    expect(result[0]).toMatchObject({
      revenue: 1000,
      ebitda: 100,
      capex: 0,
      depreciation: 30,
      nwc_change: 0,
      free_cash_flow: -12.35,
    })
    expect(result[0].dcf_model_snapshot).toBeUndefined()
    expect(sync(result).yearlyFinancials).toBe(result)
  })

  it('protects a cent edit even when model metadata remains from an old client', () => {
    const rows = [{ ...modelRow, ebitda: 100.01 }]
    expect(sync(rows).changed).toBe(false)
    expect(sync(rows).yearlyFinancials).toBe(rows)
  })
})
