'use client'

import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type { ImportQualityPerYear } from '@/store/useImportQualityStore'
import type { YearlyFinancials } from '../../../types/valuation'

interface AccountingYearEvidenceProps {
  /** The year card already explains why this year needs attention; don't say it twice. */
  attentionExplained?: boolean
  formatCurrency: (amount: number) => string
  importQuality?: ImportQualityPerYear
  yearData: YearlyFinancials
}

type EvidenceTone = 'attention' | 'corrected' | 'confirmed' | 'edited'

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
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(parsed)
}

/** A 1 Jan – 31 Dec period of the row's own year says nothing the year label doesn't. */
function isCalendarYearPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  year: string | number
): boolean {
  return (
    typeof start === 'string' &&
    typeof end === 'string' &&
    start.startsWith(`${year}-01-01`) &&
    end.startsWith(`${year}-12-31`)
  )
}

function valuesDiffer(source: number | null, effective: number): boolean {
  return source !== null && Number.isFinite(effective) && Math.abs(source - effective) > 0.005
}

/**
 * Per-year source note. The section header already names the accounting source and
 * when it synced, so a clean imported year shows nothing here: the year speaks only
 * when it needs attention, was corrected or confirmed, or differs from the import.
 */
export function AccountingYearEvidence({
  attentionExplained = false,
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
  const isConfirmed = yearData.quality_state === 'attested_review'
  const showsComparison =
    (isCorrected || hasChangedValue) && (sourceRevenue !== null || sourceEbitda !== null)

  const tone: EvidenceTone | null =
    isBlocked || needsReview
      ? 'attention'
      : isCorrected
        ? 'corrected'
        : isConfirmed
          ? 'confirmed'
          : showsComparison
            ? 'edited'
            : null
  if (!tone) return null
  const showsStatus = !(tone === 'attention' && attentionExplained)
  if (!showsStatus && !showsComparison) return null

  const statusLabel = isBlocked
    ? copy('statusBlocked')
    : hasSourceWarning
      ? copy('statusWarning')
      : needsReview
        ? copy('statusReview')
        : isCorrected
          ? copy('statusCorrected')
          : isConfirmed
            ? copy('statusAttested')
            : copy('statusEdited')
  const showsPeriod =
    tone === 'attention' &&
    showsStatus &&
    !isCalendarYearPeriod(provenance?.period_start_date, provenance?.period_end_date, yearData.year)
  const periodStart = showsPeriod ? formatEvidenceDate(provenance?.period_start_date, locale) : null
  const periodEnd = showsPeriod ? formatEvidenceDate(provenance?.period_end_date, locale) : null
  const coverage = provenance?.account_mapping_coverage_pct
  const showsCoverage =
    tone === 'attention' &&
    showsStatus &&
    typeof coverage === 'number' &&
    Number.isFinite(coverage) &&
    coverage < 95
  const Icon = tone === 'attention' ? ShieldAlert : ShieldCheck

  return (
    <div className="mb-3 text-[11px]" aria-label={copy('ariaLabel', { year: yearData.year })}>
      {showsStatus ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold',
              tone === 'attention'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : tone === 'corrected' || tone === 'edited'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {statusLabel}
          </span>
          {periodStart && periodEnd ? (
            <span className="text-foreground/50">
              {copy('periodRange', { start: periodStart, end: periodEnd })}
            </span>
          ) : null}
          {showsCoverage ? (
            <span className="text-foreground/50">
              {copy('coverage', { value: Math.round(coverage as number) })}
            </span>
          ) : null}
        </div>
      ) : null}

      {showsComparison ? (
        <div
          className={cn(
            'grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border border-foreground/[0.08] bg-background/70 px-2.5 py-2',
            showsStatus && 'mt-2'
          )}
        >
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
