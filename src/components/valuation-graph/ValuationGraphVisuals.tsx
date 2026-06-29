'use client'

import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { GridRows } from '@visx/grid'
import { Group } from '@visx/group'
import { scaleLinear, scaleTime } from '@visx/scale'
import { Area, Bar, Line, LinePath } from '@visx/shape'
import { TooltipWithBounds, useTooltip } from '@visx/tooltip'
import { motion } from 'framer-motion'
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useId, useMemo } from 'react'
import { useReducedMotion } from '@/design-system/hooks/useReducedMotion'

import { ChartGradientDefs, chartGradientIds } from './chart-primitives'
import { XAxisTickLabels, YAxisTickLabels } from './ValuationGraphAxes'
import {
  getDateTickValuesFromRows,
  getNumericTickValues,
  hasIntradayDuplicateDates,
} from './ValuationGraphVisuals.model'
import { ValuationTooltipCard } from './ValuationTooltipCard'
import {
  bisectByDate,
  type ChartDateMode,
  type ChartLabels,
  type ChartRow,
  getXDomainWithMilestones,
  getYDomain,
  isMarketExitEvent,
  MARGIN,
  type ValuationMilestoneMarker,
} from './valuation-graph-model'

// Re-export the legend swatch + baseline + data table so importers get one entry
// point, mirroring Mercury's module layout.
export { LegendSwatch } from './chart-primitives'
export { BaselineVisxChart, SinglePointBaseline } from './ValuationGraphBaseline'
export { ValuationDataTable } from './ValuationGraphDataTable'

export function ValuationVisxChart({
  rows,
  width,
  height,
  locale,
  currency,
  labels,
  milestones,
  referenceLine,
  dateMode = 'date',
}: {
  rows: ChartRow[]
  width: number
  height: number
  locale: string
  currency?: string | null
  labels: ChartLabels
  /** Optional market-event overlay (funding/exits). Empty ⇒ chart unchanged. */
  milestones?: ValuationMilestoneMarker[]
  /**
   * Optional horizontal reference value drawn as a faint dashed line across the
   * plot. Omit ⇒ nothing drawn. Clamped to the plot by the y-scale.
   */
  referenceLine?: { value: number } | null
  /** 'year' ⇒ the x-axis + tooltip read fiscal years ("2026"), not dates. */
  dateMode?: ChartDateMode
}) {
  const reduceMotion = useReducedMotion()
  const idPrefix = useId().replace(/:/g, '')
  const gradientIds = chartGradientIds(idPrefix)

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const xDomain = useMemo(() => getXDomainWithMilestones(rows, milestones), [rows, milestones])
  const yDomain = useMemo(() => getYDomain(rows), [rows])

  const xScale = useMemo(
    () => scaleTime({ domain: xDomain, range: [0, innerWidth] }),
    [xDomain, innerWidth]
  )
  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: yDomain,
        range: [innerHeight, 0],
        nice: true,
        clamp: true,
      }),
    [yDomain, innerHeight]
  )

  const tooltip = useTooltip<ChartRow>()
  const activeRow = tooltip.tooltipData ?? null
  const primaryRow = useMemo(() => {
    for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
      if (rows[idx]?.isForecast !== true) return rows[idx] ?? null
    }
    return rows[rows.length - 1] ?? null
  }, [rows])
  const primaryRowIndex = useMemo(
    () => (primaryRow ? rows.findIndex((row) => row.id === primaryRow.id) : -1),
    [primaryRow, rows]
  )

  const hasRangeBand = rows.some((row) => row.rangeHigh > row.rangeLow)
  const hasAskingPrice = rows.some((row) => row.askingPrice != null)
  const interactiveLabel = `${labels.midpoint} ${labels.range}. ${rows.length} ${labels.reportSnapshot}.`

  // Forecast split: timeline points carry `isForecast`. Forecast years are always
  // the most recent (the engine sorts ascending), so a single boundary index
  // separates the solid actual segment from the dashed forecast segment. The
  // forecast segment re-includes the last actual point so the dashed line connects
  // continuously from where the actuals end. `findIndex` ⇒ -1 when none.
  const firstForecastIdx = rows.findIndex((row) => row.isForecast === true)
  const actualRows = firstForecastIdx === -1 ? rows : rows.slice(0, firstForecastIdx)
  const forecastRows = firstForecastIdx === -1 ? [] : rows.slice(Math.max(0, firstForecastIdx - 1))
  const hasForecast = forecastRows.length > 0

  const xTickCount = Math.max(
    2,
    Math.min(width < 480 ? 3 : width < 720 ? 4 : 6, Math.max(2, rows.length))
  )

  const xTickValues = useMemo(
    () => getDateTickValuesFromRows(rows, xTickCount, locale),
    [rows, xTickCount, locale]
  )
  const includeTimeOnTicks = useMemo(() => hasIntradayDuplicateDates(rows, locale), [rows, locale])
  const yTickValues = useMemo(() => getNumericTickValues(yScale, 4), [yScale])

  function showRowTooltip(row: ChartRow) {
    tooltip.showTooltip({
      tooltipData: row,
      tooltipLeft: (xScale(row.observedAtDate) ?? 0) + MARGIN.left,
      tooltipTop: (yScale(row.valueMid) ?? 0) + MARGIN.top,
    })
  }

  function nearestRowForPointer(x: number, y: number): ChartRow | null {
    const dateAtPoint = xScale.invert(x)
    const idx = bisectByDate(rows, dateAtPoint, 1)
    const d0 = rows[idx - 1]
    const d1 = rows[idx]
    let nearest = d0 ?? d1
    if (d1 && d0) {
      nearest =
        dateAtPoint.valueOf() - d0.observedAtDate.valueOf() >
        d1.observedAtDate.valueOf() - dateAtPoint.valueOf()
          ? d1
          : d0
    }
    if (nearest) {
      let nearestXDistance = Math.abs((xScale(nearest.observedAtDate) ?? 0) - x)
      let nearestYDistance = Math.abs((yScale(nearest.valueMid) ?? 0) - y)
      for (const row of rows) {
        const rowXDistance = Math.abs((xScale(row.observedAtDate) ?? 0) - x)
        if (rowXDistance > nearestXDistance + 1) continue
        const rowYDistance = Math.abs((yScale(row.valueMid) ?? 0) - y)
        if (rowXDistance < nearestXDistance - 1 || rowYDistance < nearestYDistance) {
          nearest = row
          nearestXDistance = rowXDistance
          nearestYDistance = rowYDistance
        }
      }
    }
    return nearest ?? null
  }

  function handlePointer(event: PointerEvent<Element> | MouseEvent<Element>) {
    if (rows.length === 0) return
    const point = localPoint(event)
    if (!point) return
    const nearest = nearestRowForPointer(point.x - MARGIN.left, point.y - MARGIN.top)
    // Skip the state update (and full SVG re-render) while the pointer is still
    // over the same nearest version — otherwise every pixel of movement re-renders.
    if (nearest && nearest.id !== tooltip.tooltipData?.id) {
      showRowTooltip(nearest)
    }
  }

  function handlePointerLeave(event: PointerEvent<Element>) {
    if (event.pointerType === 'touch') return
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }
    tooltip.hideTooltip()
  }

  function handleKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (rows.length === 0) return

    const currentIndex =
      tooltip.tooltipData != null
        ? Math.max(
            0,
            rows.findIndex((row) => row.id === tooltip.tooltipData?.id)
          )
        : Math.max(0, primaryRowIndex)
    let nextIndex: number | null = null

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = Math.max(0, currentIndex - 1)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = Math.min(rows.length - 1, currentIndex + 1)
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = rows.length - 1
    } else if (event.key === 'Enter' || event.key === ' ') {
      nextIndex = currentIndex
    } else if (event.key === 'Escape') {
      tooltip.hideTooltip()
      return
    }

    if (nextIndex == null) return
    event.preventDefault()
    const nextRow = rows[nextIndex]
    if (nextRow) showRowTooltip(nextRow)
  }

  const activeX =
    tooltip.tooltipData != null ? (xScale(tooltip.tooltipData.observedAtDate) ?? 0) : 0

  return (
    <div
      className="relative h-full w-full touch-pan-y select-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      tabIndex={0}
      role="button"
      aria-label={interactiveLabel}
      onFocus={() => {
        if (!tooltip.tooltipData && primaryRow) showRowTooltip(primaryRow)
      }}
      onBlur={() => tooltip.hideTooltip()}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyboard}
    >
      <svg width={width} height={height} aria-hidden>
        <title>Valuation trend</title>
        <defs>
          <ChartGradientDefs idPrefix={idPrefix} />
        </defs>

        <Group left={MARGIN.left} top={MARGIN.top}>
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill={`url(#${gradientIds.surface})`}
            rx={8}
          />

          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="hsl(var(--border))"
            strokeOpacity={0.6}
            strokeDasharray="2 4"
            numTicks={4}
          />

          {referenceLine && Number.isFinite(referenceLine.value) ? (
            <Line
              data-testid="value-curve-potential-ceiling"
              from={{ x: 0, y: yScale(referenceLine.value) ?? 0 }}
              to={{ x: innerWidth, y: yScale(referenceLine.value) ?? 0 }}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.5}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ) : null}

          {hasRangeBand ? (
            <>
              <Area<ChartRow>
                data={rows}
                x={(d) => xScale(d.observedAtDate) ?? 0}
                y0={(d) => yScale(d.rangeLow) ?? 0}
                y1={(d) => yScale(d.rangeHigh) ?? 0}
                curve={curveMonotoneX}
                fill={`url(#${gradientIds.band})`}
              />
              <LinePath<ChartRow>
                data={rows}
                x={(d) => xScale(d.observedAtDate) ?? 0}
                y={(d) => yScale(d.rangeHigh) ?? 0}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.22}
                strokeWidth={1}
                strokeDasharray="2 3"
                curve={curveMonotoneX}
              />
              <LinePath<ChartRow>
                data={rows}
                x={(d) => xScale(d.observedAtDate) ?? 0}
                y={(d) => yScale(d.rangeLow) ?? 0}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.22}
                strokeWidth={1}
                strokeDasharray="2 3"
                curve={curveMonotoneX}
              />
            </>
          ) : null}

          {hasAskingPrice ? (
            <>
              {/* `defined` breaks the line wherever asking price is unset instead
                  of interpolating across the gap — never imply a trajectory
                  through versions that had no asking price. */}
              <LinePath<ChartRow>
                data={rows}
                x={(d) => xScale(d.observedAtDate) ?? 0}
                y={(d) => yScale(d.askingPrice ?? d.valueMid) ?? 0}
                defined={(d) => d.askingPrice != null}
                stroke="hsl(var(--chart-3))"
                strokeOpacity={0.85}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeLinecap="round"
                curve={curveMonotoneX}
              />
              {rows.map((row) =>
                row.askingPrice != null ? (
                  <circle
                    key={`ask-${row.id}`}
                    cx={xScale(row.observedAtDate) ?? 0}
                    cy={yScale(row.askingPrice) ?? 0}
                    r={2.75}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={1.5}
                  />
                ) : null
              )}
            </>
          ) : null}

          {/* Projection divider — a faint vertical line at the actual→forecast
              boundary, so the eye reads "everything right of here is projected". */}
          {hasForecast && firstForecastIdx > 0 ? (
            <Line
              data-testid="valuation-forecast-divider"
              from={{ x: xScale(rows[firstForecastIdx].observedAtDate) ?? 0, y: 0 }}
              to={{ x: xScale(rows[firstForecastIdx].observedAtDate) ?? 0, y: innerHeight }}
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.14}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {/* Mid line — solid for actuals, dashed for the forecast tail (the
              forecast segment re-includes the last actual so the line is unbroken). */}
          {actualRows.length > 0 ? (
            <LinePath<ChartRow>
              data={actualRows}
              x={(d) => xScale(d.observedAtDate) ?? 0}
              y={(d) => yScale(d.valueMid) ?? 0}
              stroke={`url(#${gradientIds.line})`}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              curve={curveMonotoneX}
            />
          ) : null}
          {forecastRows.length > 1 ? (
            <LinePath<ChartRow>
              data-testid="valuation-forecast-line"
              data={forecastRows}
              x={(d) => xScale(d.observedAtDate) ?? 0}
              y={(d) => yScale(d.valueMid) ?? 0}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.9}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="5 5"
              curve={curveMonotoneX}
            />
          ) : null}

          <YAxisTickLabels
            scale={yScale}
            tickValues={yTickValues}
            locale={locale}
            currency={currency}
          />

          <XAxisTickLabels
            top={innerHeight}
            scale={xScale}
            tickValues={xTickValues}
            locale={locale}
            includeTimeOnTicks={includeTimeOnTicks}
            dateMode={dateMode}
          />

          {rows.map((row) => {
            const cx = xScale(row.observedAtDate) ?? 0
            const cy = yScale(row.valueMid) ?? 0
            const isHovered = activeRow?.id === row.id
            const isPrimary = primaryRow?.id === row.id
            const baseRadius = isPrimary ? 4 : 3.25
            return (
              <g key={row.id}>
                {isHovered ? (
                  <circle cx={cx} cy={cy} r={10} fill="hsl(var(--primary))" fillOpacity={0.16} />
                ) : null}
                {/* Forecast dots are hollow (card fill, primary ring); actuals are
                    solid (primary fill, card ring) — a projected year reads as
                    provisional at a glance. */}
                <circle
                  data-testid={
                    row.isForecast === true ? 'valuation-forecast-point' : 'valuation-actual-point'
                  }
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 5 : baseRadius}
                  fill={row.isForecast === true ? 'hsl(var(--card))' : 'hsl(var(--primary))'}
                  stroke={row.isForecast === true ? 'hsl(var(--primary))' : 'hsl(var(--card))'}
                  strokeWidth={2}
                />
                {isHovered && !reduceMotion ? (
                  <motion.circle
                    cx={cx}
                    cy={cy}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1}
                    initial={{ r: 5, strokeOpacity: 0.5 }}
                    animate={{ r: 14, strokeOpacity: 0 }}
                    transition={{
                      duration: 1.6,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: 'easeOut',
                    }}
                  />
                ) : null}
              </g>
            )
          })}

          {tooltip.tooltipData ? (
            <Line
              from={{ x: activeX, y: 0 }}
              to={{ x: activeX, y: innerHeight }}
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.18}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
          ) : null}

          <Bar
            data-testid="valuation-chart-hitbox"
            width={Math.max(0, innerWidth)}
            height={Math.max(0, innerHeight)}
            fill="transparent"
            cursor="crosshair"
            style={{ touchAction: 'pan-y' }}
            onPointerDown={handlePointer}
            onPointerMove={handlePointer}
            onPointerUp={handlePointer}
            onClick={handlePointer}
          />

          {milestones && milestones.length > 0
            ? milestones.map((m) => {
                const mx = xScale(m.date) ?? 0
                if (mx < -6 || mx > innerWidth + 6) return null
                const isEvent = isMarketExitEvent(m.type)
                const color = isEvent ? 'hsl(var(--accent))' : 'hsl(var(--primary))'
                return (
                  <a
                    key={m.id}
                    href={m.sourceUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={m.detail}
                    className={m.sourceUrl ? 'cursor-pointer' : undefined}
                    onPointerMove={handlePointer}
                    onPointerDown={handlePointer}
                  >
                    <title>
                      {m.detail}
                      {m.sourceOutlet ? `: ${m.sourceOutlet}` : ''}
                    </title>
                    <Line
                      from={{ x: mx, y: 8 }}
                      to={{ x: mx, y: innerHeight }}
                      stroke={color}
                      strokeOpacity={0.38}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      pointerEvents="none"
                    />
                    {isEvent ? (
                      <rect
                        x={mx - 4}
                        y={2}
                        width={8}
                        height={8}
                        transform={`rotate(45 ${mx} 6)`}
                        fill={color}
                        stroke="hsl(var(--card))"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <path
                        d={`M ${mx} 1 L ${mx + 5} 10 L ${mx - 5} 10 Z`}
                        fill={color}
                        stroke="hsl(var(--card))"
                        strokeWidth={1.5}
                      />
                    )}
                  </a>
                )
              })
            : null}
        </Group>
      </svg>

      {tooltip.tooltipData ? (
        <TooltipWithBounds
          top={tooltip.tooltipTop}
          left={tooltip.tooltipLeft}
          unstyled
          applyPositionStyle
          className="pointer-events-none z-20"
        >
          <ValuationTooltipCard
            row={tooltip.tooltipData}
            locale={locale}
            currency={currency}
            labels={labels}
            dateMode={dateMode}
          />
        </TooltipWithBounds>
      ) : null}
    </div>
  )
}
