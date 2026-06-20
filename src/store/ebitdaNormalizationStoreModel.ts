import type {
  CustomAdjustment,
  EbitdaNormalization,
  GetNormalizationResponse,
  NormalizationAdjustment,
  NormalizationCategory,
} from '../types/ebitdaNormalization'

export function safeNormalizationNumber(n: number | undefined | null): number {
  return Number.isFinite(n) ? (n as number) : 0
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
