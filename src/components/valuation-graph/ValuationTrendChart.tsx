'use client'

/**
 * ValuationTrendChart — the universal valuation graph, ported from Mercury.
 *
 * One chart for the value-over-fiscal-years curve (X = fiscal year, most recent
 * on the right) with a per-year confidence band and a hover tooltip. Purely
 * presentational: callers resolve their data to {@link ChartRow}[] (Venus does so
 * from the engine's `valuation_timeline` — see `valuation-timeline-rows.ts`).
 *
 * Unfailable by construction — it always renders something honest:
 *   • ≥ 2 rows  → the responsive, hoverable {@link ValuationVisxChart}
 *   • 1 row     → {@link SinglePointBaseline} (a dated point + range)
 *   • 0 rows    → the caller's `emptyState` (or a calm placeholder)
 *   • loading   → a skeleton that holds the height
 */

import { ParentSize } from '@visx/responsive'
import type { ReactNode } from 'react'
import { cn } from '@/design-system/utils'
import { LegendSwatch, SinglePointBaseline, ValuationVisxChart } from './ValuationGraphVisuals'
import type {
  ChartDateMode,
  ChartLabels,
  ChartRow,
  ValuationMilestoneMarker,
} from './valuation-graph-model'

export interface ValuationTrendChartProps {
  rows: ChartRow[]
  locale: string
  currency?: string | null
  labels: ChartLabels
  /** Optional market-event overlay (funding/exits). Empty ⇒ chart unchanged. */
  milestones?: ValuationMilestoneMarker[]
  /** True while the data source is still resolving — hold the height with a skeleton. */
  loading?: boolean
  /** Wrap in a card (border + bg-card) and fill the column height. */
  framed?: boolean
  /** Show the legend (midpoint / range) beneath the chart. Default true (hidden when framed). */
  showLegend?: boolean
  /** Rendered when there are zero rows and not loading (the caller's CTA / empty copy). */
  emptyState?: ReactNode
  /** Single-point baseline hint copy. */
  singlePointHint?: string
  /** Optional faint dashed reference line ("potential ceiling"). Omit ⇒ nothing drawn. */
  referenceValue?: number | null
  /**
   * X-unit. `'year'` renders the fiscal year ("2026") on the axis + tooltip — the
   * honest label for the Dec-31-anchored series. Default `'date'`.
   */
  dateMode?: ChartDateMode
  /** Single-point baseline: draw the dashed forward "next version" projection. Default true. */
  showProjection?: boolean
  /** Single-point baseline: show the method caption below the chart. Default true. */
  showMethodCaption?: boolean
  className?: string
  'aria-label'?: string
  'data-testid'?: string
}

export function ValuationTrendChart({
  rows,
  locale,
  currency,
  labels,
  milestones,
  loading = false,
  framed = false,
  showLegend,
  emptyState,
  singlePointHint,
  referenceValue,
  dateMode = 'date',
  showProjection = true,
  showMethodCaption = true,
  className,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: ValuationTrendChartProps) {
  const latest = rows[rows.length - 1] ?? null
  const hasRangeBand = rows.some((row) => row.rangeHigh > row.rangeLow)
  const hasForecast = rows.some((row) => row.isForecast === true)
  const resolvedShowLegend = showLegend ?? !framed

  let body: ReactNode
  if (loading && rows.length === 0) {
    body = (
      <div
        className="h-full min-h-[180px] w-full animate-pulse rounded-lg bg-foreground/[0.04]"
        aria-hidden
      />
    )
  } else if (rows.length === 0) {
    // No data at all. Fall back to a calm, language-agnostic baseline placeholder
    // so the framed surface can NEVER render a blank box — "unfailable" even if a
    // caller forgets to pass `emptyState`.
    body = emptyState ?? (
      <div
        className="flex h-full min-h-[140px] w-full flex-1 flex-col items-center justify-center gap-2"
        aria-hidden
      >
        <div className="h-px w-2/3 max-w-[220px] bg-foreground/10" />
        <span className="font-mono text-[11px] tracking-wide text-foreground/30">—</span>
      </div>
    )
  } else if (rows.length === 1 && latest) {
    body = (
      <SinglePointBaseline
        row={latest}
        locale={locale}
        currency={currency}
        labels={labels}
        hint={singlePointHint ?? ''}
        dateMode={dateMode}
        showProjection={showProjection}
        showMethodCaption={showMethodCaption}
      />
    )
  } else {
    // The plot is absolutely positioned inside a `relative flex-1 min-h-0` box so
    // it fills the available height EXACTLY without feeding its own height back
    // into the parent. `ParentSize` then measures that strictly-bound box. Paint
    // with sensible fallback dimensions on the first render so it never shows a
    // blank box while the ResizeObserver settles.
    body = (
      <div className="relative min-h-0 w-full flex-1">
        <div className="absolute inset-0">
          <ParentSize debounceTime={8}>
            {({ width, height }) => (
              <ValuationVisxChart
                rows={rows}
                width={width > 0 ? width : 560}
                height={height > 0 ? height : 224}
                locale={locale}
                currency={currency}
                labels={labels}
                milestones={milestones}
                referenceLine={
                  referenceValue != null && Number.isFinite(referenceValue)
                    ? { value: referenceValue }
                    : null
                }
                dateMode={dateMode}
              />
            )}
          </ParentSize>
        </div>
      </div>
    )
  }

  const content = (
    <>
      {body}
      {resolvedShowLegend && rows.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-0.5 text-[11px] text-foreground/55">
          <LegendSwatch tone="line">{labels.midpoint}</LegendSwatch>
          {hasRangeBand ? <LegendSwatch tone="band">{labels.range}</LegendSwatch> : null}
          {hasForecast ? <LegendSwatch tone="forecast">{labels.forecast}</LegendSwatch> : null}
        </div>
      ) : null}
    </>
  )

  if (!framed) {
    return (
      <div
        className={cn('flex h-full w-full flex-col', className)}
        aria-label={ariaLabel}
        data-testid={dataTestId}
      >
        {content}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative isolate flex h-full min-h-[17rem] flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5',
        className
      )}
      role="group"
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
      {content}
    </div>
  )
}
