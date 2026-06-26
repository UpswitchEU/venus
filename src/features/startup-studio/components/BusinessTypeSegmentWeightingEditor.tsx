import { SegmentWeightingPanel } from '@/components/calculator/sections/SegmentWeightingPanel'
import type { BusinessTypeSegmentInput } from '@/types/valuation'

interface BusinessTypeSegmentWeightingEditorProps {
  segments: BusinessTypeSegmentInput[]
  /** Receives the full, rebalanced weight array (always sums to 100). */
  onWeightsChange: (weights: number[]) => void
}

/**
 * Studio-flow wrapper around the shared {@link SegmentWeightingPanel}. Kept as
 * a named component so the studio call-site reads intent-first; all layout and
 * behaviour live in the shared panel to avoid the sibling drift this surface
 * suffered previously.
 */
export function BusinessTypeSegmentWeightingEditor({
  segments,
  onWeightsChange,
}: BusinessTypeSegmentWeightingEditorProps) {
  return <SegmentWeightingPanel segments={segments} onWeightsChange={onWeightsChange} />
}
