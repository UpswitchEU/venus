import type { DcfYearlyFinancialsLike, DcfSmartDefaults } from './dcfSmartDefaults'

export interface DcfProjectionPreviewRow {
  year: number
  revenue: number
  ebitda: number
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
  const years = Math.max(1, args.years ?? 3)

  const rows: DcfProjectionPreviewRow[] = []
  let revenue = latest.revenue
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
