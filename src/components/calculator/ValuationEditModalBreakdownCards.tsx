import { cn } from '@/design-system/utils'

export function BreakdownMetricCard({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string
  value: string
  accent?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        muted ? 'border-border/40 bg-background/40' : 'border-border/60 bg-background/60'
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-mono font-semibold tabular-nums',
          muted ? 'text-foreground/35' : accent ? 'text-primary' : 'text-foreground/80'
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function StableMetricCard({
  label,
  value,
  formatter,
  accent = false,
}: {
  label: string
  value: number | null
  formatter: (n: number) => string
  accent?: boolean
}) {
  return (
    <BreakdownMetricCard
      label={label}
      value={value != null ? formatter(value) : '—'}
      accent={accent && value != null}
      muted={value == null}
    />
  )
}
