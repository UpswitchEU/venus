import {
  type DossierSignal,
  detectDossierSignal,
  SUGGESTED_DELTA_BAND,
  type SuggestedBand,
} from '../../store/manual/preparerCalibrationSuggestions'
import {
  clientShouldWarnExtremeMultiple,
  type PreparerEbitdaReasonKey,
} from '../../store/manual/usePreparerMultipleStore'
import type { MultiplePipelineStage, ValuationResponse, WaterfallStep } from '../../types/valuation'
import { toNumberOrNull } from './ValuationEditModalFormatting'

export type PreparerConfidenceKey =
  | 'confidenceHigh'
  | 'confidenceMedium'
  | 'confidenceLow'
  | 'confidenceDefault'

export interface EngineDiscountStep {
  name: string
  pct: number
}

export interface ExtremeBoundInfoModel {
  directionKey: 'extremeWarningAbove' | 'extremeWarningBelow'
  directionLabelKey: 'extremeWarningDirAboveLabel' | 'extremeWarningDirBelowLabel'
  bound: 'p90' | 'p10'
  boundValue: string
}

export interface LivePreviewModel {
  benchmark: string
  applied: string
  delta: string
  adjustment: 'premium' | 'discount'
  reasonKey: PreparerEbitdaReasonKey
  note: string | null
}

export interface ValuationEditPreparerModel {
  mv: ValuationResponse['multiples_valuation'] | undefined
  appliedNum: number | null
  benchmarkNum: number | null
  prepDeltaNum: number | null
  showExtreme: boolean
  bench: number
  sliderMin: number
  sliderMax: number
  extremeBoundInfo: ExtremeBoundInfoModel | null
  engineDiscountSteps: EngineDiscountStep[]
  dossierSignal: DossierSignal | null
  wasRestoredFromSave: boolean
  selectedReasonBand: SuggestedBand | null
  benchmarkContext: string | null
  confidenceKey: PreparerConfidenceKey
  hasPrepData: boolean
  nonEbitdaMethodSelected: boolean
  effectiveDisabled: boolean
  livePreview: LivePreviewModel | null
  savedPreview: string | null
  liveEquityPreview: number | null
  activeMetricValue: number | null
}

interface BuildValuationEditPreparerModelInput {
  result: ValuationResponse | null
  benchmarkMedian: number | null
  appliedMedian: number | null
  reasonKey: PreparerEbitdaReasonKey | ''
  note: string
  locale: string
  businessTypeLabel?: string
  industryLabel?: string
  countryCode?: string
  contextSeparator: string
  activeMethodValue: unknown
  selectedMethod: string
  preparerDisabled?: boolean
  isMethodPersisting: boolean
}

const PREVIEW_DELTA_THRESHOLD = 0.005
const TRIVIAL_ENGINE_DISCOUNT_PCT = 0.1
const DEFAULT_BENCHMARK_MULTIPLE = 5
const SLIDER_ROUNDING_FACTOR = 20

export function buildEngineDiscountSteps(result: ValuationResponse | null): EngineDiscountStep[] {
  const pipeline = result?.multiple_pipeline
  const raw: ReadonlyArray<WaterfallStep | MultiplePipelineStage> =
    pipeline?.discount_waterfall ?? pipeline?.stages ?? []

  return raw
    .map((row) => {
      const name = typeof row.step_name === 'string' ? row.step_name.trim() : ''
      const pct = typeof row.discount_percentage === 'number' ? row.discount_percentage : null
      return name && pct != null && Math.abs(pct) >= TRIVIAL_ENGINE_DISCOUNT_PCT
        ? { name, pct }
        : null
    })
    .filter((row): row is EngineDiscountStep => row !== null)
    .slice(0, 6)
}

export function buildBenchmarkContext({
  businessTypeLabel,
  industryLabel,
  countryCode,
  locale,
  contextSeparator,
}: Pick<
  BuildValuationEditPreparerModelInput,
  'businessTypeLabel' | 'industryLabel' | 'countryCode' | 'locale' | 'contextSeparator'
>): string | null {
  let regionName: string | null = null
  if (countryCode && countryCode.length === 2) {
    try {
      const displayLocale = locale === 'nl' ? 'nl-BE' : 'en-GB'
      regionName =
        new Intl.DisplayNames([displayLocale], { type: 'region' }).of(countryCode.toUpperCase()) ??
        null
    } catch {
      regionName = countryCode.toUpperCase()
    }
  }

  const contextSegments = [businessTypeLabel, industryLabel, regionName].filter(
    (segment): segment is string => typeof segment === 'string' && segment.trim().length > 0
  )
  return contextSegments.length > 0 ? contextSegments.join(contextSeparator) : null
}

export function getPreparerConfidenceKey(
  comparablesQuality?: string | null,
  confidence?: string | null
): PreparerConfidenceKey {
  const qualityRaw = `${comparablesQuality ?? ''} ${confidence ?? ''}`.toUpperCase()
  if (qualityRaw.includes('HIGH')) return 'confidenceHigh'
  if (qualityRaw.includes('MEDIUM') || qualityRaw.includes('MODERATE')) {
    return 'confidenceMedium'
  }
  if (qualityRaw.includes('LOW')) return 'confidenceLow'
  return 'confidenceDefault'
}

export function buildExtremeBoundInfo({
  appliedNum,
  mv,
  showExtreme,
}: {
  appliedNum: number | null
  mv: ValuationResponse['multiples_valuation'] | undefined
  showExtreme: boolean
}): ExtremeBoundInfoModel | null {
  if (!showExtreme || appliedNum == null) return null
  const hi =
    mv?.p90_ebitda_multiple != null && mv.p90_ebitda_multiple > 0
      ? mv.p90_ebitda_multiple
      : mv?.p75_ebitda_multiple
  const lo =
    mv?.p10_ebitda_multiple != null && mv.p10_ebitda_multiple > 0
      ? mv.p10_ebitda_multiple
      : mv?.p25_ebitda_multiple

  if (hi != null && appliedNum > hi) {
    return {
      directionKey: 'extremeWarningAbove',
      directionLabelKey: 'extremeWarningDirAboveLabel',
      bound: 'p90',
      boundValue: hi.toFixed(2),
    }
  }

  if (lo != null && appliedNum < lo) {
    return {
      directionKey: 'extremeWarningBelow',
      directionLabelKey: 'extremeWarningDirBelowLabel',
      bound: 'p10',
      boundValue: lo.toFixed(2),
    }
  }

  return null
}

function buildDossierSignal(
  result: ValuationResponse | null,
  mv: ValuationResponse['multiples_valuation'] | undefined,
  engineDiscountSteps: EngineDiscountStep[]
): DossierSignal | null {
  const resultRecord = (result ?? null) as Record<string, unknown> | null
  const recurringRevenuePercentage = toNumberOrNull(resultRecord?.recurring_revenue_percentage)
  const ownerConcentrationRisk =
    typeof mv?.owner_concentration?.risk_level === 'string'
      ? mv.owner_concentration.risk_level
      : null

  return detectDossierSignal({
    recurringRevenuePercentage,
    ownerConcentrationRisk,
    appliedWaterfallStepNames: engineDiscountSteps.map((step) => step.name),
  })
}

function buildLivePreviewModel({
  benchmarkNum,
  appliedNum,
  reasonKey,
  note,
}: {
  benchmarkNum: number | null
  appliedNum: number | null
  reasonKey: PreparerEbitdaReasonKey | ''
  note: string
}): LivePreviewModel | null {
  if (
    benchmarkNum == null ||
    appliedNum == null ||
    !reasonKey ||
    Math.abs(appliedNum - benchmarkNum) < PREVIEW_DELTA_THRESHOLD
  ) {
    return null
  }

  return {
    benchmark: benchmarkNum.toFixed(2),
    applied: appliedNum.toFixed(2),
    delta: Math.abs(appliedNum - benchmarkNum).toFixed(2),
    adjustment: appliedNum >= benchmarkNum ? 'premium' : 'discount',
    reasonKey,
    note: note.trim() || null,
  }
}

function getSavedPreview(result: ValuationResponse | null, locale: string): string | null {
  const savedSummary = result?.multiple_adjustment_summary
  return locale === 'nl'
    ? (savedSummary?.generated_footnote_nl ?? savedSummary?.generated_footnote ?? null)
    : (savedSummary?.generated_footnote_en ?? savedSummary?.generated_footnote ?? null)
}

export function buildValuationEditPreparerModel({
  result,
  benchmarkMedian,
  appliedMedian,
  reasonKey,
  note,
  locale,
  businessTypeLabel,
  industryLabel,
  countryCode,
  contextSeparator,
  activeMethodValue,
  selectedMethod,
  preparerDisabled,
  isMethodPersisting,
}: BuildValuationEditPreparerModelInput): ValuationEditPreparerModel {
  const mv = result?.multiples_valuation
  const normalizedBenchmarkMedian = toNumberOrNull(benchmarkMedian)
  const appliedNum = toNumberOrNull(appliedMedian)
  const benchmarkNum = normalizedBenchmarkMedian ?? toNumberOrNull(mv?.ebitda_multiple)
  const prepDeltaNum =
    appliedNum != null && benchmarkNum != null
      ? Math.round((appliedNum - benchmarkNum) * 100) / 100
      : null
  const showExtreme =
    appliedNum != null &&
    clientShouldWarnExtremeMultiple(
      appliedNum,
      mv?.p10_ebitda_multiple,
      mv?.p90_ebitda_multiple,
      normalizedBenchmarkMedian,
      mv?.p25_ebitda_multiple,
      mv?.p75_ebitda_multiple
    )
  const bench = benchmarkNum ?? DEFAULT_BENCHMARK_MULTIPLE
  const sliderMin = Math.max(
    0.5,
    Math.round(bench * 0.45 * SLIDER_ROUNDING_FACTOR) / SLIDER_ROUNDING_FACTOR
  )
  const sliderMax = Math.min(
    30,
    Math.round(bench * 2.2 * SLIDER_ROUNDING_FACTOR) / SLIDER_ROUNDING_FACTOR
  )
  const engineDiscountSteps = buildEngineDiscountSteps(result)
  const nonEbitdaMethodSelected =
    selectedMethod !== 'upswitch_adaptive' && selectedMethod !== 'ebitda_multiple'

  return {
    mv,
    appliedNum,
    benchmarkNum,
    prepDeltaNum,
    showExtreme,
    bench,
    sliderMin,
    sliderMax,
    extremeBoundInfo: buildExtremeBoundInfo({ appliedNum, mv, showExtreme }),
    engineDiscountSteps,
    dossierSignal: buildDossierSignal(result, mv, engineDiscountSteps),
    wasRestoredFromSave: Boolean(
      result?.multiple_adjustment_summary?.reason_key &&
        result.multiple_adjustment_summary.reason_key === reasonKey
    ),
    selectedReasonBand: reasonKey ? SUGGESTED_DELTA_BAND[reasonKey] : null,
    benchmarkContext: buildBenchmarkContext({
      businessTypeLabel,
      industryLabel,
      countryCode,
      locale,
      contextSeparator,
    }),
    confidenceKey: getPreparerConfidenceKey(mv?.comparables_quality, mv?.confidence),
    hasPrepData: mv?.ebitda_multiple != null || normalizedBenchmarkMedian != null,
    nonEbitdaMethodSelected,
    effectiveDisabled: Boolean(preparerDisabled || nonEbitdaMethodSelected || isMethodPersisting),
    livePreview: buildLivePreviewModel({ benchmarkNum, appliedNum, reasonKey, note }),
    savedPreview: getSavedPreview(result, locale),
    // The next monetary preview arrives from a ValuationIQ recalculation. Venus
    // never estimates EBITDA x multiple or the EV-to-equity bridge itself.
    liveEquityPreview: null,
    activeMetricValue: toNumberOrNull(activeMethodValue),
  }
}
