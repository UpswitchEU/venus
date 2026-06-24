import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import { isYearRowForecast } from '../../../utils/yearData'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
} from './dcfEngineDefaults'
import type { DcfSmartDefaults, DcfYearlyFinancialsLike } from './dcfSmartDefaults'

export interface DcfProjectionPreviewRow {
  year: number
  revenue: number
  ebitda: number
  da: number
  ebit: number
  taxes: number
  nopat: number
  capex: number
  nwcChange: number
  fcff: number
}

export interface DcfProjectionAutofillRow {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  depreciation?: number
  nwc_change?: number
  free_cash_flow?: number
  isForecast?: boolean
  is_forecast?: boolean
}

function toFinite(value: unknown): number | null {
  return parseFlexibleNumber(value) ?? null
}

function roundCurrency(value: number): number {
  return Math.round(value)
}

/**
 * McKinsey-style FCFF bridge (aligned with ValuationIQ `cash_flow_projector`):
 * EBIT = EBITDA - D&A
 * Taxes = max(0, EBIT) * taxRate — no immediate tax credit on operating losses
 * NOPAT = EBIT - Taxes
 * FCFF = NOPAT + D&A - CapEx - ΔNWC
 */
export function buildProjectionRowFromForecastRow(
  row: {
    year: string
    revenue: number
    ebitda: number
    capex?: number
    depreciation?: number
    nwc_change?: number
    /** When set (FCFF-only mode), FCFF is this value directly. */
    free_cash_flow?: number
  },
  globals: {
    daPct: number
    capexPct: number
    nwcPct: number
    taxRatePct: number
    previousRevenue?: number
  }
): DcfProjectionPreviewRow {
  const parsedYear = Number.parseInt(String(row.year), 10)
  const year = Number.isFinite(parsedYear) ? parsedYear : 0
  const revenue = toFinite(row.revenue) ?? 0
  const ebitda = toFinite(row.ebitda) ?? 0
  const explicitFcff = toFinite(row.free_cash_flow)

  if (explicitFcff != null) {
    return {
      year,
      revenue,
      ebitda,
      da: 0,
      ebit: 0,
      taxes: 0,
      nopat: 0,
      capex: 0,
      nwcChange: 0,
      fcff: roundCurrency(explicitFcff),
    }
  }
  const taxRate = (toFinite(globals.taxRatePct) ?? DCF_DEFAULT_TAX_RATE_PCT) / 100
  const daPct = toFinite(globals.daPct) ?? DCF_DEFAULT_DA_PCT
  const capexPct = toFinite(globals.capexPct) ?? DCF_DEFAULT_CAPEX_PCT
  const nwcPct = toFinite(globals.nwcPct) ?? DCF_DEFAULT_NWC_PCT
  const previousRevenue = toFinite(globals.previousRevenue)
  const da = toFinite(row.depreciation) ?? Math.round(revenue * (daPct / 100))
  const capex = toFinite(row.capex) ?? Math.round(revenue * (capexPct / 100))
  const nwcChange =
    toFinite(row.nwc_change) ??
    (previousRevenue != null ? Math.round((revenue - previousRevenue) * (nwcPct / 100)) : 0)
  const ebit = ebitda - da
  const taxes = Math.round(Math.max(0, ebit) * taxRate)
  const nopat = ebit - taxes
  const fcff = Math.round(nopat + da - capex - nwcChange)
  return {
    year,
    revenue,
    ebitda,
    da,
    ebit,
    taxes,
    nopat,
    capex,
    nwcChange,
    fcff,
  }
}

function computeFcffRow(
  revenue: number,
  previousRevenue: number,
  ebitda: number,
  daPct: number,
  capexPct: number,
  nwcPct: number,
  taxRate: number
): Pick<
  DcfProjectionPreviewRow,
  'da' | 'ebit' | 'taxes' | 'nopat' | 'capex' | 'nwcChange' | 'fcff'
> {
  const daRaw = revenue * (daPct / 100)
  const ebitRaw = ebitda - daRaw
  const taxesRaw = Math.max(0, ebitRaw) * taxRate
  const nopatRaw = ebitRaw - taxesRaw
  const capexRaw = revenue * (capexPct / 100)
  const nwcChangeRaw = (revenue - previousRevenue) * (nwcPct / 100)
  const fcffRaw = nopatRaw + daRaw - capexRaw - nwcChangeRaw
  return {
    da: roundCurrency(daRaw),
    ebit: roundCurrency(ebitRaw),
    taxes: roundCurrency(taxesRaw),
    nopat: roundCurrency(nopatRaw),
    capex: roundCurrency(capexRaw),
    nwcChange: roundCurrency(nwcChangeRaw),
    fcff: roundCurrency(fcffRaw),
  }
}

/**
 * Preview rows from the latest historical revenue: one YoY growth % and one EBITDA margin % apply to
 * every projected year; CapEx and D&A are global % of revenue, while ΔNWC is the NWC-to-revenue
 * ratio applied to the year-over-year revenue change.
 * Per-year differences only after users save overrides (see DcfForecastWorkspace merge). User copy:
 * `manualInput.dcfForecastWorkspace` / `forecastDefaultsLead` in messages.
 */
export function deriveDcfProjectionPreview(args: {
  yearlyFinancials?: DcfYearlyFinancialsLike[]
  smartDefaults?: DcfSmartDefaults | null
  revenueGrowthPct?: number
  ebitdaMarginPct?: number
  capexPct?: number
  daPct?: number
  nwcPct?: number
  taxRatePct?: number
  years?: number
  forecastYears?: number[]
}): DcfProjectionPreviewRow[] {
  const historical = (args.yearlyFinancials ?? [])
    .filter((row) => !isYearRowForecast(row))
    .map((row) => {
      const revenue = toFinite(row.revenue)
      const ebitda = toFinite(row.ebitda)
      const year = Number.parseInt(row.year, 10)
      return revenue == null || ebitda == null || !Number.isFinite(year)
        ? null
        : { year, revenue, ebitda }
    })
    .filter(
      (row): row is { year: number; revenue: number; ebitda: number } =>
        row != null && row.revenue > 0
    )
    .sort((a, b) => a.year - b.year)

  const latest = historical[historical.length - 1]
  if (!latest) return []

  const revenueGrowthPct =
    toFinite(args.revenueGrowthPct) ?? toFinite(args.smartDefaults?.revenueGrowthPct)
  const ebitdaMarginPct =
    toFinite(args.ebitdaMarginPct) ?? toFinite(args.smartDefaults?.ebitdaMarginPct)

  if (revenueGrowthPct == null || ebitdaMarginPct == null) return []

  const growthRate = revenueGrowthPct / 100
  const marginRate = ebitdaMarginPct / 100
  const capexPct =
    toFinite(args.capexPct) ?? toFinite(args.smartDefaults?.capexPct) ?? DCF_DEFAULT_CAPEX_PCT
  const daPct = toFinite(args.daPct) ?? toFinite(args.smartDefaults?.daPct) ?? DCF_DEFAULT_DA_PCT
  const nwcPct =
    toFinite(args.nwcPct) ?? toFinite(args.smartDefaults?.nwcPct) ?? DCF_DEFAULT_NWC_PCT
  const taxRate =
    (toFinite(args.taxRatePct) ??
      toFinite(args.smartDefaults?.taxRatePct) ??
      DCF_DEFAULT_TAX_RATE_PCT) / 100

  const explicitForecastYears = (args.forecastYears ?? [])
    .map((year) => Math.trunc(toFinite(year) ?? Number.NaN))
    .filter((year) => Number.isFinite(year) && year > latest.year)
    .sort((a, b) => a - b)

  const rows: DcfProjectionPreviewRow[] = []
  let revenue = latest.revenue
  if (explicitForecastYears.length > 0) {
    let projectedYear = latest.year
    for (const forecastYear of explicitForecastYears) {
      let previousRevenue = revenue
      while (projectedYear < forecastYear) {
        projectedYear += 1
        previousRevenue = revenue
        revenue = revenue * (1 + growthRate)
      }
      const rev = roundCurrency(revenue)
      const ebitdaRaw = revenue * marginRate
      const ebitda = roundCurrency(ebitdaRaw)
      rows.push({
        year: forecastYear,
        revenue: rev,
        ebitda,
        ...computeFcffRow(revenue, previousRevenue, ebitdaRaw, daPct, capexPct, nwcPct, taxRate),
      })
    }
    return rows
  }

  const years = Math.max(1, args.years ?? 3)
  for (let offset = 1; offset <= years; offset += 1) {
    const previousRevenue = revenue
    revenue = revenue * (1 + growthRate)
    const rev = roundCurrency(revenue)
    const ebitdaRaw = revenue * marginRate
    const ebitda = roundCurrency(ebitdaRaw)
    rows.push({
      year: latest.year + offset,
      revenue: rev,
      ebitda,
      ...computeFcffRow(revenue, previousRevenue, ebitdaRaw, daPct, capexPct, nwcPct, taxRate),
    })
  }
  return rows
}

export function applyDcfProjectionPreviewToForecastRows<T extends DcfProjectionAutofillRow>(
  yearlyFinancials: T[],
  projectionRows: DcfProjectionPreviewRow[],
  options?: { mode?: 'ebitda' | 'fcff_only' }
): T[] {
  if (projectionRows.length === 0) return yearlyFinancials

  const projectionByYear = new Map(projectionRows.map((row) => [String(row.year), row]))
  return yearlyFinancials.map((row) => {
    if (!isYearRowForecast(row)) return row

    const projection = projectionByYear.get(String(row.year))
    if (!projection) return row

    if (options?.mode === 'fcff_only') {
      return {
        ...row,
        revenue: 0,
        ebitda: 0,
        free_cash_flow: projection.fcff,
      }
    }

    return {
      ...row,
      revenue: projection.revenue,
      ebitda: projection.ebitda,
      capex: projection.capex,
      depreciation: projection.da,
      nwc_change: projection.nwcChange,
    }
  })
}
