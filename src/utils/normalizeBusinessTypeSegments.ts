import type { BusinessTypeSegmentInput } from '../types/valuation'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { parseFlexibleNumber } from './isFiniteNumeric'

function toFiniteNumber(value: unknown): number | null {
  return parseFlexibleNumber(value) ?? null
}

export function normalizeBusinessTypeSegments(
  segments: BusinessTypeSegmentInput[] | undefined
): BusinessTypeSegmentInput[] {
  if (!Array.isArray(segments) || segments.length <= 1) return []

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
