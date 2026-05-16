'use client'

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Database,
  FileText,
  type LucideIcon,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { memo } from 'react'
import { cn } from '@/design-system/utils'
import type {
  BuyerReadinessItemStatus,
  BuyerReadinessOverallStatus,
  BuyerReadinessPackage,
} from '../../types/buyerReadiness'

interface BuyerReadinessPanelProps {
  readiness: BuyerReadinessPackage | null | undefined
}

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
  }).format(value)
}

function statusClass(status: BuyerReadinessOverallStatus): string {
  switch (status) {
    case 'ready':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
    case 'needs_attention':
      return 'border-amber-500/35 bg-amber-500/10 text-amber-800'
    case 'blocked':
      return 'border-red-500/35 bg-red-500/10 text-red-800'
  }
}

function itemIcon(status: BuyerReadinessItemStatus) {
  if (status === 'complete') return CheckCircle2
  if (status === 'needs_attention') return AlertTriangle
  return CircleDashed
}

function itemClass(status: BuyerReadinessItemStatus): string {
  if (status === 'complete') return 'text-emerald-700'
  if (status === 'needs_attention') return 'text-amber-700'
  return 'text-red-700'
}

function BuyerReadinessPanelInner({ readiness }: BuyerReadinessPanelProps) {
  const t = useTranslations('reportPreview.buyerReadiness')
  if (!readiness) return null

  const normalized = readiness.normalizedEarnings
  const topActions = readiness.sellability?.topActions.slice(0, 3) ?? []
  const plannedActions = readiness.sellabilityPlan?.actions.slice(0, 3) ?? []
  const actionItems = plannedActions.length > 0 ? plannedActions : topActions
  const sellabilityDrivers =
    readiness.sellabilityPlan?.factorBreakdown
      .filter((factor) => factor.status !== 'complete')
      .slice(0, 3) ?? []
  const commercialReadiness = readiness.commercialReadiness
  const commercialSignals =
    commercialReadiness?.signals.filter((signal) => signal.status !== 'complete').slice(0, 4) ?? []
  const missingDocs = readiness.missingDocuments.slice(0, 3)
  const dataRoomPlan = readiness.dataRoomPlan
  const dataRoomSections = dataRoomPlan?.sections.slice(0, 4) ?? []
  const buyerFaq = readiness.buyerFaq.slice(0, 2)
  const bridgeRows = readiness.normalizationBridge?.rows.slice(0, 3) ?? []
  const workingCapital = readiness.workingCapital
  const workingCapitalEvidence = workingCapital?.evidence.slice(0, 3) ?? []
  const teaserDraft = readiness.teaserImDraft
  const teaserHighlights = teaserDraft?.highlights.slice(0, 3) ?? []
  const teaserNextSteps = teaserDraft?.nextSteps.slice(0, 2) ?? []
  const StatusIcon = readiness.status === 'ready' ? CheckCircle2 : AlertTriangle

  return (
    <section
      aria-labelledby="venus-buyer-readiness-heading"
      className="rounded-lg border border-foreground/[0.08] bg-background px-4 py-4 shadow-sm"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-md border border-primary/15 bg-primary/10 p-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3
              id="venus-buyer-readiness-heading"
              className="text-sm font-semibold text-foreground"
            >
              {t('title')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              {readiness.handoff.detail}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
              statusClass(readiness.status)
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden />
            {t(`status.${readiness.status}`)}
          </span>
          <span className="rounded-md border border-foreground/[0.08] bg-foreground/[0.03] px-2.5 py-1 text-xs font-medium text-foreground/70">
            {t('completion', { percent: readiness.completionPct })}
          </span>
        </div>
      </header>

      <div className="mt-4 grid border-y border-foreground/[0.08] text-sm md:grid-cols-4">
        <MetricBlock
          icon={TrendingUp}
          label={t('metrics.normalizedEbitda')}
          value={formatEur(normalized.normalizedEbitda ?? normalized.reportedEbitda)}
          detail={t(`normalizedStatus.${normalized.status}`)}
        />
        <MetricBlock
          icon={ShieldCheck}
          label={t('metrics.sellability')}
          value={readiness.sellability ? `${readiness.sellability.score}/100` : t('notRun')}
          detail={readiness.sellability ? readiness.sellability.band : t('sellabilityMissing')}
        />
        <MetricBlock
          icon={ClipboardList}
          label={t('metrics.dataRoom')}
          value={
            dataRoomPlan
              ? `${dataRoomPlan.readyCount}/${dataRoomPlan.totalRequired}`
              : String(readiness.missingDocuments.length)
          }
          detail={
            dataRoomPlan
              ? t('dataRoomReady', {
                  ready: dataRoomPlan.readyCount,
                  total: dataRoomPlan.totalRequired,
                })
              : t('missingCount', { count: readiness.missingDocuments.length })
          }
        />
        <MetricBlock
          icon={Database}
          label={t('metrics.privateComps')}
          value={readiness.privateComps.eligible ? t('readyShort') : t('notReadyShort')}
          detail={readiness.privateComps.suggestedPayload.observation_type}
        />
      </div>

      {teaserDraft && teaserDraft.status !== 'missing' ? (
        <div className="mt-4 rounded-md border border-foreground/[0.08] bg-foreground/[0.02] p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {t('teaserDraft')}
              </h4>
              <div className="mt-1 text-sm font-semibold text-foreground">{teaserDraft.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/60">
                {teaserDraft.summary}
              </p>
            </div>
            <span className={cn('shrink-0 text-xs font-medium', itemClass(teaserDraft.status))}>
              {t(`itemStatus.${teaserDraft.status}`)}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ul className="space-y-1.5">
              {teaserHighlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex gap-2 text-xs leading-relaxed text-foreground/60"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1.5">
              {teaserNextSteps.map((step) => (
                <li key={step} className="flex gap-2 text-xs leading-relaxed text-foreground/60">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/35" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            {t('earningsBridge')}
          </h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <ReadinessPair
              label={t('reportedEbitda')}
              value={formatEur(normalized.reportedEbitda)}
            />
            <ReadinessPair
              label={t('normalizedEbitda')}
              value={formatEur(normalized.normalizedEbitda)}
            />
            <ReadinessPair label={t('adjustments')} value={String(normalized.adjustmentCount)} />
            <ReadinessPair label={t('taxLatencies')} value={String(normalized.taxLatencyCount)} />
            {workingCapital ? (
              <ReadinessPair
                label={t('workingCapital')}
                value={formatEur(workingCapital.currentNwc ?? workingCapital.nwcSurplusDeficit)}
              />
            ) : null}
            {workingCapital ? (
              <ReadinessPair
                label={t('actualNwcYears')}
                value={String(workingCapital.actualNwcYears)}
              />
            ) : null}
          </dl>
          {normalized.categories.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {normalized.categories.slice(0, 4).map((category) => (
                <span
                  key={category}
                  className="rounded-md bg-foreground/[0.05] px-2 py-1 text-[11px] font-medium text-foreground/65"
                >
                  {category}
                </span>
              ))}
            </div>
          ) : null}
          {bridgeRows.length > 0 ? (
            <div className="mt-3 rounded-md border border-foreground/[0.08] bg-foreground/[0.02]">
              <div className="border-b border-foreground/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                {t('adjustmentAuditTrail')}
              </div>
              <div className="divide-y divide-foreground/[0.06]">
                {bridgeRows.map((row) => (
                  <div
                    key={row.key}
                    className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{row.label}</div>
                      <div className="truncate text-foreground/50">{row.category}</div>
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-foreground/70">
                      {formatEur(row.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {workingCapital && workingCapital.status !== 'missing' ? (
            <div className="mt-3 rounded-md border border-foreground/[0.08] bg-foreground/[0.02] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                    {t('workingCapital')}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/60">
                    {workingCapital.detail}
                  </p>
                </div>
                <span
                  className={cn('shrink-0 text-xs font-medium', itemClass(workingCapital.status))}
                >
                  {t(`itemStatus.${workingCapital.status}`)}
                </span>
              </div>
              {workingCapitalEvidence.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {workingCapitalEvidence.map((item) => (
                    <span
                      key={item}
                      className="rounded-md bg-foreground/[0.05] px-2 py-1 text-[11px] font-medium text-foreground/60"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t('actionList')}
          </h4>
          <ul className="space-y-2">
            {(actionItems.length > 0 ? actionItems : missingDocs).map((item, index) => {
              const action = 'action' in item ? item.action : item.label
              const detail = 'eurImpact' in item ? formatEur(item.eurImpact) : item.reason
              return (
                <li key={`${action}-${index}`} className="flex gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{action}</span>
                    <span className="block text-xs leading-relaxed text-foreground/55">
                      {detail}
                    </span>
                  </span>
                </li>
              )
            })}
            {actionItems.length === 0 && missingDocs.length === 0 ? (
              <li className="text-sm text-foreground/60">{t('noOpenActions')}</li>
            ) : null}
          </ul>
          {sellabilityDrivers.length > 0 ? (
            <div className="mt-3 rounded-md border border-foreground/[0.08] bg-foreground/[0.02]">
              <div className="border-b border-foreground/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                {t('sellabilityDrivers')}
              </div>
              <div className="divide-y divide-foreground/[0.06]">
                {sellabilityDrivers.map((factor) => (
                  <div
                    key={factor.key}
                    className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{factor.label}</div>
                      <div className="truncate text-foreground/50">{factor.detail}</div>
                    </div>
                    <div
                      className={cn(
                        'font-mono font-semibold tabular-nums',
                        itemClass(factor.status)
                      )}
                    >
                      {factor.score != null ? `${factor.score}/100` : 'n/a'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {commercialReadiness ? (
            <div className="mt-3 rounded-md border border-foreground/[0.08] bg-foreground/[0.02]">
              <div className="flex items-center justify-between gap-3 border-b border-foreground/[0.06] px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                  {t('commercialReadiness')}
                </div>
                <div className={cn('text-xs font-medium', itemClass(commercialReadiness.status))}>
                  {t('commercialSignalsReady', {
                    ready: commercialReadiness.readyCount,
                    total: commercialReadiness.totalRequired,
                  })}
                </div>
              </div>
              <div className="divide-y divide-foreground/[0.06]">
                {(commercialSignals.length > 0
                  ? commercialSignals
                  : commercialReadiness.signals.slice(0, 3)
                ).map((signal) => {
                  const Icon = itemIcon(signal.status)
                  return (
                    <div
                      key={signal.key}
                      className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{signal.label}</div>
                        <div className="truncate text-foreground/50">
                          {signal.value ?? signal.detail}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'inline-flex items-center gap-1 font-medium',
                          itemClass(signal.status)
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {t(`itemStatus.${signal.status}`)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-foreground/[0.08] pt-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2">
          {readiness.checklist.slice(0, 4).map((item) => {
            const Icon = itemIcon(item.status)
            return (
              <div key={item.key} className="flex items-start gap-2 text-sm">
                <Icon
                  className={cn('mt-0.5 h-4 w-4 shrink-0', itemClass(item.status))}
                  aria-hidden
                />
                <div>
                  <div className="font-medium text-foreground">{item.label}</div>
                  <div className="text-xs leading-relaxed text-foreground/55">{item.detail}</div>
                </div>
              </div>
            )
          })}
          {dataRoomSections.length > 0 ? (
            <div className="mt-3 rounded-md border border-foreground/[0.08] bg-foreground/[0.02]">
              <div className="border-b border-foreground/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                {t('dataRoomPlan')}
              </div>
              <div className="divide-y divide-foreground/[0.06]">
                {dataRoomSections.map((section) => {
                  const Icon = itemIcon(section.status)
                  return (
                    <div
                      key={section.key}
                      className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{section.label}</div>
                        <div className="truncate text-foreground/50">
                          {t('dataRoomSectionItems', { count: section.items.length })}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'inline-flex items-center gap-1 font-medium',
                          itemClass(section.status)
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {t(`itemStatus.${section.status}`)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          {buyerFaq.map((item) => (
            <div key={item.question} className="text-sm">
              <div className="font-medium text-foreground">{item.question}</div>
              <div className="text-xs leading-relaxed text-foreground/55">{item.answer}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MetricBlock({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="border-b border-foreground/[0.08] py-3 md:border-b-0 md:border-r md:px-3 md:last:border-r-0">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground/55">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="truncate text-base font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-xs text-foreground/50">{detail}</div>
    </div>
  )
}

function ReadinessPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-foreground/50">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}

export const BuyerReadinessPanel = memo(BuyerReadinessPanelInner)
BuyerReadinessPanel.displayName = 'BuyerReadinessPanel'
