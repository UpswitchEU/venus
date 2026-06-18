import type { BusinessTypeSegmentInput } from '../types/valuation'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { parseFlexibleNumber } from './isFiniteNumeric'

function toFiniteNumber(value: unknown): number | null {
  return parseFlexibleNumber(value) ?? null
}

export function normalizeBusinessTypeSegments(
  segments: BusinessTypeSegmentInput[] | undefined
): BusinessTypeSegmentInput[] {
  if (!Array.isArray(segments) || segments.length === 0) return []

  return segments.flatMap((segment) => {
    const businessTypeId = normalizeBusinessTypeId(segment.business_type_id)
    if (!businessTypeId) return []

    const earnings = toFiniteNumber(segment.earnings)
    const multiple = toFiniteNumber(segment.multiple ?? segment.applied_multiple)
    const weight = toFiniteNumber(segment.weight)
    const basis = segment.basis ?? segment.earnings_basis

    return [
      {
        business_type_id: businessTypeId,
        ...(segment.business_type_title
          ? { business_type_title: segment.business_type_title }
          : {}),
        ...(segment.nace_code ? { nace_code: segment.nace_code } : {}),
        ...(basis ? { basis, earnings_basis: basis } : {}),
        ...(earnings != null ? { earnings } : {}),
        ...(multiple != null ? { multiple } : {}),
        ...(weight != null ? { weight } : {}),
      },
    ]
  })
}

export function businessTypeSegmentsFromWeights(value: unknown): BusinessTypeSegmentInput[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([businessTypeId, weight]) => {
      const normalizedId = normalizeBusinessTypeId(businessTypeId)
      if (!normalizedId) return []
      return [{ business_type_id: normalizedId, weight: weight == null ? null : String(weight) }]
    })
    .sort((a, b) => Number(b.weight ?? 0) - Number(a.weight ?? 0))
}

export function businessTypeWeightsFromSegments(
  segments: BusinessTypeSegmentInput[]
): Record<string, number | string | null | undefined> | undefined {
  if (!Array.isArray(segments) || segments.length === 0) return undefined

  return Object.fromEntries(
    segments.map((segment) => [
      segment.business_type_id,
      segment.weight ?? Number((100 / segments.length).toFixed(2)),
    ])
  )
}

export function resolveBusinessTypeSegments(input: {
  business_type_segments?: BusinessTypeSegmentInput[] | null
  business_type_mix?: BusinessTypeSegmentInput[] | null
  business_type_weights?: Record<string, number | string | null | undefined> | null
}): BusinessTypeSegmentInput[] {
  const segments = normalizeBusinessTypeSegments(input.business_type_segments ?? undefined)
  if (segments.length > 0) return segments

  const mix = normalizeBusinessTypeSegments(input.business_type_mix ?? undefined)
  if (mix.length > 0) return mix

  return normalizeBusinessTypeSegments(businessTypeSegmentsFromWeights(input.business_type_weights))
}
