import { AuroraNumberInput } from '@/design-system'
import type { BusinessTypeSegmentInput } from '@/types/valuation'

interface BusinessTypeSegmentWeightingEditorProps {
  segments: BusinessTypeSegmentInput[]
  onEarningsChange: (index: number, value: string) => void
  onWeightChange: (index: number, value: string) => void
}

export function BusinessTypeSegmentWeightingEditor({
  segments,
  onEarningsChange,
  onWeightChange,
}: BusinessTypeSegmentWeightingEditorProps) {
  if (segments.length <= 1) return null

  return (
    <div className="rounded-xl border border-foreground/[0.10] bg-foreground/[0.03] p-3">
      <div className="mb-2 text-xs font-semibold text-foreground">Segment weighting</div>
      <div className="space-y-3">
        {segments.map((segment, index) => {
          const basis = segment.basis ?? segment.earnings_basis
          const multiple =
            typeof segment.multiple === 'number' || typeof segment.multiple === 'string'
              ? segment.multiple
              : segment.applied_multiple
          const multipleNumber = Number(multiple)
          const weightValue =
            segment.weight != null ? segment.weight : Number((100 / segments.length).toFixed(2))

          return (
            <div
              key={`${segment.business_type_id}-${index}`}
              className="grid gap-3 border-t border-foreground/[0.08] pt-3 md:grid-cols-[minmax(0,1fr)_120px_180px]"
            >
              <div className="min-w-0 self-center">
                <div className="truncate text-sm font-medium text-foreground">
                  {segment.business_type_title ?? segment.business_type_id}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-foreground/60">
                  {basis && (
                    <span className="rounded-md bg-foreground/[0.06] px-2 py-1">{basis}</span>
                  )}
                  {Number.isFinite(multipleNumber) && (
                    <span className="rounded-md bg-foreground/[0.06] px-2 py-1">
                      {multipleNumber.toFixed(1)}x
                    </span>
                  )}
                </div>
              </div>
              <AuroraNumberInput
                label="Weight"
                placeholder="Auto"
                name={`business_type_segments.${index}.weight`}
                value={weightValue}
                onChange={(event) => onWeightChange(index, event.target.value)}
                min={0}
                max={100}
                step={5}
                suffix="%"
                allowDecimals
              />
              <AuroraNumberInput
                label={basis ? `${basis} earnings` : 'Segment earnings'}
                placeholder="0"
                name={`business_type_segments.${index}.earnings`}
                value={segment.earnings ?? ''}
                onChange={(event) => onEarningsChange(index, event.target.value)}
                min={0}
                step={1000}
                prefix="EUR"
                formatAsCurrency
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
