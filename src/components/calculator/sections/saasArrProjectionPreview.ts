import { getCurrentFilingYear } from '../../../utils/fiscalYear'

export interface SaasArrProjectionRow {
  year: number
  arr: number
}

interface YearlyFinancialLike {
  year: string
  isForecast?: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round0(value: number): number {
  return Math.round(value)
}

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function deriveSaasArrProjectionPreview(args: {
  yearlyFinancials?: YearlyFinancialLike[]
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasNrrPct?: number
  saasChurnPct?: number
  saasExpansionRevenuePct?: number
  projectionYears?: number
}): SaasArrProjectionRow[] {
  const baseArr =
    toFinite(args.saasArr) ??
    ((toFinite(args.saasMrr) ?? 0) > 0 ? (args.saasMrr as number) * 12 : null)
  if (baseArr == null || baseArr <= 0) return []

  const growthPct = toFinite(args.saasArrGrowthPct) ?? 0
  const nrrPct =
    toFinite(args.saasNrrPct) ??
    100 + (toFinite(args.saasExpansionRevenuePct) ?? 0) - (toFinite(args.saasChurnPct) ?? 0)

  const annualGrowthFactor = 1 + growthPct / 100
  const retentionFactor = clamp(nrrPct / 100, 0.7, 1.5)
  const effectiveFactor = clamp(annualGrowthFactor * retentionFactor, 0.6, 2.0)
  const years = Math.max(1, Math.min(args.projectionYears ?? 5, 7))

  const latestActualYearCandidates = (args.yearlyFinancials ?? [])
    .filter((row) => !row.isForecast)
    .map((row) => Number.parseInt(row.year, 10))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b)
  const latestActualYear =
    latestActualYearCandidates.length > 0
      ? latestActualYearCandidates[latestActualYearCandidates.length - 1]
      : undefined

  const startYear = latestActualYear ?? getCurrentFilingYear()
  let currentArr = baseArr

  return Array.from({ length: years }, (_, index) => {
    currentArr *= effectiveFactor
    return {
      year: startYear + index + 1,
      arr: round0(currentArr),
    }
  })
}
