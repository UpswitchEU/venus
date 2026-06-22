import { CircleHelp, type LucideIcon, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { AuroraButton, Badge } from '@/design-system'
import { confidenceLabel, imSectionHeading, statusLabel, statusTone } from './readiness-room-model'
import type { BuyerReadinessItemStatus, BuyerReadyImSection, BuyerReadyVaultDoc } from './types'

export function statusVariant(
  status: string | null | undefined
): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (!status) return 'neutral'
  return statusTone(
    status as BuyerReadinessItemStatus | 'ready' | 'blocked' | 'documented' | 'weak_evidence'
  )
}

export function formatRoomDate(value: string | null | undefined, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-lg border border-foreground/[0.08] bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-foreground/45">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 truncate text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function SectionShell({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-foreground/[0.08] bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export function DeliverableCard({
  title,
  status,
  detail,
}: {
  title: string
  status: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground/85">{title}</h3>
        <Badge variant={statusVariant(status)} size="sm">
          {statusLabel(status)}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground/60">{detail}</p>
    </div>
  )
}

export function ImSectionPreview({ section }: { section: BuyerReadyImSection }) {
  return (
    <article className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{imSectionHeading(section)}</h3>
        <Badge
          variant={
            section.confidence === 'high'
              ? 'success'
              : section.confidence === 'medium'
                ? 'warning'
                : 'destructive'
          }
          size="sm"
        >
          {confidenceLabel(section.confidence)}
        </Badge>
      </div>
      <div className="mt-2 space-y-2">
        {section.narrative_paragraphs.slice(0, 2).map((paragraph, index) => (
          <p
            key={`${section.section_key}-${index}`}
            className="text-sm leading-6 text-foreground/65"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  )
}

export function DocumentChecklistRow({
  label,
  status,
  detail,
}: {
  label: string
  status: 'red' | 'yellow' | 'green'
  detail: string
}) {
  const variant = status === 'green' ? 'success' : status === 'yellow' ? 'warning' : 'destructive'
  return (
    <div className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground/85">{label}</p>
        <Badge variant={variant} size="sm">
          {status}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-foreground/55">{detail}</p>
    </div>
  )
}

export function VaultDocRow({ doc, locale }: { doc: BuyerReadyVaultDoc; locale: string }) {
  return (
    <div className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground/85">{doc.filename}</p>
          <p className="mt-1 text-xs text-foreground/50">
            v{doc.version} &middot; {formatRoomDate(doc.uploaded_at, locale)}
          </p>
        </div>
        <Badge variant={doc.access_gate === 'after_nda' ? 'warning' : 'success'} size="sm">
          {doc.access_gate === 'after_nda' ? 'NDA' : 'Teaser'}
        </Badge>
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon
  title: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-foreground/[0.14] bg-background px-4 py-6 text-center">
      <Icon className="mx-auto h-5 w-5 text-foreground/35" />
      <p className="mt-2 text-sm font-medium text-foreground/75">{title}</p>
      <p className="mt-1 text-sm text-foreground/50">{detail}</p>
    </div>
  )
}

export function RoomSkeleton() {
  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="h-24 animate-pulse rounded-lg bg-foreground/[0.06]" />
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-foreground/[0.06]" />
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-[520px] animate-pulse rounded-lg bg-foreground/[0.06]" />
          <div className="h-[520px] animate-pulse rounded-lg bg-foreground/[0.06]" />
        </div>
      </div>
    </div>
  )
}

export function RoomError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-foreground/[0.08] bg-card p-6 text-center">
        <CircleHelp className="mx-auto h-8 w-8 text-warning" />
        <h1 className="mt-3 text-lg font-semibold">Readiness room unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-foreground/60">{message}</p>
        <AuroraButton type="button" variant="primary" size="md" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </AuroraButton>
      </div>
    </div>
  )
}
