import type { BusinessTypeSegmentInput } from '../../../types/valuation'

export type BusinessTypeSegmentEditableField = 'earnings' | 'multiple' | 'weight'

export interface BusinessTypeSegmentRowModel {
  key: string
  title: string
  basis?: BusinessTypeSegmentInput['basis'] | BusinessTypeSegmentInput['earnings_basis']
  earningsLabel: string
  multiplePlaceholder: string
  weightValue: string | number
}

export function updateBusinessTypeSegmentField(
  segments: readonly BusinessTypeSegmentInput[],
  index: number,
  field: BusinessTypeSegmentEditableField,
  value: string
): BusinessTypeSegmentInput[] {
  return segments.map((segment, segmentIndex) =>
    segmentIndex === index
      ? {
          ...segment,
          [field]: value.trim() ? value : null,
        }
      : segment
  )
}

export function buildBusinessTypeSegmentRows(
  segments: readonly BusinessTypeSegmentInput[]
): BusinessTypeSegmentRowModel[] {
  return segments.map((segment, index) => {
    const basis = segment.basis ?? segment.earnings_basis
    const multiple =
      typeof segment.multiple === 'number' || typeof segment.multiple === 'string'
        ? segment.multiple
        : segment.applied_multiple
    const multipleNumber = Number(multiple)

    return {
      key: `${segment.business_type_id}-${index}`,
      title: segment.business_type_title ?? segment.business_type_id,
      basis,
      earningsLabel: basis ? `${basis} earnings` : 'Segment earnings',
      multiplePlaceholder: Number.isFinite(multipleNumber) ? multipleNumber.toFixed(1) : 'Auto',
      weightValue: segment.weight ?? Number((100 / segments.length).toFixed(2)),
    }
  })
}
