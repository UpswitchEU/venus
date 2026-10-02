import Decimal from 'decimal.js'
import type { DcfForecastInputsSnapshot } from '../../../types/valuation/manual'
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import { isYearRowForecast } from '../../../utils/yearData'
import { DCF_DEFAULT_CAPEX_PCT, DCF_DEFAULT_DA_PCT, DCF_DEFAULT_NWC_PCT } from './dcfEngineDefaults'
import { dcfHistoricalBasis } from './dcfHistoricalBasis'
import type { DcfSmartDefaults, DcfYearlyFinancialsLike } from './dcfSmartDefaults'

export interface DcfProjectionPreviewRow {
  year: number
  revenue: number | null
  ebitda: number | null
  da: number | null
  ebit: number | null
  taxes: number | null
  nopat: number | null
  capex: number | null
  nwcChange: number | null
  fcff: number | null
}

export interface DcfProjectionAutofillRow {
  year: string
  revenue?: number
  ebitda?: number
  dcf_model_snapshot?: DcfForecastInputsSnapshot
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

// Preview arithmetic stays unrounded; display formatters own display rounding.
// These are modeling inputs, not a substitute for ValuationIQ's saved calculation.
const PreviewDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN })

function taxRateFraction(value: unknown): Decimal | null {
  const parsed = toFinite(value)
  return parsed == null || parsed < 0 || parsed > 100 ? null : new PreviewDecimal(parsed).div(100)
}

function asDecimal(value: number): Decimal {
  return new PreviewDecimal(value)
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
    revenue?: number
    ebitda?: number
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
    taxRatePct?: number
    previousRevenue?: number
  }
): DcfProjectionPreviewRow {
  const parsedYear = Number.parseInt(String(row.year), 10)
  const year = Number.isFinite(parsedYear) ? parsedYear : 0
  const revenue = toFinite(row.revenue)
  const ebitda = toFinite(row.ebitda)
  const explicitFcff = toFinite(row.free_cash_flow)
  const suppliedDa = toFinite(row.depreciation)
  const suppliedCapex = toFinite(row.capex)
  const suppliedNwc = toFinite(row.nwc_change)

  if (explicitFcff != null) {
    return {
      year,
      revenue,
      ebitda,
      da: suppliedDa,
      ebit:
        ebitda != null && suppliedDa != null
          ? asDecimal(ebitda).minus(suppliedDa).toNumber()
          : null,
      taxes: null,
      nopat: null,
      capex: suppliedCapex,
      nwcChange: suppliedNwc,
      fcff: explicitFcff,
    }
  }
  if (revenue == null || ebitda == null) {
    return {
      year,
      revenue,
      ebitda,
      da: suppliedDa,
      ebit: null,
      taxes: null,
      nopat: null,
      capex: suppliedCapex,
      nwcChange: suppliedNwc,
      fcff: null,
    }
  }
  const daPct = toFinite(globals.daPct) ?? DCF_DEFAULT_DA_PCT
  const capexPct = toFinite(globals.capexPct) ?? DCF_DEFAULT_CAPEX_PCT
  const nwcPct = toFinite(globals.nwcPct) ?? DCF_DEFAULT_NWC_PCT
  const previousRevenue = toFinite(globals.previousRevenue)
  return {
    year,
    revenue,
    ebitda,
    ...computeFcffBridge(
      asDecimal(ebitda),
      suppliedDa != null ? asDecimal(suppliedDa) : asDecimal(revenue).mul(daPct).div(100),
      suppliedCapex != null ? asDecimal(suppliedCapex) : asDecimal(revenue).mul(capexPct).div(100),
      suppliedNwc != null
        ? asDecimal(suppliedNwc)
        : asDecimal(revenue)
            .minus(previousRevenue ?? revenue)
            .mul(nwcPct)
            .div(100),
      taxRateFraction(globals.taxRatePct)
    ),
  }
}

function computeFcffBridge(
  ebitda: Decimal,
  da: Decimal,
  capex: Decimal,
  nwcChange: Decimal,
  taxRate: Decimal | null
): Pick<
  DcfProjectionPreviewRow,
  'da' | 'ebit' | 'taxes' | 'nopat' | 'capex' | 'nwcChange' | 'fcff'
> {
  const ebit = ebitda.minus(da)
  const taxes = taxRate == null ? null : PreviewDecimal.max(0, ebit).mul(taxRate)
  const nopat = taxes == null ? null : ebit.minus(taxes)
  const fcff = nopat == null ? null : nopat.plus(da).minus(capex).minus(nwcChange)
  return {
    da: da.toNumber(),
    ebit: ebit.toNumber(),
    taxes: taxes?.toNumber() ?? null,
    nopat: nopat?.toNumber() ?? null,
    capex: capex.toNumber(),
    nwcChange: nwcChange.toNumber(),
    fcff: fcff?.toNumber() ?? null,
  }
}

function computeFcffRow(
  revenue: Decimal,
  previousRevenue: Decimal,
  ebitda: Decimal,
  daPct: number,
  capexPct: number,
  nwcPct: number,
  taxRate: Decimal | null
): Pick<
  DcfProjectionPreviewRow,
  'da' | 'ebit' | 'taxes' | 'nopat' | 'capex' | 'nwcChange' | 'fcff'
> {
  return computeFcffBridge(
    ebitda,
    revenue.mul(daPct).div(100),
    revenue.mul(capexPct).div(100),
    revenue.minus(previousRevenue).mul(nwcPct).div(100),
    taxRate
  )
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
  const historical = dcfHistoricalBasis(args.yearlyFinancials)

  const latest = historical[historical.length - 1]
  if (!latest) return []

  const revenueGrowthPct =
    toFinite(args.revenueGrowthPct) ?? toFinite(args.smartDefaults?.revenueGrowthPct)
  const ebitdaMarginPct =
    toFinite(args.ebitdaMarginPct) ?? toFinite(args.smartDefaults?.ebitdaMarginPct)

  if (revenueGrowthPct == null || ebitdaMarginPct == null) return []

  const growthFactor = asDecimal(revenueGrowthPct).div(100).plus(1)
  const marginRate = asDecimal(ebitdaMarginPct).div(100)
  const capexPct =
    toFinite(args.capexPct) ?? toFinite(args.smartDefaults?.capexPct) ?? DCF_DEFAULT_CAPEX_PCT
  const daPct = toFinite(args.daPct) ?? toFinite(args.smartDefaults?.daPct) ?? DCF_DEFAULT_DA_PCT
  const nwcPct =
    toFinite(args.nwcPct) ?? toFinite(args.smartDefaults?.nwcPct) ?? DCF_DEFAULT_NWC_PCT
  const taxRate = taxRateFraction(args.taxRatePct)

  const explicitForecastYears = [...new Set(args.forecastYears ?? [])]
    .map((year) => Math.trunc(toFinite(year) ?? Number.NaN))
    .filter((year) => Number.isFinite(year) && year > latest.year)
    .sort((a, b) => a - b)

  const rows: DcfProjectionPreviewRow[] = []
  let revenue = asDecimal(latest.revenue)
  if (explicitForecastYears.length > 0) {
    let projectedYear = latest.year
    for (const forecastYear of explicitForecastYears) {
      let previousRevenue = revenue
      while (projectedYear < forecastYear) {
        projectedYear += 1
        previousRevenue = revenue
        revenue = revenue.mul(growthFactor)
      }
      const rev = revenue.toNumber()
      const ebitdaRaw = revenue.mul(marginRate)
      const ebitda = ebitdaRaw.toNumber()
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
    revenue = revenue.mul(growthFactor)
    const rev = revenue.toNumber()
    const ebitdaRaw = revenue.mul(marginRate)
    const ebitda = ebitdaRaw.toNumber()
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
      if (projection.fcff == null) return row
      return {
        ...row,
        free_cash_flow: projection.fcff,
      }
    }

    if (
      projection.revenue == null ||
      projection.ebitda == null ||
      projection.capex == null ||
      projection.da == null ||
      projection.nwcChange == null
    )
      return row

    return {
      ...row,
      revenue: projection.revenue,
      ebitda: projection.ebitda,
      capex: projection.capex,
      depreciation: projection.da,
      nwc_change: projection.nwcChange,
      dcf_model_snapshot: {
        schema_version: 'dcf_forecast_inputs.v2',
        revenue: projection.revenue,
        ebitda: projection.ebitda,
        capex: projection.capex,
        depreciation: projection.da,
        nwc_change: projection.nwcChange,
      },
    }
  })
}
