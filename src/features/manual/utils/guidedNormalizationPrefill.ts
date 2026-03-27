import {
  parseSpotlightDomId,
  type SpotlightImportQuality,
} from '../../../store/useSpotlightStore'

export interface GuidedNormalizationPrefill {
  initialSearchQuery: string
  initialYearFilter: number | null
}

const NORMALIZATION_FIELD_FALLBACKS: Record<string, string> = {
  owner_director_compensation: '620',
  personnel_costs: '62',
  rent_expense: '610',
  depreciation: '63',
  operating_expenses: '61',
}

const NORMALIZATION_FIELDS = new Set(Object.keys(NORMALIZATION_FIELD_FALLBACKS))

function parseYearOrNull(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function deriveGuidedNormalizationPrefill(args: {
  activeDomId: string | null
  importQuality: Record<string, SpotlightImportQuality> | null | undefined
}): GuidedNormalizationPrefill | null {
  const { activeDomId, importQuality } = args
  if (!activeDomId || !importQuality || Object.keys(importQuality).length === 0) {
    return null
  }

  const { field, yearKey } = parseSpotlightDomId(activeDomId)
  const candidateYears = yearKey
    ? [yearKey, ...Object.keys(importQuality).filter((candidate) => candidate !== yearKey)]
    : Object.keys(importQuality).sort((a, b) => Number(b) - Number(a))

  const matchedYearKey =
    candidateYears.find((candidateYear) => {
      const quality = importQuality[candidateYear]
      if (!quality) return false
      return (
        (quality.audit_flags ?? []).some((flag) => flag.field === field) ||
        (quality.ai_enrichment?.ledger_mappings ?? []).some(
          (mapping) => mapping.upswitch_field === field
        )
      )
    }) ?? yearKey ?? candidateYears[0]

  const matchedYear = matchedYearKey ? importQuality[matchedYearKey] : null
  const hasNormalizationHints =
    (matchedYear?.ai_enrichment?.normalization_hints?.length ?? 0) > 0
  const isNormalizationField = NORMALIZATION_FIELDS.has(field)

  if (!hasNormalizationHints && !isNormalizationField) {
    return null
  }

  const firstSourceAccount =
    matchedYear?.audit_flags
      ?.filter((flag) => flag.field === field && flag.severity !== 'info')
      .flatMap((flag) => flag.source_accounts ?? [])[0] ?? ''

  return {
    initialSearchQuery: firstSourceAccount || NORMALIZATION_FIELD_FALLBACKS[field] || '',
    initialYearFilter: parseYearOrNull(matchedYearKey ?? yearKey),
  }
}
