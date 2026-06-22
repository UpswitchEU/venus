import type {
  CustomAdjustment,
  EbitdaNormalization,
  GetNormalizationResponse,
  MarketRateSuggestion,
  MarketRatesResponse,
  NormalizationAdjustment,
} from '../types/ebitdaNormalization'
import { NormalizationCategory } from '../types/ebitdaNormalization'
import { dateLikeToUnixMs } from '../utils/date-like'

const DEFAULT_CONFLICT_RETRY_DELAYS_MS = [100, 230]

export function safeNormalizationNumber(n: number | undefined | null): number {
  return Number.isFinite(n) ? (n as number) : 0
}

export function nextPendingNormalizationSaveCount(currentCount: number, delta: 1 | -1): number {
  const safeCurrent = Number.isFinite(currentCount) ? Math.max(0, currentCount) : 0
  return Math.max(0, safeCurrent + delta)
}

export function isNormalizationSaveInFlight(pendingCount: number): boolean {
  return Number.isFinite(pendingCount) && pendingCount > 0
}

export async function runWithNormalizationConflictRetry<T>(
  operation: () => Promise<T>,
  options: {
    retryDelaysMs?: number[]
    sleep?: (delayMs: number) => Promise<void>
  } = {}
): Promise<T> {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_CONFLICT_RETRY_DELAYS_MS
  const sleep = options.sleep ?? ((delayMs: number) => new Promise((r) => setTimeout(r, delayMs)))
  let lastError: unknown

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const shouldRetry =
        getNormalizationErrorStatus(error) === 409 && attempt < retryDelaysMs.length
      if (!shouldRetry) break
      await sleep(retryDelaysMs[attempt])
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Normalization mutation failed')
}

function getNormalizationErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null
  const status = (error as { status: unknown }).status
  return typeof status === 'number' ? status : null
}

function sumStandardAdjustments(adjustments: NormalizationAdjustment[] | undefined): number {
  return (adjustments || []).reduce((sum, adj) => sum + safeNormalizationNumber(adj.amount), 0)
}

function sumCustomAdjustments(adjustments: CustomAdjustment[] | undefined): number {
  return (adjustments || []).reduce((sum, adj) => sum + safeNormalizationNumber(adj.amount), 0)
}

export function recalculateEbitdaNormalization(
  normalization: EbitdaNormalization,
  patch: Partial<Pick<EbitdaNormalization, 'adjustments' | 'custom_adjustments'>> = {}
): EbitdaNormalization {
  const adjustments = patch.adjustments ?? normalization.adjustments
  const customAdjustments = patch.custom_adjustments ?? normalization.custom_adjustments ?? []
  const totalAdjustments =
    sumStandardAdjustments(adjustments) + sumCustomAdjustments(customAdjustments)
  const reported = safeNormalizationNumber(normalization.reported_ebitda)

  return {
    ...normalization,
    ...patch,
    adjustments,
    custom_adjustments: customAdjustments,
    total_adjustments: totalAdjustments,
    normalized_ebitda: reported + totalAdjustments,
  }
}

export function createEbitdaNormalizationTemplate({
  sessionId,
  year,
  reportedEbitda,
}: {
  sessionId: string
  year: number
  reportedEbitda: number
}): EbitdaNormalization {
  const safeReported = safeNormalizationNumber(reportedEbitda)
  return {
    session_id: sessionId,
    year,
    reported_ebitda: safeReported,
    adjustments: [],
    custom_adjustments: [],
    total_adjustments: 0,
    normalized_ebitda: safeReported,
    confidence_score: 'medium',
  }
}

export function isVirginEbitdaNormalization(
  normalization: EbitdaNormalization | undefined
): boolean {
  return (
    !!normalization &&
    !normalization.id &&
    (normalization.adjustments?.length ?? 0) === 0 &&
    (normalization.custom_adjustments?.length ?? 0) === 0
  )
}

export function mergeLoadedEbitdaNormalizations(
  current: Record<number, EbitdaNormalization>,
  loaded: Record<number, EbitdaNormalization>
): Record<number, EbitdaNormalization> {
  const next = { ...current }

  for (const [rawYear, incoming] of Object.entries(loaded)) {
    const year = Number(rawYear)
    const existing = next[year]
    if (!existing || isVirginEbitdaNormalization(existing)) {
      next[year] = incoming
    }
  }

  return next
}

export function upsertStandardAdjustment(
  normalization: EbitdaNormalization,
  category: NormalizationCategory,
  amount: number,
  note?: string
): EbitdaNormalization {
  const safeAmount = safeNormalizationNumber(amount)
  const existingAdjustmentIndex = normalization.adjustments.findIndex(
    (adj) => adj.category === category
  )
  const nextAdjustment = { category, amount: safeAmount, note }
  const updatedAdjustments =
    existingAdjustmentIndex >= 0
      ? normalization.adjustments.map((adjustment, index) =>
          index === existingAdjustmentIndex ? nextAdjustment : adjustment
        )
      : [...normalization.adjustments, nextAdjustment]

  return recalculateEbitdaNormalization(normalization, {
    adjustments: updatedAdjustments.filter((adj) => adj.amount !== 0 || adj.note),
  })
}

export function addCustomAdjustmentToNormalization(
  normalization: EbitdaNormalization,
  customAdjustment: CustomAdjustment
): EbitdaNormalization {
  const updatedCustom = [
    ...(normalization.custom_adjustments || []),
    {
      ...customAdjustment,
      amount: safeNormalizationNumber(customAdjustment.amount),
    },
  ]

  return recalculateEbitdaNormalization(normalization, { custom_adjustments: updatedCustom })
}

export function updateCustomAdjustmentInNormalization(
  normalization: EbitdaNormalization,
  customId: string,
  customAdjustment: Pick<CustomAdjustment, 'description' | 'amount' | 'note'>
): EbitdaNormalization {
  const updatedCustom = (normalization.custom_adjustments || []).map((custom) =>
    custom.id === customId
      ? {
          ...custom,
          description: customAdjustment.description,
          amount: safeNormalizationNumber(customAdjustment.amount),
          note: customAdjustment.note,
        }
      : custom
  )

  return recalculateEbitdaNormalization(normalization, { custom_adjustments: updatedCustom })
}

export function removeCustomAdjustmentFromNormalization(
  normalization: EbitdaNormalization,
  customId: string
): EbitdaNormalization {
  return recalculateEbitdaNormalization(normalization, {
    custom_adjustments: (normalization.custom_adjustments || []).filter(
      (custom) => custom.id !== customId
    ),
  })
}

export function normalizeEbitdaNormalizationResponse(
  response: GetNormalizationResponse,
  sessionId: string
): EbitdaNormalization {
  return {
    id: response.id,
    session_id: sessionId,
    version_id: response.version_id,
    year: response.year,
    reported_ebitda: safeNormalizationNumber(response.reported_ebitda),
    adjustments: response.adjustments || [],
    custom_adjustments: response.custom_adjustments || [],
    total_adjustments: safeNormalizationNumber(response.total_adjustments),
    normalized_ebitda: safeNormalizationNumber(response.normalized_ebitda),
    confidence_score: response.confidence_score,
    market_rate_source: response.market_rate_source || undefined,
    created_at: response.created_at,
    updated_at: response.updated_at,
  }
}

export function deriveMarketRateSuggestions(
  response: MarketRatesResponse,
  industry: string,
  revenue: number
): MarketRateSuggestion[] {
  const safeRevenue = safeNormalizationNumber(revenue)
  const suggestions: MarketRateSuggestion[] = []

  if (response.owner_compensation_market_rate) {
    suggestions.push({
      category: NormalizationCategory.OWNER_COMPENSATION,
      suggested_amount: response.owner_compensation_market_rate,
      market_rate_50th_percentile: response.owner_compensation_percentile_50,
      market_rate_75th_percentile: response.owner_compensation_percentile_75,
      rationale: `Market rate for CEO/owner in ${industry} with €${(safeRevenue / 1000).toFixed(0)}k revenue`,
      confidence: response.confidence,
      source: response.source,
    })
  }

  if (safeRevenue > 0 && Number.isFinite(response.personal_expenses_suggested_percentage)) {
    const pct = safeNormalizationNumber(response.personal_expenses_suggested_percentage)
    suggestions.push({
      category: NormalizationCategory.PERSONAL_EXPENSES,
      suggested_amount: Math.round((safeRevenue * pct) / 100),
      suggested_percentage: pct,
      rationale: `Typical personal expenses: ${pct}% of revenue`,
      confidence: response.confidence,
      source: response.source,
    })
  }

  if (safeRevenue > 0 && Number.isFinite(response.discretionary_expenses_suggested_percentage)) {
    const pct = safeNormalizationNumber(response.discretionary_expenses_suggested_percentage)
    suggestions.push({
      category: NormalizationCategory.DISCRETIONARY_EXPENSES,
      suggested_amount: Math.round((safeRevenue * pct) / 100),
      suggested_percentage: pct,
      rationale: `Typical discretionary expenses: ${pct}% of revenue`,
      confidence: response.confidence,
      source: response.source,
    })
  }

  return suggestions
}

export function getEbitdaNormalizationTotalAdjustments(
  normalization: EbitdaNormalization | undefined
): number {
  return safeNormalizationNumber(normalization?.total_adjustments)
}

export function getEbitdaNormalizationNormalizedEbitda(
  normalization: EbitdaNormalization | undefined
): number {
  return safeNormalizationNumber(normalization?.normalized_ebitda)
}

export function hasEbitdaNormalization(normalization: EbitdaNormalization | undefined): boolean {
  return !!normalization && (normalization.adjustments.length > 0 || !!normalization.id)
}

export function getEbitdaNormalizationAdjustmentPercentage(
  normalization: EbitdaNormalization | undefined
): number {
  const reported = safeNormalizationNumber(normalization?.reported_ebitda)
  if (!normalization || reported === 0) return 0
  return (safeNormalizationNumber(normalization.total_adjustments) / reported) * 100
}

export function getEbitdaNormalizationAdjustmentCount(
  normalization: EbitdaNormalization | undefined
): number {
  if (!normalization) return 0
  const standardCount = normalization.adjustments.filter(
    (adjustment) => safeNormalizationNumber(adjustment.amount) !== 0
  ).length
  const customCount = normalization.custom_adjustments?.length || 0
  return standardCount + customCount
}

export function getEbitdaNormalizationLastUpdated(
  normalization: EbitdaNormalization | undefined,
  fallback = new Date()
): Date {
  const timestamp = normalization?.updated_at || normalization?.created_at
  if (!timestamp) return fallback
  const ms = dateLikeToUnixMs(timestamp)
  return ms !== null ? new Date(ms) : fallback
}
