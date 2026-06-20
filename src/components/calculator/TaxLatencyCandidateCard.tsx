import { AlertTriangle, X } from 'lucide-react'
import { Badge } from '@/design-system/components/Badge'
import { formatCurrencyTaxLatency } from '../../store/useTaxLatencyStore'
import type { GroupedTaxLatencyCandidate } from './TaxLatencySection.utils'

type TaxLatencyTranslator = (key: string, values?: Record<string, string | number | Date>) => string

interface TaxLatencyCandidateCardProps {
  group: GroupedTaxLatencyCandidate
  currencyLocale: string
  onUse: (group: GroupedTaxLatencyCandidate) => void
  onDismiss: (ids: string[]) => void
  t: TaxLatencyTranslator
}

export function TaxLatencyCandidateCard({
  group,
  currencyLocale,
  onUse,
  onDismiss,
  t,
}: TaxLatencyCandidateCardProps) {
  const candidate = group.candidate
  const firstYear = group.years[0] ?? ''
  const lastYear = group.years[group.years.length - 1] ?? firstYear
  const isConsecutive =
    group.years.length > 1 &&
    group.years.every((year, idx) => idx === 0 || year === group.years[idx - 1] + 1)
  const yearLabel =
    group.years.length === 1
      ? t('candidateYear', { year: firstYear })
      : group.years.length > 1
        ? isConsecutive
          ? t('candidateYearsRange', {
              start: firstYear,
              end: lastYear,
              count: group.years.length,
            })
          : t('candidateYearsList', {
              years: group.years.join(', '),
              count: group.years.length,
            })
        : null

  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 dark:bg-amber-950/10 dark:border-amber-800/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-foreground">{candidate.suggestedQuestion}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <Badge variant="neutral" size="sm">
              {candidate.accountCode}
            </Badge>
            <span>{candidate.accountName}</span>
            {yearLabel ? <span>{yearLabel}</span> : null}
          </div>
          <p className="text-xs text-foreground/55">{candidate.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/55">
            <span>{t('candidateRate', { rate: candidate.taxRate })}</span>
            {candidate.temporaryDifference ? (
              <span>
                {t('candidateSurplus', {
                  amount: formatCurrencyTaxLatency(candidate.temporaryDifference, currencyLocale),
                })}
              </span>
            ) : null}
          </div>
          {candidate.rationale ? (
            <p className="text-xs text-foreground/45">{candidate.rationale}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(group.candidateIds)}
          className="p-1 rounded-md text-foreground/30 hover:text-foreground/60 hover:bg-background/70 transition-colors"
          aria-label={t('dismissSuggestion')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-end mt-3">
        <button
          type="button"
          onClick={() => onUse(group)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {candidate.autoApply && candidate.temporaryDifference
            ? t('applyCandidate')
            : t('reviewCandidate')}
        </button>
      </div>
    </div>
  )
}
