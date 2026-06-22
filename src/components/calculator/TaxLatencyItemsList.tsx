import { AnimatePresence } from 'framer-motion'
import { cn } from '@/design-system/utils'
import { formatCurrencyTaxLatency, type TaxLatencyItem } from '../../store/useTaxLatencyStore'
import { TaxLatencyRow } from './TaxLatencyRow'

type TaxLatencyTranslator = (key: string) => string

interface TaxLatencyItemsListProps {
  currencyLocale: string
  items: TaxLatencyItem[]
  netImpact: number
  onEdit: (item: TaxLatencyItem) => void
  onRemove: (id: string) => void
  t: TaxLatencyTranslator
}

export function TaxLatencyItemsList({
  currencyLocale,
  items,
  netImpact,
  onEdit,
  onRemove,
  t,
}: TaxLatencyItemsListProps) {
  const hasItems = items.length > 0

  return (
    <div className="space-y-1.5 mt-4">
      {hasItems && (
        <div className="hidden sm:grid sm:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_110px_70px_110px_72px] items-center gap-3 px-3 h-8 text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
          <span className="min-w-[120px] flex-shrink-0">{t('type')}</span>
          <span className="min-w-0">{t('account')}</span>
          <span className="flex-1 min-w-0">{t('description')}</span>
          <span className="flex-shrink-0">{t('grossSurplusValue')}</span>
          <span className="w-12 text-right flex-shrink-0">{t('taxRate')}</span>
          <span className="min-w-[80px] text-right flex-shrink-0">{t('latencyAmount')}</span>
          <span className="w-[72px] flex-shrink-0" />
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <TaxLatencyRow
            key={item.id}
            item={item}
            currencyLocale={currencyLocale}
            onEdit={onEdit}
            onRemove={onRemove}
            t={t}
          />
        ))}
      </AnimatePresence>

      {!hasItems && (
        <div className="py-12 text-center">
          <p className="text-sm text-foreground/50 mb-1">{t('noItems')}</p>
          <p className="text-xs text-foreground/35">{t('noItemsDesc')}</p>
        </div>
      )}

      {hasItems && (
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-foreground/[0.06]">
          <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
            {t('netImpact')}
          </span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              netImpact > 0
                ? 'text-moss-600 dark:text-moss-400'
                : netImpact < 0
                  ? 'text-rust-600 dark:text-rust-400'
                  : 'text-foreground/50'
            )}
          >
            {netImpact > 0 ? '+' : ''}
            {formatCurrencyTaxLatency(netImpact, currencyLocale)}
          </span>
        </div>
      )}
    </div>
  )
}
