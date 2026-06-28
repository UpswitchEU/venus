'use client'

/**
 * SegmentWeightingPanel
 *
 * The single, shared "Segment weighting" surface for companies that span
 * more than one business type. Replaces three drifted copies (the inline
 * block in CompanyIdentificationSection, BasicInformationSegmentWeightingPanel
 * and the startup-studio BusinessTypeSegmentWeightingEditor).
 *
 * Design contract:
 *  • Each segment shows its benchmark multiple as a read-only, basis-labelled
 *    chip (EV/EBITDA 3.5×) — the number comes from the Delphi KMO index, not
 *    the user, so it is never an editable field here.
 *  • Weight is the one lever, driven by a slider that matches the
 *    "combine valuation methods" UI (SynthesisWeightingSection). Moving one
 *    slider rebalances the rest so the weights always total 100%.
 *  • A derived "blended multiple" readout (Σ weightᵢ × multipleᵢ) gives the
 *    advisor instant feedback on the blend the engine will apply to EBITDA.
 *  • There is no per-segment earnings input — the simplified panel uses the
 *    weighted-blend path (total EBITDA from the financial-history fields ×
 *    blended multiple). See project memory for the engine rationale.
 */

import { Info, Scale } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from '../../../design-system/components/Tooltip'
import { cn } from '../../../design-system/utils'
import type { BusinessTypeSegmentInput } from '../../../types/valuation'
import {
  blendedSegmentMultiple,
  rebalanceSegmentWeights,
  resolveSegmentWeightRows,
  totalSegmentWeight,
} from './segmentWeightingModel'

export interface SegmentWeightingPanelProps {
  segments: BusinessTypeSegmentInput[]
  /** Receives the full, rebalanced weight array (always sums to 100). */
  onWeightsChange: (weights: number[]) => void
  /** When true, each segment shows an editable multiple input (override benchmark). */
  allowMultipleOverride?: boolean
  /** Called when the user edits a segment's multiple. Empty string clears the override. */
  onMultipleChange?: (index: number, multiple: string) => void
  title?: string
  disabled?: boolean
  className?: string
}

function MultipleSourceTooltip() {
  return (
    <div className="max-w-[260px] space-y-2">
      <p className="text-xs font-semibold leading-snug text-background">
        How is the multiple determined?
      </p>
      <p className="text-xs leading-relaxed text-background/75">
        Multiples come from the Upswitch index, built from real SME transactions in Belgium and the
        Netherlands, adjusted for sector and size.
      </p>
      <div className="space-y-1 border-t border-background/20 pt-2 text-[11px] leading-relaxed text-background/60">
        <div>
          <span className="font-medium text-background/80">Source:</span> Upswitch index
        </div>
        <div>
          <span className="font-medium text-background/80">Range:</span> p25 / median / p75 band per
          sector
        </div>
        <div>
          <span className="font-medium text-background/80">Basis:</span> EV/EBITDA or EV/SDE
          depending on the business type
        </div>
      </div>
      <p className="border-t border-background/20 pt-2 text-[11px] leading-relaxed text-background/60">
        These are the sector benchmarks. Businesses with above-average margins earn a quality premium,
        so the multiple applied in the report can sit above the benchmark shown here.
      </p>
      <a
        href="https://index.upswitch.app/en/markets/business-types"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-background underline underline-offset-2 transition-colors hover:text-background/75"
      >
        View the Upswitch index
      </a>
    </div>
  )
}

function WeightSlider({
  value,
  disabled,
  label,
  onChange,
}: {
  value: number
  disabled?: boolean
  label: string
  onChange: (value: number) => void
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className={cn(
        'h-2 w-full flex-1 cursor-pointer appearance-none rounded-full',
        'bg-foreground/[0.06]',
        '[&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary',
        '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background',
        '[&::-webkit-slider-thumb]:shadow-sm',
        '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
        '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
        '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary',
        '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      style={{
        background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${value}%, hsl(var(--foreground) / 0.06) ${value}%, hsl(var(--foreground) / 0.06) 100%)`,
      }}
      aria-label={`${label} weight`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
    />
  )
}

export function SegmentWeightingPanel({
  segments,
  onWeightsChange,
  allowMultipleOverride,
  onMultipleChange,
  title,
  disabled,
  className,
}: SegmentWeightingPanelProps) {
  const displayTitle =
    title ?? (allowMultipleOverride ? 'Weights & multiples' : 'Segment weighting')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const cancelBlurRef = useRef(false)

  const rows = resolveSegmentWeightRows(segments)
  const total = totalSegmentWeight(rows)
  const blended = blendedSegmentMultiple(rows)

  useEffect(() => {
    if (disabled) setEditingIndex(null)
  }, [disabled])

  const commitWeight = useCallback(
    (index: number, nextValue: number) => {
      const current = resolveSegmentWeightRows(segments).map((row) => row.weight)
      onWeightsChange(rebalanceSegmentWeights(current, index, nextValue))
    },
    [segments, onWeightsChange]
  )

  const commitDraft = useCallback(
    (index: number, raw: string) => {
      const digits = raw.replace(/[^0-9]/g, '').slice(0, 3)
      if (digits === '') return
      const parsed = Number.parseInt(digits, 10)
      if (Number.isNaN(parsed)) return
      commitWeight(index, parsed)
    },
    [commitWeight]
  )

  if (segments.length <= 1) return null

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-foreground/[0.10] bg-foreground/[0.03]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{displayTitle}</span>
        <Tooltip
          content={<MultipleSourceTooltip />}
          side="top"
          align="end"
          sideOffset={8}
          className="!rounded-xl !px-3 !py-3"
        >
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground/35 transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground/70"
            aria-label="How the multiple is determined"
          >
            <Info className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      {/* Segment rows */}
      {rows.map((row, index) => (
        <div key={row.key} className="space-y-2 border-t border-foreground/[0.08] px-4 py-4">
          {/* Identity + multiple (chip or editable) + weight readout */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
              {allowMultipleOverride && (row.multiple != null || row.benchmarkMultiple != null) ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {row.multipleLabel && (
                    <span className="text-[11px] text-foreground/40">{row.multipleLabel}</span>
                  )}
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={(row.benchmarkMultiple ?? row.multiple)?.toFixed(1)}
                      value={row.overrideMultiple != null ? String(row.overrideMultiple) : ''}
                      onChange={(e) =>
                        onMultipleChange?.(index, e.target.value.replace(/[^0-9.]/g, ''))
                      }
                      disabled={disabled}
                      aria-label={`${row.title} multiple`}
                      className={cn(
                        'w-14 rounded-lg border border-foreground/[0.10] bg-foreground/[0.04]',
                        'py-1 pl-2 pr-5 text-right text-xs font-mono tabular-nums text-foreground/80',
                        'outline-none transition-colors',
                        'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
                        'placeholder:text-foreground/30',
                        disabled && 'cursor-not-allowed opacity-50'
                      )}
                    />
                    <span
                      className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-foreground/45"
                      aria-hidden
                    >
                      ×
                    </span>
                  </div>
                </div>
              ) : (
                row.multiple != null && (
                  <Tooltip
                    content="Benchmark multiple from the Upswitch index"
                    side="top"
                    sideOffset={6}
                  >
                    <span className="shrink-0 cursor-help select-none rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs tabular-nums text-primary">
                      {row.multipleLabel ? `${row.multipleLabel} ` : ''}
                      {row.multiple.toFixed(1)}×
                    </span>
                  </Tooltip>
                )
              )}
            </div>
            <div className="relative shrink-0">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={disabled}
                value={editingIndex === index ? draft : String(row.weight)}
                onFocus={(e) => {
                  if (disabled) return
                  setEditingIndex(index)
                  setDraft(String(row.weight))
                  requestAnimationFrame(() => e.currentTarget.select())
                }}
                onChange={(e) => {
                  if (editingIndex !== index) return
                  setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))
                }}
                onBlur={(e) => {
                  if (cancelBlurRef.current) {
                    cancelBlurRef.current = false
                    return
                  }
                  if (editingIndex !== index) return
                  setEditingIndex(null)
                  commitDraft(index, e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelBlurRef.current = true
                    setEditingIndex(null)
                    e.currentTarget.blur()
                  }
                }}
                aria-label={`${row.title} weight`}
                className={cn(
                  'w-[3.75rem] min-w-[3.75rem] rounded-lg border border-foreground/[0.10] bg-foreground/[0.04]',
                  'py-1 pl-2 pr-6 text-right text-sm font-semibold tabular-nums text-foreground/80',
                  'outline-none transition-colors',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              />
              <span
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-foreground/45"
                aria-hidden
              >
                %
              </span>
            </div>
          </div>
          <WeightSlider
            value={row.weight}
            disabled={disabled}
            label={row.title}
            onChange={(value) => commitWeight(index, value)}
          />
        </div>
      ))}

      {/* Footer: total warning + blended multiple */}
      {(total !== 100 || blended != null) && (
        <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.08] px-4 py-3">
          {total !== 100 ? (
            <span className="text-xs font-medium text-destructive">
              Weights must total 100% (currently {total}%)
            </span>
          ) : (
            <span className="text-[11px] text-foreground/45">
              Weighted across {rows.length} segments
            </span>
          )}
          {blended != null && (
            <span className="flex items-center gap-1.5 text-xs text-foreground/55">
              <Scale className="h-3.5 w-3.5 text-foreground/40" />
              Blended
              <span className="font-mono font-semibold tabular-nums text-foreground/80">
                {blended.toFixed(1)}×
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
