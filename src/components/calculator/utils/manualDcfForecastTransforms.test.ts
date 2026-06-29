import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  applyManualDcfProjectionAutofill,
  applyManualDcfSuggestedCapexToBlankForecastRows,
  countManualDcfForecastManualEdits,
  switchManualDcfInputMode,
  syncManualDcfForecastRowsFromProjection,
} from './manualDcfForecastTransforms'

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    businessType: 'software',
    industry: 'technology',
    dcf_revenue_growth_pct: 10,
    dcf_ebitda_margin_pct: 20,
    dcf_capex_pct: 4,
    dcf_da_pct: 3,
    dcf_nwc_pct: 1,
    dcf_tax_rate_pct: 25,
    yearlyFinancials: [
      { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
      { year: '2025', revenue: 1_050_000, ebitda: 210_000, isForecast: true },
      { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
    ] as YearlyFinancials[],
    ...overrides,
  } as ManualValuationFormData
}

describe('manual DCF forecast transforms', () => {
  it('switches forecast rows to FCFF-only mode with a pure payload transform', () => {
    const result = switchManualDcfInputMode(
      makeForm({
        dcf_terminal_value_method: 'exit_multiple',
      }),
      'fcff_only'
    )

    expect(result.dcf_input_mode).toBe('fcff_only')
    expect(result.dcf_terminal_value_method).toBe('perpetual_growth')
    expect(result.yearlyFinancials[0]).toMatchObject({ year: '2024', revenue: 1_000_000 })
    const forecast = result.yearlyFinancials.find((row) => row.year === '2025')
    expect(forecast).toMatchObject({ revenue: 0, ebitda: 0 })
    expect(forecast?.free_cash_flow).toBe(122_875)
  })

  it('ignores stale FCFF residue when switching EBITDA bridge rows to FCFF-only', () => {
    const result = switchManualDcfInputMode(
      makeForm({
        yearlyFinancials: [
          { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
          {
            year: '2025',
            revenue: 1_050_000,
            ebitda: 210_000,
            free_cash_flow: 1,
            isForecast: true,
          },
        ] as YearlyFinancials[],
      }),
      'fcff_only'
    )

    const forecast = result.yearlyFinancials.find((row) => row.isForecast)
    expect(forecast).toMatchObject({ revenue: 0, ebitda: 0 })
    expect(forecast?.free_cash_flow).toBe(122_875)
    expect(forecast?.capex).toBeUndefined()
    expect(forecast?.depreciation).toBeUndefined()
    expect(forecast?.nwc_change).toBeUndefined()
  })

  it('switches localized restored forecast rows to FCFF-only without producing NaN', () => {
    const result = switchManualDcfInputMode(
      makeForm({
        dcf_da_pct: '3,0' as unknown as number,
        dcf_capex_pct: '4,0' as unknown as number,
        dcf_nwc_pct: '1,5' as unknown as number,
        dcf_tax_rate_pct: '25,0' as unknown as number,
        yearlyFinancials: [
          { year: '2024', revenue: '1.000.000', ebitda: '200.000' },
          {
            year: '2025',
            revenue: '1.100.000',
            ebitda: '220.000',
            isForecast: true,
          },
        ] as unknown as YearlyFinancials[],
      }),
      'fcff_only'
    )

    const forecast = result.yearlyFinancials.find((row) => row.isForecast)
    expect(forecast).toMatchObject({ revenue: 0, ebitda: 0 })
    expect(forecast?.free_cash_flow).toBe(127_750)
    expect(Number.isFinite(forecast?.free_cash_flow)).toBe(true)
  })

  it('switches back to EBITDA mode by clearing FCFF and applying projection rows', () => {
    const result = switchManualDcfInputMode(
      makeForm({
        dcf_input_mode: 'fcff_only',
        yearlyFinancials: [
          { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
          {
            year: '2025',
            revenue: 0,
            ebitda: 0,
            free_cash_flow: 150_000,
            isForecast: true,
          },
        ] as YearlyFinancials[],
      }),
      'ebitda'
    )

    const forecast = result.yearlyFinancials.find((row) => row.isForecast)
    expect(result.dcf_input_mode).toBe('ebitda')
    expect(forecast?.free_cash_flow).toBeUndefined()
    expect(forecast?.revenue).toBeGreaterThan(1_000_000)
    expect(forecast?.ebitda).toBeGreaterThan(0)
  })

  it('counts only forecast-side manual FCFF bridge edits', () => {
    expect(
      countManualDcfForecastManualEdits([
        { year: '2024', revenue: 1_000_000, ebitda: 200_000, capex: 42 },
        { year: '2025', revenue: 1_100_000, ebitda: 220_000, capex: 10, isForecast: true },
        { year: '2026', revenue: 1_200_000, ebitda: 240_000, isForecast: true },
      ])
    ).toBe(1)
  })

  it('applies DCF projection autofill without changing historical rows', () => {
    const form = makeForm({
      yearlyFinancials: [
        { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
        { year: '2025', revenue: 1, ebitda: 1, isForecast: true },
      ] as YearlyFinancials[],
    })

    const result = applyManualDcfProjectionAutofill(form)

    expect(result.yearlyFinancials[0]).toEqual(form.yearlyFinancials[0])
    const forecast = result.yearlyFinancials.find((row) => row.isForecast)
    expect(forecast?.revenue).toBeGreaterThan(1_000_000)
    expect(forecast?.ebitda).toBeGreaterThan(0)
  })

  it('applies DCF projection autofill as direct FCFF rows in FCFF-only mode', () => {
    const form = makeForm({
      dcf_input_mode: 'fcff_only',
      yearlyFinancials: [
        { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
        {
          year: '2025',
          revenue: 1_050_000,
          ebitda: 210_000,
          capex: 99_999,
          depreciation: 99_999,
          nwc_change: 99_999,
          isForecast: true,
        },
      ] as YearlyFinancials[],
    })

    const result = applyManualDcfProjectionAutofill(form)

    expect(result.yearlyFinancials[0]).toEqual(form.yearlyFinancials[0])
    const forecast = result.yearlyFinancials.find((row) => row.isForecast)
    expect(forecast).toMatchObject({ revenue: 0, ebitda: 0 })
    expect(forecast?.free_cash_flow).toBe(128_250)
    expect(forecast?.capex).toBeUndefined()
    expect(forecast?.depreciation).toBeUndefined()
    expect(forecast?.nwc_change).toBeUndefined()
  })

  it('hydrates suggested CapEx only into blank forecast rows', () => {
    const originalRows = [
      { year: '2024', revenue: 1_000_000, ebitda: 200_000, capex: 15_000 },
      { year: '2025', revenue: 1_100_000, ebitda: 220_000, capex: 0, isForecast: true },
      { year: '2026', revenue: 1_200_000, ebitda: 240_000, capex: 50_000, isForecast: true },
      { year: '2027', revenue: 1_300_000, ebitda: 260_000, isForecast: true },
    ] as YearlyFinancials[]

    const result = applyManualDcfSuggestedCapexToBlankForecastRows({
      yearlyFinancials: originalRows,
      suggestedCapex: 42_000,
    })

    expect(result.changed).toBe(true)
    expect(result.yearlyFinancials[0].capex).toBe(15_000)
    expect(result.yearlyFinancials[1].capex).toBe(42_000)
    expect(result.yearlyFinancials[2].capex).toBe(50_000)
    expect(result.yearlyFinancials[3].capex).toBe(42_000)
  })

  it('keeps row identity when suggested CapEx has nothing to hydrate', () => {
    const originalRows = [
      { year: '2025', revenue: 1_100_000, ebitda: 220_000, capex: 50_000, isForecast: true },
    ] as YearlyFinancials[]

    const result = applyManualDcfSuggestedCapexToBlankForecastRows({
      yearlyFinancials: originalRows,
      suggestedCapex: 42_000,
    })

    expect(result.changed).toBe(false)
    expect(result.yearlyFinancials).toBe(originalRows)
  })

  it('syncs model-driven projection rows and records the model snapshot', () => {
    const result = syncManualDcfForecastRowsFromProjection({
      yearlyFinancials: [
        { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
        { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
      ] as YearlyFinancials[],
      projectionRows: [
        {
          year: 2025,
          revenue: 1_100_000,
          ebitda: 220_000,
          da: 33_000,
          ebit: 187_000,
          taxes: 46_750,
          nopat: 140_250,
          capex: 44_000,
          nwcChange: 11_000,
          fcff: 118_250,
        },
      ],
      previousModelSnapshots: {},
    })

    expect(result.changed).toBe(true)
    expect(result.yearlyFinancials[0]).toMatchObject({ year: '2024', revenue: 1_000_000 })
    expect(result.yearlyFinancials[1]).toMatchObject({
      year: '2025',
      revenue: 1_100_000,
      ebitda: 220_000,
      capex: 44_000,
      depreciation: 33_000,
      nwc_change: 11_000,
    })
    expect(result.modelSnapshots['2025']).toMatchObject({
      revenue: 1_100_000,
      ebitda: 220_000,
      capex: 44_000,
    })
  })

  it('does not overwrite a forecast row changed after the last model sync', () => {
    const result = syncManualDcfForecastRowsFromProjection({
      yearlyFinancials: [
        {
          year: '2025',
          revenue: 1_250_000,
          ebitda: 260_000,
          capex: 50_000,
          depreciation: 30_000,
          nwc_change: 10_000,
          isForecast: true,
        },
      ] as YearlyFinancials[],
      projectionRows: [
        {
          year: 2025,
          revenue: 1_300_000,
          ebitda: 270_000,
          da: 39_000,
          ebit: 231_000,
          taxes: 57_750,
          nopat: 173_250,
          capex: 52_000,
          nwcChange: 13_000,
          fcff: 147_250,
        },
      ],
      previousModelSnapshots: {
        '2025': {
          revenue: 1_100_000,
          ebitda: 220_000,
          capex: 44_000,
          depreciation: 33_000,
          nwc_change: 11_000,
        },
      },
    })

    expect(result.changed).toBe(false)
    expect(result.yearlyFinancials[0]).toMatchObject({
      revenue: 1_250_000,
      ebitda: 260_000,
      capex: 50_000,
    })
    expect(result.modelSnapshots['2025']).toMatchObject({
      revenue: 1_100_000,
      ebitda: 220_000,
    })
  })
})
