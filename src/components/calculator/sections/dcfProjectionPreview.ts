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
}

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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
  }
): DcfProjectionPreviewRow {
  if (typeof row.free_cash_flow === 'number' && Number.isFinite(row.free_cash_flow)) {
    const y = Number(row.year)
    return {
      year: y,
      revenue: row.revenue,
      ebitda: row.ebitda,
      da: 0,
      ebit: 0,
      taxes: 0,
      nopat: 0,
      capex: 0,
      nwcChange: 0,
      fcff: roundCurrency(row.free_cash_flow),
    }
  }
  const taxRate = globals.taxRatePct / 100
  const revenue = row.revenue
  const ebitda = row.ebitda
  const da = row.depreciation ?? Math.round(revenue * (globals.daPct / 100))
  const capex = row.capex ?? Math.round(revenue * (globals.capexPct / 100))
  const nwcChange = row.nwc_change ?? Math.round(revenue * (globals.nwcPct / 100))
  const ebit = ebitda - da
  const taxes = Math.round(Math.max(0, ebit) * taxRate)
  const nopat = ebit - taxes
  const fcff = Math.round(nopat + da - capex - nwcChange)
  return {
    year: Number(row.year),
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
  ebitda: number,
  daPct: number,
  capexPct: number,
  nwcPct: number,
  taxRate: number
): Pick<
  DcfProjectionPreviewRow,
  'da' | 'ebit' | 'taxes' | 'nopat' | 'capex' | 'nwcChange' | 'fcff'
> {
  const da = roundCurrency(revenue * (daPct / 100))
  const ebit = ebitda - da
  const taxes = roundCurrency(Math.max(0, ebit) * taxRate)
  const nopat = ebit - taxes
  const capex = roundCurrency(revenue * (capexPct / 100))
  const nwcChange = roundCurrency(revenue * (nwcPct / 100))
  const fcff = roundCurrency(nopat + da - capex - nwcChange)
  return { da, ebit, taxes, nopat, capex, nwcChange, fcff }
}

/**
 * Preview rows from the latest historical revenue: one YoY growth % and one EBITDA margin % apply to
 * every projected year; bridge drivers (CapEx, D&A, ΔNWC, tax) are global % of revenue.
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
    .filter((row) => !row.isForecast)
    .map((row) => {
      const revenue = toFinite(row.revenue)
      const ebitda = toFinite(row.ebitda)
      const year = Number.parseInt(row.year, 10)
      return revenue == null || ebitda == null || !Number.isFinite(year)
        ? null
        : { year, revenue, ebitda }
    })
    .filter((row): row is { year: number; revenue: number; ebitda: number } => row != null)
    .sort((a, b) => a.year - b.year)

  const latest = historical[historical.length - 1]
  if (!latest || latest.revenue <= 0) return []

  const revenueGrowthPct = args.revenueGrowthPct ?? args.smartDefaults?.revenueGrowthPct
  const ebitdaMarginPct = args.ebitdaMarginPct ?? args.smartDefaults?.ebitdaMarginPct

  if (revenueGrowthPct == null || ebitdaMarginPct == null) return []

  const growthRate = revenueGrowthPct / 100
  const marginRate = ebitdaMarginPct / 100
  const capexPct = args.capexPct ?? args.smartDefaults?.capexPct ?? DCF_DEFAULT_CAPEX_PCT
  const daPct = args.daPct ?? args.smartDefaults?.daPct ?? DCF_DEFAULT_DA_PCT
  const nwcPct = args.nwcPct ?? args.smartDefaults?.nwcPct ?? DCF_DEFAULT_NWC_PCT
  const taxRate =
    (args.taxRatePct ?? args.smartDefaults?.taxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT) / 100

  const explicitForecastYears = (args.forecastYears ?? [])
    .map((year) => Math.trunc(year))
    .filter((year) => Number.isFinite(year) && year > latest.year)
    .sort((a, b) => a - b)

  const rows: DcfProjectionPreviewRow[] = []
  let revenue = latest.revenue
  if (explicitForecastYears.length > 0) {
    let projectedYear = latest.year
    for (const forecastYear of explicitForecastYears) {
      while (projectedYear < forecastYear) {
        projectedYear += 1
        revenue = revenue * (1 + growthRate)
      }
      const rev = roundCurrency(revenue)
      const ebitda = roundCurrency(revenue * marginRate)
      rows.push({
        year: forecastYear,
        revenue: rev,
        ebitda,
        ...computeFcffRow(rev, ebitda, daPct, capexPct, nwcPct, taxRate),
      })
    }
    return rows
  }

  const years = Math.max(1, args.years ?? 3)
  for (let offset = 1; offset <= years; offset += 1) {
    revenue = revenue * (1 + growthRate)
    const rev = roundCurrency(revenue)
    const ebitda = roundCurrency(revenue * marginRate)
    rows.push({
      year: latest.year + offset,
      revenue: rev,
      ebitda,
      ...computeFcffRow(rev, ebitda, daPct, capexPct, nwcPct, taxRate),
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
    if (!row.isForecast) return row

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
