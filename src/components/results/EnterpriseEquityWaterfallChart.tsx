'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
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

  const { maxMag, chartW, chartH, padding } = useMemo(() => {
    const w = 520
    const h = 168
    const p = 40
    let m = 1
    for (const s of steps) {
      const a = Math.abs(s.delta_value ?? 0)
      const b = Math.abs(s.end_value ?? 0)
      m = Math.max(m, a, b, Math.abs(s.start_value ?? 0))
    }
    return { maxMag: m, chartW: w, chartH: h, padding: p }
  }, [steps])

  const innerW = chartW - padding * 2
  const innerH = chartH - padding - 28
  const n = steps.length
  const gap = 8
  const barW = n > 0 ? Math.max(14, Math.min(36, (innerW - gap * (n - 1)) / n)) : 14

  if (!steps.length) return null

  return (
    <section
      className={cn(
        'rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 mb-6',
        className
      )}
      aria-label={t('ariaLabel')}
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">{t('title')}</h3>
      <p className="text-xs text-foreground/55 mb-4 leading-relaxed">{t('subtitle')}</p>
      <svg
        width="100%"
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="max-w-full h-auto"
        role="img"
      >
        <rect
          x={padding - 6}
          y={12}
          width={innerW + 12}
          height={innerH + 16}
          rx={6}
          className="fill-muted/30"
        />
        {steps.map((step, i) => {
          const x = padding + i * (barW + gap)
          const isTotal = step.kind === 'total' || step.kind === 'subtotal' || step.kind === 'base'
          const v = isTotal ? Math.abs(step.end_value ?? 0) : Math.abs(step.delta_value ?? 0)
          const hBar = maxMag > 0 ? (v / maxMag) * innerH : 0
          const yBase = padding + 12 + innerH
          const y = yBase - hBar
          return (
            <g key={`${step.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(hBar, 2)}
                rx={3}
                className={barFillClass(step)}
              />
              <text
                x={x + barW / 2}
                y={chartH - 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px] font-medium"
                style={{ fontFamily: 'system-ui, sans-serif' }}
              >
                {(step.short_label || step.label).slice(0, 14)}
              </text>
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-foreground text-[8px] font-mono tabular-nums"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {formatCompactEur(
                  isTotal ? (step.end_value ?? 0) : (step.delta_value ?? 0)
                )}
              </text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}
