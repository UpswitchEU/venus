import type { DcfYearlyFinancialsLike, DcfSmartDefaults } from './dcfSmartDefaults'

export interface DcfProjectionPreviewRow {
  year: number
  revenue: number
  ebitda: number
}

export interface DcfProjectionAutofillRow {
  year: string
  revenue: number
  ebitda: number
  isForecast?: boolean
}

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function roundCurrency(value: number): number {
  return Math.round(value)
}

export function deriveDcfProjectionPreview(args: {
  yearlyFinancials?: DcfYearlyFinancialsLike[]
  smartDefaults?: DcfSmartDefaults | null
  revenueGrowthPct?: number
  ebitdaMarginPct?: number
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
      rows.push({
        year: forecastYear,
        revenue: roundCurrency(revenue),
        ebitda: roundCurrency(revenue * marginRate),
      })
    }
    return rows
  }

  const years = Math.max(1, args.years ?? 3)
  for (let offset = 1; offset <= years; offset += 1) {
    revenue = revenue * (1 + growthRate)
    rows.push({
      year: latest.year + offset,
      revenue: roundCurrency(revenue),
      ebitda: roundCurrency(revenue * marginRate),
    })
  }
  return rows
}

export function applyDcfProjectionPreviewToForecastRows<T extends DcfProjectionAutofillRow>(
  yearlyFinancials: T[],
  projectionRows: DcfProjectionPreviewRow[]
): T[] {
  if (projectionRows.length === 0) return yearlyFinancials

  const projectionByYear = new Map(projectionRows.map((row) => [String(row.year), row]))
  return yearlyFinancials.map((row) => {
    if (!row.isForecast) return row

    const projection = projectionByYear.get(String(row.year))
    if (!projection) return row

    return {
      ...row,
      revenue: projection.revenue,
      ebitda: projection.ebitda,
    }
  })
}
