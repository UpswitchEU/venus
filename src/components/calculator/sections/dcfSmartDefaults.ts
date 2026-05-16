export interface DcfYearlyFinancialsLike {
  year: string
  revenue: number
  ebitda: number
  isForecast?: boolean
}

export interface DcfSmartDefaults {
  revenueGrowthPct: number
  ebitdaMarginPct: number
  capexPct: number
  daPct: number
  /** Optional; projection preview falls back when absent (see `deriveDcfProjectionPreview`). */
  nwcPct?: number
  taxRatePct: number
  waccPct: number
  terminalGrowthPct: number
  exitMultiple: number
  historicalYearsUsed: number
}

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function classifyWaccBase(businessCategory?: string): number {
  const key = (businessCategory ?? '').toLowerCase()
  if (key.includes('saas') || key.includes('software') || key.includes('tech')) return 11
  if (key.includes('retail') || key.includes('ecommerce') || key.includes('e-commerce')) return 11.5
  if (key.includes('construction') || key.includes('horeca') || key.includes('hospitality'))
    return 12
  if (key.includes('manufact') || key.includes('industry') || key.includes('industrial'))
    return 11.5
  return 10.5
}

/**
 * Sector WACC band (min / median / max) used as a UI anchor next to the WACC input.
 * Calibrated to Damodaran 2026 EU SMB WACC distributions, narrowed to a ±2.5pp window
 * around the median per sector. Median maps to the same value as `classifyWaccBase`.
 *
 * Returns a label and a min/max for "Sector range: 8.5%–13.5% (median 11.0%)".
 */
export interface WaccSectorBand {
  sectorLabel: string
  median: number
  min: number
  max: number
}

export function deriveWaccSectorBand(businessCategory?: string): WaccSectorBand {
  const median = classifyWaccBase(businessCategory)
  const key = (businessCategory ?? '').toLowerCase()
  let sectorLabel = 'European SMB'
  if (key.includes('saas') || key.includes('software') || key.includes('tech')) {
    sectorLabel = 'SaaS / Software'
  } else if (key.includes('retail') || key.includes('ecommerce') || key.includes('e-commerce')) {
    sectorLabel = 'Retail / e-commerce'
  } else if (
    key.includes('construction') ||
    key.includes('horeca') ||
    key.includes('hospitality')
  ) {
    sectorLabel = 'Construction / Hospitality'
  } else if (key.includes('manufact') || key.includes('industry') || key.includes('industrial')) {
    sectorLabel = 'Industrial / Manufacturing'
  }
  // ±2.5pp band around the sector median, rounded to 1 decimal.
  return {
    sectorLabel,
    median,
    min: round1(Math.max(5, median - 2.5)),
    max: round1(median + 2.5),
  }
}

export function deriveDcfSmartDefaults(args: {
  yearlyFinancials?: DcfYearlyFinancialsLike[]
  businessCategory?: string
}): DcfSmartDefaults | null {
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

  if (historical.length === 0) return null

  const latest = historical[historical.length - 1]
  const first = historical[0]
  const revenueGrowthPct =
    historical.length >= 2 && first.revenue > 0 && latest.revenue > 0 && latest.year > first.year
      ? round1(
          clamp(
            (Math.pow(latest.revenue / first.revenue, 1 / (latest.year - first.year)) - 1) * 100,
            -15,
            25
          )
        )
      : 5

  const marginSamples = historical
    .filter((row) => row.revenue !== 0)
    .map((row) => (row.ebitda / row.revenue) * 100)
  const ebitdaMarginPct =
    marginSamples.length > 0 ? round1(clamp(marginSamples[marginSamples.length - 1], -10, 40)) : 15

  const capexPct = round1(clamp(Math.max(2, Math.abs(ebitdaMarginPct) * 0.2), 2, 6))
  const daPct = round1(clamp(capexPct * 0.8, 2, 5))
  const taxRatePct = 25
  const waccBase = classifyWaccBase(args.businessCategory)
  const growthRiskAdjustment = revenueGrowthPct > 12 ? 0.5 : revenueGrowthPct < 0 ? 1 : 0
  const waccPct = round1(clamp(waccBase + growthRiskAdjustment, 9, 14))
  const terminalGrowthPct = round1(
    clamp(Math.min(2.5, Math.max(1.5, revenueGrowthPct / 4)), 1.5, 2.5)
  )

  return {
    revenueGrowthPct,
    ebitdaMarginPct,
    capexPct,
    daPct,
    taxRatePct,
    waccPct,
    terminalGrowthPct,
    exitMultiple: 6,
    historicalYearsUsed: historical.length,
  }
}
