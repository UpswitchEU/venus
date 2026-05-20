'use client'

import { useTranslations } from 'next-intl'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'
import type { NormalizationItem } from './UnifiedNormalizationTypes'

export interface CrossYearPendingNormalizationGroup {
  sample: NormalizationItem
  ids: string[]
  years: number[]
}

interface UnifiedNormalizationCrossYearSuggestionsProps {
  groups: CrossYearPendingNormalizationGroup[]
  getLedgerDisplayName: (ledgerCode?: string, ledgerName?: string) => string
  onRejectGroup: (ids: string[]) => void
  onReviewGroup: (sample: NormalizationItem) => void
}

export function UnifiedNormalizationCrossYearSuggestions({
  groups,
  getLedgerDisplayName,
  onRejectGroup,
  onReviewGroup,
}: UnifiedNormalizationCrossYearSuggestionsProps) {
  const nh = useTranslations('normalizationHub')

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="mb-3 rounded-xl border border-warning/20 bg-warning/[0.03] overflow-hidden">
      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-warning/80 border-b border-warning/15 bg-warning/[0.04]">
        {nh('crossYearSuggestionsTitle', {
          count: groups.length,
        })}
      </div>
      <div className="divide-y divide-warning/10">
        {groups.map((bucket) => {
          const code = bucket.sample.ledgerCode
          const ledgerLabel = getLedgerDisplayName(
            bucket.sample.ledgerCode,
            bucket.sample.ledgerName
          )
          const yearsLabel =
            bucket.years.length > 1
              ? `${bucket.years[bucket.years.length - 1]}-${bucket.years[0]} (${bucket.years.length})`
              : String(bucket.years[0] ?? '')

          return (
            <div
              key={bucket.ids.join(',')}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.08] text-foreground/70">
                    {code}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium text-foreground min-w-0',
                      LEDGER_LABEL_TEXT_CLASSES
                    )}
                    title={ledgerLabel}
                  >
                    {ledgerLabel}
                  </span>
                  <span className="text-[11px] text-foreground/55">{yearsLabel}</span>
                </div>
                {bucket.sample.reason && (
                  <p
                    className={cn('mt-1 text-xs text-foreground/55', LEDGER_LABEL_TEXT_CLASSES)}
                    title={bucket.sample.reason}
                  >
                    {bucket.sample.reason}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onRejectGroup(bucket.ids)}
                  className="h-7 px-2.5 rounded-md text-[11px] font-medium text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                >
                  {nh('actions.reject')}
                </button>
                <button
                  type="button"
                  onClick={() => onReviewGroup(bucket.sample)}
                  className="h-7 px-3 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {nh('actions.review')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
