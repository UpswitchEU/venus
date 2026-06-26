import type { ChangeEvent } from 'react'
import { AuroraFullWidthField, AuroraNumberInput } from '../../../design-system/components'
import type { BusinessTypeSegmentInput } from '../../../types/valuation'
import {
  type BusinessTypeSegmentEditableField,
  buildBusinessTypeSegmentRows,
  updateBusinessTypeSegmentField,
} from './BasicInformationSegmentsModel'

interface BasicInformationSegmentWeightingPanelProps {
  segments: BusinessTypeSegmentInput[]
  onChange: (segments: BusinessTypeSegmentInput[]) => void
}

export function BasicInformationSegmentWeightingPanel({
  segments,
  onChange,
}: BasicInformationSegmentWeightingPanelProps) {
  if (segments.length <= 1) return null

  const rows = buildBusinessTypeSegmentRows(segments)

  const updateSegment =
    (index: number, field: BusinessTypeSegmentEditableField) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(updateBusinessTypeSegmentField(segments, index, field, event.target.value))
    }

  return (
    <AuroraFullWidthField>
      <div className="rounded-xl border border-foreground/[0.10] bg-foreground/[0.03] p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">Segment weighting</div>
        <div className="space-y-3">
          {rows.map((row, index) => {
            const segment = segments[index]
            return (
              <div
                key={row.key}
                className="grid gap-3 border-t border-foreground/[0.08] pt-3 md:grid-cols-[minmax(0,1fr)_110px_200px]"
              >
                <div className="min-w-0 self-center">
                  <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
                  {row.basis && (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-foreground/60">
                      <span className="rounded-md bg-foreground/[0.06] px-2 py-1">{row.basis}</span>
                      {row.multiplePlaceholder !== 'Auto' && (
                        <span className="rounded-md bg-foreground/[0.06] px-2 py-1 tabular-nums">
                          {row.multiplePlaceholder}x
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <AuroraNumberInput
                  label="Weight"
                  placeholder="Auto"
                  name={`business_type_segments.${index}.weight`}
                  value={row.weightValue}
                  onChange={updateSegment(index, 'weight')}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  allowDecimals
                />
                <AuroraNumberInput
                  label={row.earningsLabel}
                  placeholder="0"
                  name={`business_type_segments.${index}.earnings`}
                  value={segment.earnings ?? ''}
                  onChange={updateSegment(index, 'earnings')}
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
    </AuroraFullWidthField>
  )
}
