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
  emphasis = 'default',
  className,
}: {
  label: string
  value: string
  hint?: string
  status?: MetricHealthStatus | null
  statusLabel?: string
  /**
   * Visual prominence of the card. Use `'primary'` to highlight the result of
   * a calculation (e.g. an implied/derived value the other cards roll up to).
   */
  emphasis?: 'default' | 'primary'
  className?: string
}) {
  const isPrimary = emphasis === 'primary'
  return (
    <div
      className={cn(
        // `min-w-0` is required so long labels don't blow out CSS-grid cells.
        // Without it, grid items default to `min-width: auto` (= content size),
        // which causes long Dutch/German labels to overflow the card.
        'min-w-0 rounded-xl border px-3 py-2.5',
        isPrimary
          ? 'border-foreground/15 bg-foreground/[0.04]'
          : 'border-foreground/[0.08] bg-foreground/[0.02]',
        className
      )}
    >
      <p
        className="break-words text-[10px] font-medium uppercase leading-tight tracking-wide text-foreground/45"
        title={label}
      >
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className={cn(
            'min-w-0 break-words font-semibold tabular-nums',
            isPrimary ? 'text-base' : 'text-sm',
            status ? STATUS_TEXT_COLORS[status] : 'text-foreground'
          )}
        >
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
      {hint ? (
        <p className="mt-1 break-words text-[10px] leading-snug text-foreground/45">{hint}</p>
      ) : null}
    </div>
  )
}
