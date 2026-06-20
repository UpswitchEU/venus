import { equalWeightsFor, normalizeRemainderWeights } from '@/constants/methodFieldConfig'
import type { BusinessTypeSegmentInput } from '../../../types/valuation/request'
import { computeSegmentWeightedMultiple } from './segmentWeightedMultiple'

export type WeightingMode = 'standard' | 'weighted'
export type MultipleTypeKey = 'ev_ebitda' | 'ev_revenue' | 'pe'
export type AdvisorDiscountKey =
  | 'size_discount'
  | 'liquidity_discount'
  | 'country_adjustment'
  | 'growth_premium'
  | 'owner_concentration'

export type AdvisorDefaultAppliedField =
  | 'multiple_calibration_adjustment'
  | 'historical_ebitda_weighting_mode'
  | 'show_enterprise_to_equity_bridge'

export type ActivePreviewChangeKey =
  | 'livePreviewMultiplePremium'
  | 'livePreviewEffectiveOverride'
  | 'livePreviewSegmentWeights'
  | 'livePreviewMultipleBlend'
  | 'livePreviewRiskOff'
  | 'livePreviewDiscountWeights'
  | 'livePreviewDiscountFloor'
  | 'livePreviewHistoricalWeights'

export const ADVISOR_DISCOUNT_ROWS: Array<{
  key: AdvisorDiscountKey
  labelKey: string
}> = [
  { key: 'size_discount', labelKey: 'sizeDiscount' },
  { key: 'liquidity_discount', labelKey: 'liquidityDiscount' },
  { key: 'country_adjustment', labelKey: 'countryAdjustment' },
  { key: 'growth_premium', labelKey: 'growthPremium' },
  { key: 'owner_concentration', labelKey: 'ownerConcentration' },
]

export const MULTIPLE_TYPE_ROWS: Array<{
  key: MultipleTypeKey
  labelKey: string
  defaultWeight: number
}> = [
  { key: 'ev_ebitda', labelKey: 'evEbitdaBlend', defaultWeight: 60 },
  { key: 'ev_revenue', labelKey: 'evRevenueBlend', defaultWeight: 30 },
  { key: 'pe', labelKey: 'peBlend', defaultWeight: 10 },
]

export interface AdvancedAdvisorLivePreview {
  afterMultiple: number
  afterValue: number
  afterWidth: string
  beforeMultiple: number
  beforeValue: number
  beforeWidth: string
  deltaPercent: number | null
  deltaValue: number
}

export interface AdvancedAdvisorControlModelInput {
  sectorAverageMultiple?: number | null
  multipleCalibrationAdjustment?: number
  multipleCalibrationNote?: string
  effectiveMultipleOverride?: number
  effectiveMultipleOverrideNote?: string
  businessTypeSegments?: BusinessTypeSegmentInput[]
  multipleTypeWeights?: Record<string, number>
  riskAnalysisEnabled?: boolean
  advisorDiscountWeights?: Record<string, number>
  discountFloorFactor?: number
  previewEbitda?: number | null
  historicalYears: number[]
  historicalEbitdaWeightingMode?: WeightingMode
  historicalEbitdaWeights?: Record<number, number>
}

export interface AdvancedAdvisorControlModel {
  activePreviewChangeKeys: ActivePreviewChangeKey[]
  adjustment: number
  calibratedMultiple: number | null
  canWeight: boolean
  complete: boolean
  discountWeights: Record<AdvisorDiscountKey, number>
  effectiveOverrideNoteComplete: boolean
  floorFactor: number
  hasSegmentBlend: boolean
  livePreview: AdvancedAdvisorLivePreview | null
  mode: WeightingMode
  multipleBlendWeights: Record<MultipleTypeKey, number>
  noteComplete: boolean
  previewBaselineMultiple: number | null
  previewEbitdaBasis: number | null
  previewEffectiveMultiple: number | null
  rawWeights: Record<string, number>
  requiresCalibrationNote: boolean
  requiresEffectiveOverrideNote: boolean
  riskEnabled: boolean
  segmentWeightedMultiple: number | null
  yearKeys: string[]
  years: number[]
}

export function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function clampDiscountWeight(value: unknown): number {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return 1
  return Math.min(2, Math.max(0, Math.round(numeric * 100) / 100))
}

export function clampDiscountFloorFactor(value: unknown): number {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return 0.45
  return Math.min(1, Math.max(0, Math.round(numeric * 100) / 100))
}

export function normalizeMultipleTypeWeight(value: unknown, fallback: number): number {
  const numeric = toFiniteNumber(value)
  if (numeric == null) return fallback
  const percent = Math.abs(numeric) <= 1.5 ? numeric * 100 : numeric
  return Math.min(100, Math.max(0, Math.round(percent)))
}

export function normalizeMultipleTypeWeights(
  weights: Record<string, number> | undefined
): Record<MultipleTypeKey, number> {
  const hasAdvisorWeights = !!weights && Object.keys(weights).length > 0
  const raw: Record<MultipleTypeKey, number> = {
    ev_ebitda: normalizeMultipleTypeWeight(weights?.ev_ebitda, hasAdvisorWeights ? 0 : 60),
    ev_revenue: normalizeMultipleTypeWeight(weights?.ev_revenue, hasAdvisorWeights ? 0 : 30),
    pe: normalizeMultipleTypeWeight(weights?.pe, hasAdvisorWeights ? 0 : 10),
  }
  const total = raw.ev_ebitda + raw.ev_revenue + raw.pe
  if (total === 100) return raw
  if (total <= 0) return { ev_ebitda: 60, ev_revenue: 30, pe: 10 }

  const evEbitda = Math.round((raw.ev_ebitda / total) * 100)
  const evRevenue = Math.round((raw.ev_revenue / total) * 100)
  return {
    ev_ebitda: evEbitda,
    ev_revenue: evRevenue,
    pe: Math.max(0, 100 - evEbitda - evRevenue),
  }
}

export function sortedDistinctYears(years: number[]): number[] {
  return Array.from(new Set(years.filter((year) => Number.isFinite(year)))).sort((a, b) => a - b)
}

function deriveDiscountWeights(
  weights?: Record<string, number>
): Record<AdvisorDiscountKey, number> {
  const out: Record<AdvisorDiscountKey, number> = {
    size_discount: 1,
    liquidity_discount: 1,
    country_adjustment: 1,
    growth_premium: 1,
    owner_concentration: 1,
  }
  for (const row of ADVISOR_DISCOUNT_ROWS) {
    out[row.key] = clampDiscountWeight(weights?.[row.key])
  }
  return out
}

function deriveRawHistoricalWeights({
  historicalEbitdaWeights,
  yearKeys,
  years,
}: {
  historicalEbitdaWeights?: Record<number, number>
  yearKeys: string[]
  years: number[]
}): Record<string, number> {
  const out: Record<string, number> = {}
  const fallback = equalWeightsFor(yearKeys)
  for (const year of years) {
    const existing = historicalEbitdaWeights?.[year]
    out[String(year)] = Number.isFinite(Number(existing))
      ? Number(existing)
      : fallback[String(year)]
  }
  return normalizeRemainderWeights(yearKeys, out)
}

function deriveLivePreview({
  previewBaselineMultiple,
  previewEffectiveMultiple,
  previewEbitdaBasis,
}: {
  previewBaselineMultiple: number | null
  previewEffectiveMultiple: number | null
  previewEbitdaBasis: number | null
}): AdvancedAdvisorLivePreview | null {
  if (
    previewBaselineMultiple == null ||
    previewEffectiveMultiple == null ||
    previewEbitdaBasis == null
  ) {
    return null
  }
  const beforeValue = previewBaselineMultiple * previewEbitdaBasis
  const afterValue = previewEffectiveMultiple * previewEbitdaBasis
  const deltaValue = afterValue - beforeValue
  const deltaPercent = beforeValue === 0 ? null : (deltaValue / beforeValue) * 100
  const maxValue = Math.max(Math.abs(beforeValue), Math.abs(afterValue), 1)

  return {
    afterMultiple: previewEffectiveMultiple,
    afterValue,
    afterWidth: `${Math.max(8, Math.min(100, (Math.abs(afterValue) / maxValue) * 100))}%`,
    beforeMultiple: previewBaselineMultiple,
    beforeValue,
    beforeWidth: `${Math.max(8, Math.min(100, (Math.abs(beforeValue) / maxValue) * 100))}%`,
    deltaPercent,
    deltaValue,
  }
}

function deriveActivePreviewChangeKeys({
  adjustment,
  discountWeights,
  effectiveMultipleOverride,
  floorFactor,
  hasSegmentBlend,
  mode,
  multipleBlendWeights,
  riskEnabled,
}: {
  adjustment: number
  discountWeights: Record<AdvisorDiscountKey, number>
  effectiveMultipleOverride?: number
  floorFactor: number
  hasSegmentBlend: boolean
  mode: WeightingMode
  multipleBlendWeights: Record<MultipleTypeKey, number>
  riskEnabled: boolean
}): ActivePreviewChangeKey[] {
  const changes: ActivePreviewChangeKey[] = []
  if (adjustment !== 0) changes.push('livePreviewMultiplePremium')
  if (effectiveMultipleOverride != null) changes.push('livePreviewEffectiveOverride')
  if (hasSegmentBlend) changes.push('livePreviewSegmentWeights')
  if (MULTIPLE_TYPE_ROWS.some((row) => multipleBlendWeights[row.key] !== row.defaultWeight)) {
    changes.push('livePreviewMultipleBlend')
  }
  if (!riskEnabled) changes.push('livePreviewRiskOff')
  if (ADVISOR_DISCOUNT_ROWS.some((row) => discountWeights[row.key] !== 1)) {
    changes.push('livePreviewDiscountWeights')
  }
  if (floorFactor !== 0.45) changes.push('livePreviewDiscountFloor')
  if (mode === 'weighted') changes.push('livePreviewHistoricalWeights')
  return changes
}

export function deriveAdvancedAdvisorControlModel({
  advisorDiscountWeights,
  businessTypeSegments,
  discountFloorFactor,
  effectiveMultipleOverride,
  effectiveMultipleOverrideNote,
  historicalEbitdaWeights,
  historicalEbitdaWeightingMode,
  historicalYears,
  multipleCalibrationAdjustment,
  multipleCalibrationNote,
  multipleTypeWeights,
  previewEbitda,
  riskAnalysisEnabled,
  sectorAverageMultiple,
}: AdvancedAdvisorControlModelInput): AdvancedAdvisorControlModel {
  const years = sortedDistinctYears(historicalYears).slice(-5)
  const yearKeys = years.map(String)
  const mode = historicalEbitdaWeightingMode ?? 'standard'
  const canWeight = years.length >= 3
  const multipleBlendWeights = normalizeMultipleTypeWeights(multipleTypeWeights)
  const riskEnabled = riskAnalysisEnabled ?? true
  const floorFactor = clampDiscountFloorFactor(discountFloorFactor)
  const discountWeights = deriveDiscountWeights(advisorDiscountWeights)
  const rawWeights = deriveRawHistoricalWeights({ historicalEbitdaWeights, yearKeys, years })
  const adjustment = multipleCalibrationAdjustment ?? 0
  const calibratedMultiple =
    sectorAverageMultiple != null && Number.isFinite(sectorAverageMultiple)
      ? sectorAverageMultiple + adjustment
      : null
  const previewBaselineMultiple =
    sectorAverageMultiple != null &&
    Number.isFinite(sectorAverageMultiple) &&
    sectorAverageMultiple > 0
      ? sectorAverageMultiple
      : null
  const segmentWeightedMultiple = computeSegmentWeightedMultiple(businessTypeSegments)
  const hasSegmentBlend = segmentWeightedMultiple != null
  const explicitOverride = toFiniteNumber(effectiveMultipleOverride)
  const previewEffectiveMultiple =
    explicitOverride != null && explicitOverride > 0
      ? explicitOverride
      : segmentWeightedMultiple != null
        ? adjustment !== 0
          ? segmentWeightedMultiple + adjustment
          : segmentWeightedMultiple
        : calibratedMultiple != null && calibratedMultiple > 0
          ? calibratedMultiple
          : null
  const previewEbitdaNumber = toFiniteNumber(previewEbitda)
  const previewEbitdaBasis =
    previewEbitdaNumber != null && previewEbitdaNumber > 0 ? previewEbitdaNumber : null
  const livePreview = deriveLivePreview({
    previewBaselineMultiple,
    previewEffectiveMultiple,
    previewEbitdaBasis,
  })
  const activePreviewChangeKeys = deriveActivePreviewChangeKeys({
    adjustment,
    discountWeights,
    effectiveMultipleOverride,
    floorFactor,
    hasSegmentBlend,
    mode,
    multipleBlendWeights,
    riskEnabled,
  })
  const requiresCalibrationNote = adjustment !== 0
  const noteComplete = !requiresCalibrationNote || Boolean(multipleCalibrationNote?.trim())
  const requiresEffectiveOverrideNote = effectiveMultipleOverride != null
  const effectiveOverrideNoteComplete =
    !requiresEffectiveOverrideNote || Boolean(effectiveMultipleOverrideNote?.trim())
  const complete =
    noteComplete &&
    effectiveOverrideNoteComplete &&
    (mode !== 'weighted' || !canWeight || years.length >= 3)

  return {
    activePreviewChangeKeys,
    adjustment,
    calibratedMultiple,
    canWeight,
    complete,
    discountWeights,
    effectiveOverrideNoteComplete,
    floorFactor,
    hasSegmentBlend,
    livePreview,
    mode,
    multipleBlendWeights,
    noteComplete,
    previewBaselineMultiple,
    previewEbitdaBasis,
    previewEffectiveMultiple,
    rawWeights,
    requiresCalibrationNote,
    requiresEffectiveOverrideNote,
    riskEnabled,
    segmentWeightedMultiple,
    yearKeys,
    years,
  }
}
