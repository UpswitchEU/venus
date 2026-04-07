'use client'

/**
 * Shared layout + rounding for manual calculator "derived metrics" (SaaS, SDE, revenue quality, ...).
 * Format `Intl.NumberFormat` instances with `useManualPreviewFormatters` from `@/lib/omniPreview`
 * so EUR / % rules stay consistent with DCF preview tables.
 */

import { cn } from '@/design-system/utils'

export type MetricHealthStatus = 'excellent' | 'good' | 'warning' | 'poor'

const STATUS_DOT_COLORS: Record<MetricHealthStatus, string> = {
  excellent: 'bg-emerald-500',
  good: 'bg-blue-500',
  warning: 'bg-amber-500',
  poor: 'bg-red-500',
}

const STATUS_TEXT_COLORS: Record<MetricHealthStatus, string> = {
  excellent: 'text-emerald-600 dark:text-emerald-400',
  good: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  poor: 'text-red-500 dark:text-red-400',
}

export function roundPreviewMetric(value: number, fractionDigits: number): number {
  const f = 10 ** fractionDigits
  return Math.round(value * f) / f
}

export function formatPreviewMetricValue(
  value: number | null,
  formatter: Intl.NumberFormat,
  fractionDigits: number,
  suffix = ''
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${formatter.format(roundPreviewMetric(value, fractionDigits))}${suffix}`
}

export function PreviewMetricCard({
  label,
  value,
  hint,
  status,
  statusLabel,
}: {
  label: string
  value: string
  hint?: string
  status?: MetricHealthStatus | null
  statusLabel?: string
}) {
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className={cn(
          'text-sm font-semibold',
          status ? STATUS_TEXT_COLORS[status] : 'text-foreground'
        )}>
          {value}
        </p>
        {status && statusLabel && (
          <span className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_COLORS[status])} />
            <span className={cn('text-[10px] font-medium', STATUS_TEXT_COLORS[status])}>
              {statusLabel}
            </span>
          </span>
        )}
      </div>
      {hint ? <p className="mt-1 text-[10px] leading-snug text-foreground/45">{hint}</p> : null}
    </div>
  )
}
