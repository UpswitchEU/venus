import { AuroraFullWidthField } from '../../../design-system/components'
import { SegmentWeightingPanel } from '../../calculator/sections/SegmentWeightingPanel'
import type { BusinessTypeSegmentInput } from '../../../types/valuation'

interface BasicInformationSegmentWeightingPanelProps {
  segments: BusinessTypeSegmentInput[]
  onChange: (segments: BusinessTypeSegmentInput[]) => void
}

/**
 * ValuationForm wrapper around the shared {@link SegmentWeightingPanel}. Adapts
 * the panel's "full weight array" callback onto this form's whole-array
 * onChange contract. All layout/behaviour lives in the shared panel.
 */
export function BasicInformationSegmentWeightingPanel({
  segments,
  onChange,
}: BasicInformationSegmentWeightingPanelProps) {
  if (segments.length <= 1) return null

  const handleWeightsChange = (weights: number[]) => {
    onChange(
      segments.map((segment, index) => ({
        ...segment,
        weight: weights[index] ?? segment.weight ?? null,
      }))
    )
  }

  return (
    <AuroraFullWidthField>
      <SegmentWeightingPanel segments={segments} onWeightsChange={handleWeightsChange} />
    </AuroraFullWidthField>
  )
}
