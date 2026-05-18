'use client'

import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  FileArchive,
  FileDown,
  FileText,
  FolderOpen,
  Landmark,
  type LucideIcon,
  RefreshCw,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AuthGate } from '@/components/AuthGate'
import { AuroraButton, Badge, Progress } from '@/design-system'
import { cn } from '@/lib/utils'
import {
  buildEvidenceIndex,
  buildPackageSummaryDownload,
  docsByCategory,
  formatMoney,
  orderedImSections,
  statusLabel,
  statusTone,
  summarizeRoom,
} from './readiness-room-model'
import type {
  BuyerReadyImSection,
  BuyerReadyRoomPayload,
  BuyerReadyVaultDoc,
  BuyerReadinessItemStatus,
} from './types'

interface BuyerReadyRoomClientProps {
  entityId: string
  locale: string
}

interface RoomResponse {
  success: boolean
  data?: BuyerReadyRoomPayload
  error?: string
}

function statusVariant(status: string | null | undefined): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (!status) return 'neutral'
  return statusTone(status as BuyerReadinessItemStatus | 'ready' | 'blocked' | 'documented' | 'weak_evidence')
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

async function fetchRoom(entityId: string): Promise<BuyerReadyRoomPayload> {
  const response = await fetch(`/api/buyer-ready/room/${encodeURIComponent(entityId)}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  const json = (await response.json().catch(() => null)) as RoomResponse | null
  if (!response.ok || !json?.success || !json.data) {
    throw new Error(json?.error ?? `Buyer-ready room failed (${response.status})`)
  }
  return json.data
}

export function BuyerReadyRoomClient({ entityId, locale }: BuyerReadyRoomClientProps) {
  return (
    <AuthGate loadingComponent={<RoomSkeleton />}>
      <BuyerReadyRoom entityId={entityId} locale={locale} />
    </AuthGate>
  )
}

function BuyerReadyRoom({ entityId, locale }: BuyerReadyRoomClientProps) {
  const [payload, setPayload] = useState<BuyerReadyRoomPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setPayload(await fetchRoom(entityId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Buyer-ready room failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId])

  if (loading) return <RoomSkeleton />
  if (error || !payload) return <RoomError message={error ?? 'Buyer-ready room failed'} onRetry={load} />

  return <RoomContent payload={payload} locale={locale} />
}

function RoomContent({ payload, locale }: { payload: BuyerReadyRoomPayload; locale: string }) {
  const summary = useMemo(() => summarizeRoom(payload, locale), [payload, locale])
  const evidenceIndex = useMemo(() => buildEvidenceIndex(payload), [payload])
  const imSections = useMemo(() => orderedImSections(payload.im?.sections), [payload.im?.sections])
  const vaultByCategory = useMemo(() => docsByCategory(payload.vaultDocs), [payload.vaultDocs])
  const readiness = payload.buyerReadiness
  const bridge = readiness?.normalizationBridge
  const pdfUrl =
    payload.package?.pdf.status === 'ready' && payload.package.pdf.url ? payload.package.pdf.url : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <header className="border-b border-foreground/[0.08] pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Buyer-ready room
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">
                {summary.businessName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(readiness?.status)} size="sm">
                  {statusLabel(readiness?.status)}
                </Badge>
                {payload.readinessCase ? (
                  <Badge variant={statusVariant(payload.readinessCase.state)} size="sm">
                    Case {statusLabel(payload.readinessCase.state)}
                  </Badge>
                ) : null}
                {payload.partialFailures.length > 0 ? (
                  <Badge variant="warning" size="sm">
                    Partial sync
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-foreground/[0.14] px-3 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.06]"
                >
                  <FileDown className="h-4 w-4" />
                  Main PDF
                </a>
              ) : null}
              <a
                href={`/api/buyer-ready/im/${encodeURIComponent(payload.entityId)}/docx`}
                className={cn(
                  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-foreground/[0.14] px-3 text-sm font-medium transition-colors hover:bg-foreground/[0.06]',
                  payload.im ? 'text-foreground/75' : 'pointer-events-none opacity-50'
                )}
                aria-disabled={payload.im ? undefined : true}
              >
                <FileText className="h-4 w-4" />
                IM DOCX
              </a>
              <button
                type="button"
                onClick={() => downloadJson('buyer-ready-evidence-index.json', evidenceIndex)}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-foreground/[0.14] px-3 text-sm font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.06]"
              >
                <FileArchive className="h-4 w-4" />
                Evidence index
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadJson('buyer-ready-package-summary.json', buildPackageSummaryDownload(payload))
                }
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <ClipboardList className="h-4 w-4" />
                Package summary
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Valuation range" value={summary.valuationRange} icon={Scale} />
          <Metric
            label="Sellability"
            value={summary.sellabilityScore === null ? '-' : `${summary.sellabilityScore}/100`}
            icon={ShieldCheck}
          />
          <Metric
            label="Readiness"
            value={summary.completionPct === null ? '-' : `${summary.completionPct}%`}
            icon={CheckCircle2}
          />
          <Metric label="Vault docs" value={String(summary.vaultDocumentCount)} icon={FolderOpen} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <SectionShell title="Deliverable state" icon={ClipboardList}>
              <div className="grid gap-3 md:grid-cols-2">
                <DeliverableCard
                  title="Information memorandum"
                  status={payload.im?.status ?? readiness?.teaserImDraft.status ?? 'missing'}
                  detail={
                    payload.im
                      ? `Version ${payload.im.version} with ${summary.imSectionCount} sections`
                      : readiness?.teaserImDraft.summary || 'No IM draft available'
                  }
                />
                <DeliverableCard
                  title="Missing-doc checklist"
                  status={readiness?.outputs.missingDocumentList ?? 'missing'}
                  detail={`${summary.missingDocumentCount} open item${
                    summary.missingDocumentCount === 1 ? '' : 's'
                  }`}
                />
                <DeliverableCard
                  title="Buyer FAQ"
                  status={readiness?.outputs.buyerFaq ?? 'missing'}
                  detail={`${readiness?.buyerFaq.length ?? 0} prepared answer${
                    readiness?.buyerFaq.length === 1 ? '' : 's'
                  }`}
                />
                <DeliverableCard
                  title="Handoff package"
                  status={summary.legalHandoffReady ? 'complete' : 'needs_attention'}
                  detail={readiness?.handoff.detail ?? 'No legal handoff status available'}
                />
              </div>
            </SectionShell>

            <SectionShell title="Normalised EBITDA bridge" icon={Landmark}>
              {bridge?.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-foreground/[0.08] text-xs uppercase tracking-[0.12em] text-foreground/45">
                      <tr>
                        <th className="py-2 pr-3 font-semibold">Step</th>
                        <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                        <th className="py-2 pr-3 font-semibold">Evidence</th>
                        <th className="py-2 font-semibold">Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bridge.rows.map((row) => (
                        <tr key={row.key} className="border-b border-foreground/[0.06] last:border-0">
                          <td className="py-3 pr-3 font-medium text-foreground/80">{row.label}</td>
                          <td className="py-3 pr-3 text-right font-mono text-foreground/70">
                            {formatMoney(row.amount, locale)}
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant={statusVariant(row.evidenceStatus)} size="sm">
                              {statusLabel(row.evidenceStatus)}
                            </Badge>
                          </td>
                          <td className="py-3 text-foreground/60">{row.rationale ?? row.source ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={Landmark}
                  title="Bridge pending"
                  detail={readiness?.normalizedEarnings.status ?? 'No EBITDA bridge rows available'}
                />
              )}
            </SectionShell>

            <SectionShell title="Information memorandum" icon={FileText}>
              {imSections.length ? (
                <div className="space-y-3">
                  {imSections.slice(0, 5).map((section) => (
                    <ImSectionPreview key={section.section_key} section={section} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title={readiness?.teaserImDraft.title ?? 'IM draft pending'}
                  detail={readiness?.teaserImDraft.summary ?? 'No generated IM snapshot available yet'}
                />
              )}
            </SectionShell>
          </div>

          <aside className="space-y-5">
            <SectionShell title="Readiness score" icon={CheckCircle2}>
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="text-sm text-foreground/55">Completion</span>
                  <span className="font-mono text-2xl font-semibold text-foreground">
                    {summary.completionPct ?? '-'}{summary.completionPct === null ? '' : '%'}
                  </span>
                </div>
                <Progress
                  value={summary.completionPct ?? 0}
                  size="sm"
                  variant={
                    (summary.completionPct ?? 0) >= 75
                      ? 'success'
                      : (summary.completionPct ?? 0) >= 50
                        ? 'warning'
                        : 'error'
                  }
                />
                <p className="text-sm leading-6 text-foreground/60">
                  {readiness?.summary.complete ?? 0} complete, {readiness?.summary.needsAttention ?? 0}{' '}
                  needs attention, {readiness?.summary.missing ?? 0} missing
                </p>
              </div>
            </SectionShell>

            <SectionShell title="Missing documents" icon={AlertTriangle}>
              {(readiness?.missingDocChecklist?.items ?? []).length > 0 ? (
                <div className="space-y-2">
                  {readiness?.missingDocChecklist?.items.slice(0, 8).map((item) => (
                    <DocumentChecklistRow
                      key={item.category}
                      label={statusLabel(item.category)}
                      status={item.status}
                      detail={item.reason}
                    />
                  ))}
                </div>
              ) : readiness?.missingDocuments.length ? (
                <div className="space-y-2">
                  {readiness.missingDocuments.slice(0, 8).map((item) => (
                    <DocumentChecklistRow
                      key={item.key}
                      label={item.label}
                      status={item.status === 'complete' ? 'green' : 'red'}
                      detail={item.reason}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={CheckCircle2} title="No open document gaps" detail="Checklist is green" />
              )}
            </SectionShell>

            <SectionShell title="WC and tax" icon={Scale}>
              <div className="space-y-3">
                <div className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
                  <p className="text-xs text-foreground/45">Working-capital peg</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {payload.wcTax?.wcPeg ? formatMoney(payload.wcTax.wcPeg.target_eur, locale) : '-'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-foreground/55">
                    {payload.wcTax?.wcPeg?.one_liner ?? readiness?.workingCapital?.detail ?? 'No peg available'}
                  </p>
                </div>
                <div className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
                  <p className="text-xs text-foreground/45">Tax latency</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {payload.wcTax?.taxLatency.flag_count ?? readiness?.normalizedEarnings.taxLatencyCount ?? 0}{' '}
                    flag
                    {(payload.wcTax?.taxLatency.flag_count ??
                      readiness?.normalizedEarnings.taxLatencyCount ??
                      0) === 1
                      ? ''
                      : 's'}
                  </p>
                </div>
              </div>
            </SectionShell>
          </aside>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <SectionShell title="Vault" icon={FolderOpen}>
            {payload.vaultDocs.length ? (
              <div className="space-y-4">
                {Object.entries(vaultByCategory).map(([category, docs]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/45">
                      {statusLabel(category)}
                    </h3>
                    <div className="mt-2 space-y-2">
                      {docs.slice(0, 4).map((doc) => (
                        <VaultDocRow key={doc.id} doc={doc} locale={locale} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={FolderOpen} title="Vault is empty" detail="No readiness documents uploaded" />
            )}
          </SectionShell>

          <SectionShell title="Readiness case workflow" icon={ShieldCheck}>
            {payload.readinessCase ? (
              <div className="space-y-3">
                {payload.readinessCase.tasks.slice(0, 8).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground/85">{task.title}</p>
                        <p className="mt-1 text-xs text-foreground/50">
                          {statusLabel(task.assigneeRole)} · {task.deadlineAt ? formatDate(task.deadlineAt, locale) : 'No deadline'}
                        </p>
                      </div>
                      <Badge variant={statusVariant(task.status as BuyerReadinessItemStatus)} size="sm">
                        {statusLabel(task.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="Case workflow pending"
                detail="No durable readiness case attached"
              />
            )}
          </SectionShell>
        </section>
      </div>
    </div>
  )
}

function Metric({
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

function SectionShell({
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

function DeliverableCard({
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

function ImSectionPreview({ section }: { section: BuyerReadyImSection }) {
  return (
    <article className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{section.heading}</h3>
        <Badge variant={section.confidence === 'high' ? 'success' : section.confidence === 'medium' ? 'warning' : 'destructive'} size="sm">
          {section.confidence}
        </Badge>
      </div>
      <div className="mt-2 space-y-2">
        {section.narrative_paragraphs.slice(0, 2).map((paragraph, index) => (
          <p key={`${section.section_key}-${index}`} className="text-sm leading-6 text-foreground/65">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  )
}

function DocumentChecklistRow({
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

function VaultDocRow({ doc, locale }: { doc: BuyerReadyVaultDoc; locale: string }) {
  return (
    <div className="rounded-lg border border-foreground/[0.08] bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground/85">{doc.filename}</p>
          <p className="mt-1 text-xs text-foreground/50">
            v{doc.version} · {formatDate(doc.uploaded_at, locale)}
          </p>
        </div>
        <Badge variant={doc.access_gate === 'after_nda' ? 'warning' : 'success'} size="sm">
          {doc.access_gate === 'after_nda' ? 'NDA' : 'Teaser'}
        </Badge>
      </div>
    </div>
  )
}

function EmptyState({
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

function RoomSkeleton() {
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

function RoomError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
