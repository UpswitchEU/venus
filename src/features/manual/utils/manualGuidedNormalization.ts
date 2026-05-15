export interface ManualGuidedNormalizationUrl {
  spotlight?: string
  focusField?: string
  flagYear?: string
}

export interface ManualGuidedNormalizationPrefill {
  initialSearchQuery: string
  initialYearFilter: number | null
}

export interface ManualGuidedNormalizationPlan {
  storageKey: string
  prefill: ManualGuidedNormalizationPrefill
}

const MERCURY_GUIDED_NORMALIZATION_FIELD_HINTS: Record<string, string> = {
  owner_director_compensation: '620',
  personnel_costs: '62',
  rent_expense: '610',
  depreciation: '63',
  operating_expenses: '61',
}

export function buildManualGuidedNormalizationPlan({
  reportId,
  guidedResolutionUrl,
}: {
  reportId: string
  guidedResolutionUrl?: ManualGuidedNormalizationUrl | null
}): ManualGuidedNormalizationPlan | null {
  const focus = guidedResolutionUrl?.focusField?.trim()
  if (!focus) return null

  const rawYear = guidedResolutionUrl?.flagYear
  const yearParsed =
    rawYear != null && String(rawYear).length > 0
      ? Number.parseInt(String(rawYear), 10)
      : Number.NaN

  return {
    storageKey: `venus:guided-norm-handled:${reportId}:${focus}:${rawYear ?? ''}`,
    prefill: {
      initialSearchQuery: MERCURY_GUIDED_NORMALIZATION_FIELD_HINTS[focus] ?? '',
      initialYearFilter: Number.isFinite(yearParsed) ? yearParsed : null,
    },
  }
}
