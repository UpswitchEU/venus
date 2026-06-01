'use client'

import { useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'
import { cn } from '@/design-system/utils'
import type { EvEquityWaterfallStep } from '../../types/valuation'

function formatCompactEur(value: number): string {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
  }).format(value)
}

function toFiniteNumber(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function niceCurrencyStep(maxAbs: number): number {
  if (maxAbs <= 4_000) return 1_000
  if (maxAbs <= 8_000) return 2_000
  if (maxAbs <= 20_000) return 5_000
  if (maxAbs <= 40_000) return 10_000
  if (maxAbs <= 100_000) return 25_000
  if (maxAbs <= 200_000) return 50_000
  if (maxAbs <= 400_000) return 100_000
  if (maxAbs <= 1_000_000) return 250_000
  if (maxAbs <= 2_000_000) return 500_000
  if (maxAbs <= 4_000_000) return 1_000_000
  if (maxAbs <= 10_000_000) return 2_500_000
  if (maxAbs <= 20_000_000) return 5_000_000
  return 10_000_000
}

function barFillClass(step: EvEquityWaterfallStep): string {
  const kind = step.kind ?? ''
  const tone = step.tone ?? ''
  if (kind === 'total' || tone === 'brand') return 'fill-blue-600'
  if (tone === 'positive') return 'fill-emerald-500'
  if (tone === 'negative') return 'fill-red-500'
  if (tone === 'neutral') return 'fill-slate-400'
  if (tone === 'bridge') return 'fill-violet-500'
  return 'fill-slate-500'
}

/**
 * EV → equity bridge from ValuationIQ `ev_equity_waterfall_steps` (same logic as PDF/HTML report).
 */
export function EnterpriseEquityWaterfallChart({
  steps,
  className,
}: {
  steps: EvEquityWaterfallStep[]
  className?: string
}) {
  const t = useTranslations('reportPreview.waterfall')
  const titleId = useId()

  const chart = useMemo(() => {
    const chartW = 560
    const chartH = 190
    const paddingTop = 28
    const paddingBottom = 42
    const paddingLeft = 58
    const paddingRight = 18
    const innerW = chartW - paddingLeft - paddingRight
    const innerH = chartH - paddingTop - paddingBottom

    const normalized = steps.map((step, index) => {
      const previousEnd = index > 0 ? toFiniteNumber(steps[index - 1]?.end_value) : 0
      const start = toFiniteNumber(step.start_value, previousEnd)
      const delta = toFiniteNumber(step.delta_value, 0)
      const end = toFiniteNumber(step.end_value, start + delta)
      const kind = step.kind ?? ''
      const isTotal = kind === 'base' || kind === 'subtotal' || kind === 'total'
      const top = isTotal ? Math.max(0, end) : Math.max(start, end)
      const bottom = isTotal ? Math.min(0, end) : Math.min(start, end)
      return { step, start, end, delta, isTotal, top, bottom }
    })

    const plotted = normalized.flatMap((row) => [row.start, row.end, row.top, row.bottom])
    plotted.push(0)
    const rawMin = Math.min(...plotted)
    const rawMax = Math.max(...plotted)
    const step = niceCurrencyStep(Math.max(Math.abs(rawMin), Math.abs(rawMax)))
    let minValue = Math.floor(rawMin / step) * step
    let maxValue = Math.ceil(rawMax / step) * step
    if (minValue === maxValue) {
      maxValue = minValue + step
    }
    const valueRange = maxValue - minValue
    const yForValue = (value: number) => paddingTop + ((maxValue - value) / valueRange) * innerH

    const n = normalized.length
    const minGap = 1
    const preferredGap = 8
    const desiredBarW = 34
    const slotW = n > 0 ? innerW / n : innerW
    const gap = n > 1 ? Math.min(preferredGap, Math.max(minGap, slotW * 0.18)) : 0
    const barW = Math.max(2, Math.min(desiredBarW, slotW - gap))

    return {
      chartW,
      chartH,
      paddingTop,
      paddingBottom,
      paddingLeft,
      paddingRight,
      innerW,
      innerH,
      minValue,
      maxValue,
      valueRange,
      normalized,
      yForValue,
      barW,
      gap,
      slotW,
    }
  }, [steps])

  if (!steps.length) return null

  return (
    <section
      className={cn(
        'rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 mb-6',
        className
      )}
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">{t('title')}</h3>
      <p className="text-xs text-foreground/55 mb-4 leading-relaxed">{t('subtitle')}</p>
      <svg
        width="100%"
        viewBox={`0 0 ${chart.chartW} ${chart.chartH}`}
        className="max-w-full h-auto"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{t('ariaLabel')}</title>
        <rect
          x={chart.paddingLeft - 8}
          y={chart.paddingTop - 12}
          width={chart.innerW + 16}
          height={chart.innerH + 20}
          rx={6}
          className="fill-muted/30"
        />
        {[0, 1, 2, 3].map((tick) => {
          const ratio = tick / 3
          const value = chart.minValue + chart.valueRange * ratio
          const y = chart.yForValue(value)
          return (
            <g key={tick}>
              <line
                x1={chart.paddingLeft - 4}
                y1={y}
                x2={chart.paddingLeft + chart.innerW}
                y2={y}
                className="stroke-border"
                strokeDasharray={tick > 0 ? '3 2' : undefined}
              />
              <text
                x={chart.paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[8px] font-mono"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {formatCompactEur(value)}
              </text>
            </g>
          )
        })}
        <line
          x1={chart.paddingLeft - 4}
          y1={chart.yForValue(0)}
          x2={chart.paddingLeft + chart.innerW}
          y2={chart.yForValue(0)}
          className="stroke-muted-foreground/60"
        />
        {chart.normalized.map((row, i) => {
          const x = chart.paddingLeft + i * chart.slotW + (chart.slotW - chart.barW) / 2
          const y = chart.yForValue(row.top)
          const yBottom = chart.yForValue(row.bottom)
          const hBar = Math.max(2, yBottom - y)
          const labelValue = row.isTotal ? row.end : row.delta
          const labelY =
            labelValue >= 0 ? Math.max(12, y - 6) : Math.min(chart.chartH - 18, yBottom + 12)
          const previous = chart.normalized[i - 1]
          const connectorY = previous ? chart.yForValue(previous.end) : chart.yForValue(row.start)
          return (
            <g key={`${row.step.label}-${i}`}>
              {previous ? (
                <line
                  x1={
                    chart.paddingLeft +
                    (i - 1) * chart.slotW +
                    (chart.slotW - chart.barW) / 2 +
                    chart.barW
                  }
                  y1={connectorY}
                  x2={x}
                  y2={connectorY}
                  className="stroke-muted-foreground/40"
                  strokeDasharray="3 2"
                />
              ) : null}
              <rect
                x={x}
                y={y}
                width={chart.barW}
                height={hBar}
                rx={3}
                className={barFillClass(row.step)}
              />
              <text
                x={x + chart.barW / 2}
                y={chart.chartH - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px] font-medium"
                style={{ fontFamily: 'system-ui, sans-serif' }}
                textLength={Math.min(58, Math.max(24, chart.barW + 18))}
                lengthAdjust="spacingAndGlyphs"
              >
                {(row.step.short_label || row.step.label).slice(0, 14)}
              </text>
              <text
                x={x + chart.barW / 2}
                y={labelY}
                textAnchor="middle"
                className="fill-foreground text-[8px] font-mono tabular-nums"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {formatCompactEur(labelValue)}
              </text>
            </g>
          )
        })}
      </svg>
      <table className="sr-only">
        <caption>{t('ariaLabel')}</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Start</th>
            <th scope="col">End</th>
            <th scope="col">Delta</th>
          </tr>
        </thead>
        <tbody>
          {chart.normalized.map((row, index) => (
            <tr key={`${row.step.label}-${index}`}>
              <th scope="row">{row.step.label}</th>
              <td>{formatCompactEur(row.start)}</td>
              <td>{formatCompactEur(row.end)}</td>
              <td>{formatCompactEur(row.isTotal ? row.end : row.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
