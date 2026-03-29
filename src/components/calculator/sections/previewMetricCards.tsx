'use client'

/**
 * Shared layout + rounding for manual calculator “derived metrics” (SaaS, SDE, revenue quality, …).
 * Format `Intl.NumberFormat` instances with `useManualPreviewFormatters` from `@/lib/omniPreview`
 * so € / % rules stay consistent with DCF preview tables.
 */

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
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-snug text-foreground/45">{hint}</p> : null}
    </div>
  )
}
