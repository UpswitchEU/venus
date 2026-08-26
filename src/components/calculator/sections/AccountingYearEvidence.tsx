'use client'

import { ArrowRight, Database, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type { ImportQualityPerYear } from '@/store/useImportQualityStore'
import type { YearlyFinancials } from '../../../types/valuation'

interface AccountingYearEvidenceProps {
  formatCurrency: (amount: number) => string
  importQuality?: ImportQualityPerYear
  yearData: YearlyFinancials
}

type EvidenceTone = 'blocked' | 'corrected' | 'ready' | 'review' | 'source'

function normalizeFieldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function sourceFactValue(
  quality: ImportQualityPerYear | undefined,
  field: 'ebitda' | 'revenue'
): number | null {
  const aliases =
    field === 'revenue' ? new Set(['revenue', 'turnover', 'omzet']) : new Set(['ebitda'])
  const provenance = quality?.field_provenance.find((item) =>
    aliases.has(normalizeFieldName(item.field))
  )
  return typeof provenance?.value === 'number' && Number.isFinite(provenance.value)
    ? provenance.value
    : null
}

function formatEvidenceDate(value: string | null | undefined, locale: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(parsed)
}

function formatEvidenceTimestamp(value: string | null | undefined, locale: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function valuesDiffer(source: number | null, effective: number): boolean {
  return source !== null && Number.isFinite(effective) && Math.abs(source - effective) > 0.005
}

export function AccountingYearEvidence({
  formatCurrency,
  importQuality,
  yearData,
}: AccountingYearEvidenceProps) {
  const locale = useLocale()
  const copy = useTranslations('manualInput.sourceEvidence')
  const provenance = importQuality?.source_provenance
  const provider = yearData.source_provider ?? provenance?.provider
  const isImported = yearData.source_kind !== 'manual' && Boolean(provider || importQuality)

  if (yearData.isForecast || !isImported) return null

  const sourceRevenue = sourceFactValue(importQuality, 'revenue')
  const sourceEbitda = sourceFactValue(importQuality, 'ebitda')
  const hasChangedValue =
    valuesDiffer(sourceRevenue, yearData.revenue) || valuesDiffer(sourceEbitda, yearData.ebitda)
  const isCorrected =
    yearData.quality_state === 'advisor_corrected' || Boolean(yearData.correction_id)
  const isBlocked = yearData.quality_state === 'blocked' || Boolean(yearData.eligibility_reason)
  const hasSourceWarning =
    yearData.quality_state === 'source_warning' ||
    yearData.warning_codes?.includes('EXTREME_EBITDA_MARGIN') === true
  const needsReview = yearData.quality_state === 'needs_review' || hasSourceWarning

  const tone: EvidenceTone = isBlocked
    ? 'blocked'
    : isCorrected
      ? 'corrected'
      : needsReview
        ? 'review'
        : yearData.quality_state === 'ready' || yearData.quality_state === 'attested_review'
          ? 'ready'
          : 'source'
  const statusLabel = isBlocked
    ? copy('statusBlocked')
    : isCorrected
      ? copy('statusCorrected')
      : yearData.quality_state === 'attested_review'
        ? copy('statusAttested')
        : hasSourceWarning
          ? copy('statusWarning')
          : needsReview
            ? copy('statusReview')
            : yearData.quality_state === 'ready'
              ? copy('statusReady')
              : copy('statusAvailable')
  const periodStart = formatEvidenceDate(provenance?.period_start_date, locale)
  const periodEnd = formatEvidenceDate(provenance?.period_end_date, locale)
  const syncedAt = formatEvidenceTimestamp(
    yearData.source_synced_at ?? provenance?.fetched_at ?? importQuality?.fetched_at,
    locale
  )
  const coverage = provenance?.account_mapping_coverage_pct
  const Icon = tone === 'blocked' || tone === 'review' ? ShieldAlert : ShieldCheck
  const providerLabel = provider?.trim() || copy('providerUnknown')

  return (
    <div
      className={cn(
        'mb-3 rounded-lg border px-2.5 py-2 text-[11px]',
        tone === 'blocked'
          ? 'border-amber-500/30 bg-amber-500/[0.06]'
          : tone === 'review'
            ? 'border-amber-500/20 bg-amber-500/[0.04]'
            : tone === 'corrected'
              ? 'border-primary/25 bg-primary/[0.05]'
              : 'border-foreground/[0.08] bg-background/70'
      )}
      aria-label={copy('ariaLabel', { year: yearData.year })}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground/75">
          <Database className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{providerLabel}</span>
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold',
            tone === 'blocked' || tone === 'review'
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : tone === 'corrected'
                ? 'bg-primary/10 text-primary'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {statusLabel}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-foreground/50">
        {periodStart && periodEnd ? (
          <span>{copy('periodRange', { start: periodStart, end: periodEnd })}</span>
        ) : provenance?.period_id ? (
          <span>{copy('periodId', { id: provenance.period_id })}</span>
        ) : null}
        {syncedAt ? <span>{copy('syncedAt', { date: syncedAt })}</span> : null}
        {typeof coverage === 'number' && Number.isFinite(coverage) ? (
          <span>{copy('coverage', { value: Math.round(coverage) })}</span>
        ) : null}
      </div>

      {(isCorrected || hasChangedValue) && (sourceRevenue !== null || sourceEbitda !== null) ? (
        <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-foreground/[0.08] pt-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground/50">{copy('sourceValues')}</p>
            <p className="mt-0.5 truncate font-mono tabular-nums text-foreground/70">
              {copy('revenueShort')} {sourceRevenue === null ? '—' : formatCurrency(sourceRevenue)}
            </p>
            <p className="truncate font-mono tabular-nums text-foreground/70">
              {copy('ebitdaShort')} {sourceEbitda === null ? '—' : formatCurrency(sourceEbitda)}
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-foreground/30" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-foreground/50">{copy('effectiveValues')}</p>
            <p className="mt-0.5 truncate font-mono tabular-nums text-foreground">
              {copy('revenueShort')} {formatCurrency(yearData.revenue)}
            </p>
            <p className="truncate font-mono tabular-nums text-foreground">
              {copy('ebitdaShort')} {formatCurrency(yearData.ebitda)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
