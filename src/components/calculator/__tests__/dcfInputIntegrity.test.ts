import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '@/types/valuation'
import { buildDcfGlobalAssumptionsSeedPatch } from '../sections/DcfGlobalAssumptionsModel'
import { snapshotFromForecastRowLike, snapshotsClose } from '../sections/dcfForecastModelSync'
import {
  buildProjectionRowFromForecastRow,
  deriveDcfProjectionPreview,
} from '../sections/dcfProjectionPreview'
import { deriveDcfSmartDefaults } from '../sections/dcfSmartDefaults'
import { buildDcfWorkspaceProjectionRows } from '../sections/dcfWorkspaceProjectionRows'
import { buildManualDcfDefaultsPatch } from '../utils/manualDcfDefaultSeeding'
import {
  applyManualDcfSuggestedCapexToBlankForecastRows,
  switchManualDcfInputMode,
} from '../utils/manualDcfForecastTransforms'

const history = [{ year: '2025', revenue: 1000, ebitda: 100 }]
const globals = { daPct: 3, capexPct: 4, nwcPct: 1.5 }

describe('DCF input integrity against independent counterexamples', () => {
  it('does not infer a tax regime from historical earnings', () => {
    expect(deriveDcfSmartDefaults({ yearlyFinancials: history })?.taxRatePct).toBeUndefined()
  })

  it('does not turn a system tax suggestion into an explicit request input', () => {
    const defaults = deriveDcfSmartDefaults({ yearlyFinancials: history })
    if (!defaults) throw new Error('Expected complete historical fixture')
    const smart = { ...defaults, taxRatePct: 25 }
    const patch = buildManualDcfDefaultsPatch({
      formData: { yearlyFinancials: history, dcf_ebitda_margin_pct: 0 } as ManualValuationFormData,
      hasForecastRows: true,
      latestHistoricalRevenue: 1000,
      latestHistoricalEbitda: 100,
      smartDefaults: smart,
      integrationDerivedCapexPct: null,
      integrationDerivedDaPct: null,
    })
    expect(patch).not.toHaveProperty('dcf_tax_rate_pct')
    expect(patch).not.toHaveProperty('dcf_ebitda_margin_pct')
  })

  it('preserves zero margin even when a caller requests legacy placeholder repair', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'full',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      repairZeroEbitdaMarginPlaceholder: true,
      currentValues: { dcfEbitdaMarginPct: 0 },
      smartDefaults: { ebitdaMarginPct: 10, taxRatePct: 25 },
    })
    expect(patch).not.toHaveProperty('dcf_ebitda_margin_pct')
    expect(patch).not.toHaveProperty('dcf_tax_rate_pct')
  })

  it('normalizes an explicitly supplied percentage-point rate without replacing zero', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'full',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      currentValues: { dcfTaxRatePct: '0,5' as unknown as number },
    })
    expect(patch.dcf_tax_rate_pct).toBe(0.5)
  })

  it.each([
    undefined,
    -1,
    101,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('keeps unknown or invalid tax %s nonnumeric in the preview', (taxRatePct) => {
    const row = buildProjectionRowFromForecastRow(
      { year: '2026', revenue: 1000, ebitda: 100 },
      { ...globals, taxRatePct }
    )
    expect(row.taxes).toBeNull()
    expect(row.nopat).toBeNull()
    expect(row.fcff).toBeNull()
    expect(row.ebit).toBe(70)
  })

  it.each([
    0, 0.5, 1, 25.8, 100,
  ])('calculates percentage points %s without magnitude guessing or intermediate rounding', (taxRatePct) => {
    const row = buildProjectionRowFromForecastRow(
      {
        year: '2026',
        revenue: 100,
        ebitda: 100.03,
        depreciation: 5.01,
        capex: 10.02,
        nwc_change: 3.03,
      },
      { ...globals, taxRatePct }
    )
    // EBIT 95.02; FCFF = EBITDA 100.03 − cash taxes − capex 10.02 − ΔNWC 3.03.
    expect(row.taxes).toBeCloseTo((95.02 * taxRatePct) / 100, 12)
    expect(row.fcff).toBeCloseTo(86.98 - (95.02 * taxRatePct) / 100, 12)
  })

  it('keeps supplied FCFF cents and does not invent its missing earnings bridge', () => {
    const row = buildProjectionRowFromForecastRow(
      { year: '2026', free_cash_flow: -10.035 },
      globals
    )
    expect(row.fcff).toBe(-10.035)
    expect(row.revenue).toBeNull()
    expect(row.ebitda).toBeNull()
    expect(row.taxes).toBeNull()
  })

  it('keeps a missing EBITDA distinct from an observed zero', () => {
    const missing = buildProjectionRowFromForecastRow(
      { year: '2026', revenue: 100 },
      { ...globals, taxRatePct: 25 }
    )
    const zero = buildProjectionRowFromForecastRow(
      { year: '2026', revenue: 100, ebitda: 0 },
      { ...globals, taxRatePct: 25 }
    )
    expect(missing.ebitda).toBeNull()
    expect(missing.fcff).toBeNull()
    expect(zero.ebitda).toBe(0)
    expect(zero.fcff).toBe(-4)
  })

  it('autofills pretax drivers while leaving cash-tax outputs unavailable', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: history,
      revenueGrowthPct: 3,
      ebitdaMarginPct: 10,
    })
    expect(rows[0].revenue).toBe(1030)
    expect(rows[0].fcff).toBeNull()
    expect(rows[0].taxes).toBeNull()
  })

  it('does not create a hidden tax rate in the workspace adapter', () => {
    const [row] = buildDcfWorkspaceProjectionRows({
      dcfInputMode: 'ebitda',
      sortedRows: [{ year: '2026', revenue: 1000, ebitda: 100 }],
    })
    expect(row.fcff).toBeNull()
  })

  it('preserves zero capex when hydrating a connector suggestion', () => {
    const { yearlyFinancials } = applyManualDcfSuggestedCapexToBlankForecastRows({
      yearlyFinancials: [{ year: '2026', revenue: 1000, ebitda: 100, capex: 0, isForecast: true }],
      suggestedCapex: 40,
    })
    expect(yearlyFinancials[0].capex).toBe(0)
  })

  it('never turns unknown tax into saved explicit FCFF on a mode switch', () => {
    const form = {
      yearlyFinancials: [{ year: '2026', revenue: 1000, ebitda: 100, isForecast: true }],
    } as ManualValuationFormData
    const next = switchManualDcfInputMode(form, 'fcff_only')
    expect(next.yearlyFinancials[0].free_cash_flow).toBeUndefined()
    expect(next.yearlyFinancials[0].revenue).toBe(1000)
    expect(next.yearlyFinancials[0].ebitda).toBe(100)
  })

  it('keeps a cent edit and a missing bridge driver distinct from the model snapshot', () => {
    const model = snapshotFromForecastRowLike({ revenue: 100, ebitda: 10, capex: 0 })
    expect(
      snapshotsClose(model, snapshotFromForecastRowLike({ revenue: 100, ebitda: 10.01, capex: 0 }))
    ).toBe(false)
    expect(snapshotsClose(model, snapshotFromForecastRowLike({ revenue: 100, ebitda: 10 }))).toBe(
      false
    )
  })

  it.each([
    0,
    undefined,
  ])('does not project an older profitable year over a latest unusable revenue %s', (revenue) => {
    const rows = [...history, { year: '2026', revenue, ebitda: 0 }]
    expect(deriveDcfSmartDefaults({ yearlyFinancials: rows })).toBeNull()
    expect(
      deriveDcfProjectionPreview({
        yearlyFinancials: rows,
        revenueGrowthPct: 3,
        ebitdaMarginPct: 10,
      })
    ).toEqual([])
  })

  it('is invariant to duplicate/reordered observations and rejects conflicting fiscal facts', () => {
    const older = { year: '2024', revenue: 900, ebitda: 90 }
    const args = {
      revenueGrowthPct: 3,
      ebitdaMarginPct: 10,
      taxRatePct: 25.8,
      forecastYears: [2027, 2026, 2026],
    }
    expect(
      deriveDcfProjectionPreview({ ...args, yearlyFinancials: [...history, older, ...history] })
    ).toEqual(
      deriveDcfProjectionPreview({
        ...args,
        yearlyFinancials: [older, ...history],
        forecastYears: [2026, 2027],
      })
    )
    expect(
      deriveDcfSmartDefaults({ yearlyFinancials: [...history, { ...history[0], ebitda: 100.01 }] })
    ).toBeNull()
  })

  it('preserves a supplied FCFF row on an idempotent mode change', () => {
    const form = {
      dcf_input_mode: 'fcff_only',
      yearlyFinancials: [
        { year: '2026', revenue: 0, ebitda: 0, free_cash_flow: 100.035, isForecast: true },
      ],
    } as ManualValuationFormData
    expect(switchManualDcfInputMode(form, 'fcff_only')).toBe(form)
  })
})
