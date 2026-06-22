import { AlertTriangle } from 'lucide-react'
import type { TaxLatencyItem } from '../../store/useTaxLatencyStore'

type TaxLatencyTranslator = (key: string, values?: Record<string, string | number | Date>) => string

interface TaxLatencyConflictBannerProps {
  conflictingLatencyItems: TaxLatencyItem[]
  navTaxLatencyPct?: number | null
  t: TaxLatencyTranslator
}

export function TaxLatencyConflictBanner({
  conflictingLatencyItems,
  navTaxLatencyPct,
  t,
}: TaxLatencyConflictBannerProps) {
  if (conflictingLatencyItems.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/15 dark:border-amber-700/40 p-3 mb-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1 min-w-0">
          <p className="font-semibold">{t('navConflictTitle')}</p>
          <p className="text-amber-900/80 dark:text-amber-200/80">
            {t('navConflictBodyPrefix', { rate: navTaxLatencyPct ?? 0 })}
            <span className="font-medium">
              {conflictingLatencyItems
                .map((item) => item.accountCode || item.description)
                .filter(Boolean)
                .join(', ')}
            </span>
            {t('navConflictBodySuffix')}
          </p>
        </div>
      </div>
    </div>
  )
}
