import type { ReactNode } from 'react'
import { cn } from '@/design-system/utils'
import type { PrefillSource } from './SaasMetricsSectionModel'

export type { PrefillSource } from './SaasMetricsSectionModel'

export function SaasPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {title}
        </h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

function PrefilledFieldChip({
  source,
  label,
  tooltip,
}: {
  source: PrefillSource
  label: string
  tooltip: string
}) {
  const tone =
    source === 'benchmark'
      ? 'border-amber-300/60 bg-amber-50/70 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200'
      : 'border-emerald-300/60 bg-emerald-50/70 text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-200'
  return (
    <span
      className={cn(
        'mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-tight',
        tone
      )}
      title={tooltip}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  )
}

export function FieldWithSourceChip({
  prefilled,
  source,
  label,
  tooltip,
  children,
}: {
  prefilled: boolean
  source: PrefillSource | null
  label: string
  tooltip: string
  children: ReactNode
}) {
  return (
    <div className="space-y-0">
      {children}
      {prefilled && source && (
        <PrefilledFieldChip source={source} label={label} tooltip={tooltip} />
      )}
    </div>
  )
}
