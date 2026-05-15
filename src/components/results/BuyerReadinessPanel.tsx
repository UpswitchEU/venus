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
  const missingDocs = readiness.missingDocuments.slice(0, 3)
  const buyerFaq = readiness.buyerFaq.slice(0, 2)
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
          value={String(readiness.missingDocuments.length)}
          detail={t('missingCount', { count: readiness.missingDocuments.length })}
        />
        <MetricBlock
          icon={Database}
          label={t('metrics.privateComps')}
          value={readiness.privateComps.eligible ? t('readyShort') : t('notReadyShort')}
          detail={readiness.privateComps.suggestedPayload.observation_type}
        />
      </div>

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
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t('actionList')}
          </h4>
          <ul className="space-y-2">
            {(topActions.length > 0 ? topActions : missingDocs).map((item, index) => {
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
            {topActions.length === 0 && missingDocs.length === 0 ? (
              <li className="text-sm text-foreground/60">{t('noOpenActions')}</li>
            ) : null}
          </ul>
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
