'use client'

import { GridRows } from '@visx/grid'
import { Group } from '@visx/group'
import { ParentSize } from '@visx/responsive'
import { scaleLinear } from '@visx/scale'
import { useId, useMemo, useState } from 'react'

import { YAxisTickLabels } from './ValuationGraphAxes'
import {
  formatGraphRange,
  getNumericTickValues,
  resolvePointStatusLabel,
} from './ValuationGraphVisuals.model'
import { ValuationTooltipCard } from './ValuationTooltipCard'
import {
  type ChartDateMode,
  type ChartLabels,
  type ChartRow,
  formatDate,
  formatGraphCurrency,
  formatYear,
  getYDomain,
  MARGIN,
} from './valuation-graph-model'

/**
 * Baseline state rendered in place of the trend chart when only one valuation
 * year exists. A line chart needs two points to draw a line — but the panel is
 * titled "value over time", so falling back to a key/value list quietly breaks
 * that promise and reads as "where is the graph?".
 *
 * Instead we render the real chart frame with the single observation as a
 * labelled origin dot: the y-axis places the value in context, a capped whisker
 * shows the low–high range, and a fading dashed guide projects forward — a chart
 * "waiting for its second point" rather than an apology for not having one.
 */
export function SinglePointBaseline({
  row,
  locale,
  currency,
  labels,
  hint,
  dateMode = 'date',
  showProjection = true,
  showMethodCaption = true,
}: {
  row: ChartRow
  locale: string
  currency?: string | null
  labels: ChartLabels
  hint: string
  /** 'year' ⇒ the point's label + tooltip read the fiscal year ("2026"). */
  dateMode?: ChartDateMode
  /** The dashed "next version lands here" guide + hollow dot. */
  showProjection?: boolean
  /** The method caption below the chart. */
  showMethodCaption?: boolean
}) {
  const [showDetails, setShowDetails] = useState(false)
  const hasRange = row.rangeHigh > row.rangeLow
  const interactiveLabel = `${labels.midpoint} ${formatGraphCurrency(row.valueMid, currency, locale)}. ${
    hasRange ? `${labels.range} ${formatGraphRange(row, currency, locale)}.` : ''
  }`
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <button
        type="button"
        className="relative block min-h-[200px] w-full flex-1 touch-pan-y rounded-md border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={interactiveLabel}
        onFocus={() => setShowDetails(true)}
        onBlur={() => setShowDetails(false)}
        onPointerEnter={() => setShowDetails(true)}
        onPointerLeave={() => setShowDetails(false)}
        onClick={() => setShowDetails(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setShowDetails(false)
          }
        }}
      >
        <ParentSize>
          {({ width, height }) =>
            width > 0 && height > 0 ? (
              <BaselineVisxChart
                row={row}
                width={width}
                height={height}
                locale={locale}
                currency={currency}
                dateMode={dateMode}
                showProjection={showProjection}
                active={showDetails}
              />
            ) : null
          }
        </ParentSize>
        {showDetails ? (
          <div className="pointer-events-none absolute right-2 top-2 z-20">
            <ValuationTooltipCard
              row={row}
              locale={locale}
              currency={currency}
              labels={labels}
              dateMode={dateMode}
            />
          </div>
        ) : null}
      </button>

      {/* The SVG above is aria-hidden; this <dl> is its accessible twin. */}
      <dl className="sr-only">
        <dt>{labels.status}</dt>
        <dd>{resolvePointStatusLabel(row, labels)}</dd>
        <dt>{labels.midpoint}</dt>
        <dd>{formatGraphCurrency(row.valueMid, currency, locale)}</dd>
        {hasRange ? (
          <>
            <dt>{labels.range}</dt>
            <dd>{formatGraphRange(row, currency, locale)}</dd>
          </>
        ) : null}
        {row.askingPrice != null ? (
          <>
            <dt>{labels.askingPrice}</dt>
            <dd>{formatGraphCurrency(row.askingPrice, currency, locale)}</dd>
          </>
        ) : null}
        {row.methodology ? (
          <>
            <dt>{labels.method}</dt>
            <dd>{row.methodology}</dd>
          </>
        ) : null}
      </dl>

      {showMethodCaption && row.methodology ? (
        <div className="flex flex-wrap items-center gap-x-2 px-1 text-[11px]">
          <span className="text-foreground/45">{labels.method}</span>
          <span className="font-medium text-foreground/80">{row.methodology}</span>
        </div>
      ) : null}

      {hint ? <p className="text-xs text-foreground/45">{hint}</p> : null}
    </div>
  )
}

/**
 * The one-observation chart frame: y-axis + grid for context, a capped whisker
 * for the low–high range, the origin dot with its value label, and a dashed
 * guide that fades forward to signal the trend line starts here.
 */
export function BaselineVisxChart({
  row,
  width,
  height,
  locale,
  currency,
  dateMode = 'date',
  showProjection = true,
  active = false,
}: {
  row: ChartRow
  width: number
  height: number
  locale: string
  currency?: string | null
  /** 'year' ⇒ the axis label under the point reads the fiscal year ("2026"). */
  dateMode?: ChartDateMode
  /** Draw the dashed forward guide + hollow "next version" dot. */
  showProjection?: boolean
  /** Highlight the origin dot (halo + grow) — driven by hover/focus. */
  active?: boolean
}) {
  const idPrefix = useId().replace(/:/g, '')
  const guideGradientId = `${idPrefix}-guide`

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: getYDomain([row]),
        range: [innerHeight, 0],
        nice: true,
        clamp: true,
      }),
    [row, innerHeight]
  )

  const dotX = innerWidth * 0.22
  const midY = yScale(row.valueMid) ?? 0
  const lowY = yScale(row.rangeLow) ?? 0
  const highY = yScale(row.rangeHigh) ?? 0
  const hasRange = row.rangeHigh > row.rangeLow
  const distinctAskingPrice =
    row.askingPrice != null && Math.abs(row.askingPrice - row.valueMid) > 1 ? row.askingPrice : null
  const askingY = distinctAskingPrice != null ? (yScale(distinctAskingPrice) ?? 0) : null
  const yTickValues = useMemo(() => getNumericTickValues(yScale, 4), [yScale])

  return (
    <svg width={width} height={height} aria-hidden>
      <title>Valuation baseline</title>
      <defs>
        <linearGradient id={guideGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
        </linearGradient>
      </defs>
      <Group left={MARGIN.left} top={MARGIN.top}>
        <GridRows
          scale={yScale}
          width={innerWidth}
          stroke="hsl(var(--border))"
          strokeOpacity={0.6}
          strokeDasharray="2 4"
          numTicks={4}
        />

        <YAxisTickLabels
          scale={yScale}
          tickValues={yTickValues}
          locale={locale}
          currency={currency}
        />

        {/*
         * Dashed guide + hollow endpoint projecting forward — a chart "waiting
         * for its second point". Opt-in: surfaces that want a calmer look turn it
         * off.
         */}
        {showProjection ? (
          <>
            <line
              x1={dotX}
              y1={midY}
              x2={innerWidth - 6}
              y2={midY}
              stroke={`url(#${guideGradientId})`}
              strokeWidth={2}
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <circle
              cx={innerWidth - 6}
              cy={midY}
              r={4}
              fill="hsl(var(--card))"
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              strokeDasharray="2 2"
            />
          </>
        ) : null}

        {hasRange ? (
          <g
            data-testid="baseline-range-whisker"
            stroke="hsl(var(--primary))"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <line x1={dotX} y1={highY} x2={dotX} y2={lowY} />
            <line x1={dotX - 4} y1={highY} x2={dotX + 4} y2={highY} />
            <line x1={dotX - 4} y1={lowY} x2={dotX + 4} y2={lowY} />
          </g>
        ) : null}

        {distinctAskingPrice != null && askingY != null ? (
          <g
            data-testid="baseline-asking-price-marker"
            stroke="hsl(var(--chart-3))"
            strokeLinecap="round"
          >
            <line
              x1={Math.max(0, dotX - 14)}
              y1={askingY}
              x2={innerWidth - 6}
              y2={askingY}
              strokeOpacity={0.64}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <circle cx={dotX} cy={askingY} r={3.5} fill="hsl(var(--card))" strokeWidth={1.5} />
            <text
              x={innerWidth}
              y={Math.max(askingY - 8, 10)}
              textAnchor="end"
              fill="hsl(var(--chart-3))"
              stroke="none"
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--font-sans, inherit)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatGraphCurrency(distinctAskingPrice, currency, locale)}
            </text>
          </g>
        ) : null}

        {active ? (
          <circle cx={dotX} cy={midY} r={11} fill="hsl(var(--primary))" fillOpacity={0.16} />
        ) : null}
        <circle
          data-testid="baseline-origin-dot"
          cx={dotX}
          cy={midY}
          r={active ? 6 : 4.5}
          fill="hsl(var(--primary))"
          stroke="hsl(var(--card))"
          strokeWidth={2}
        />

        <text
          x={dotX}
          y={Math.max(midY - 16, 10)}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize={12}
          fontWeight={600}
          fontFamily="var(--font-sans, inherit)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatGraphCurrency(row.valueMid, currency, locale)}
        </text>

        <text
          x={dotX}
          y={innerHeight + 18}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize={11}
          fontFamily="var(--font-sans, inherit)"
        >
          {dateMode === 'year' ? formatYear(row.observedAt) : formatDate(row.observedAt, locale)}
        </text>
      </Group>
    </svg>
  )
}
