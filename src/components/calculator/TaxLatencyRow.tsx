import { motion } from 'framer-motion'
import { Edit3, Trash2 } from 'lucide-react'
import { forwardRef } from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import {
  calculateLatencyAmount,
  formatCurrencyTaxLatency,
  type TaxLatencyItem,
} from '../../store/useTaxLatencyStore'
import { getLedgerDisplayLabel } from './TaxLatencySection.utils'

type TaxLatencyTranslator = (key: string) => string

interface TaxLatencyRowProps {
  item: TaxLatencyItem
  currencyLocale: string
  onEdit: (item: TaxLatencyItem) => void
  onRemove: (id: string) => void
  t: TaxLatencyTranslator
}

export const TaxLatencyRow = forwardRef<HTMLDivElement, TaxLatencyRowProps>(function TaxLatencyRow(
  { item, currencyLocale, onEdit, onRemove, t },
  ref
) {
  const amount = calculateLatencyAmount(item)

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="group grid gap-3 px-3 py-3 rounded-lg border border-foreground/[0.08] bg-background/60 hover:border-foreground/[0.12] transition-colors sm:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_110px_70px_110px_72px]"
    >
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[120px] px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide',
          item.type === 'active'
            ? 'bg-moss-100 text-moss-700 dark:bg-moss-900/30 dark:text-moss-400'
            : 'bg-rust-100 text-rust-700 dark:bg-rust-900/30 dark:text-rust-400'
        )}
      >
        {item.type === 'active' ? t('typeActive') : t('typePassive')}
      </span>

      <span
        className={cn('min-w-0 text-sm text-foreground/80', LEDGER_LABEL_TEXT_CLASSES)}
        title={getLedgerDisplayLabel(item.accountCode, item.accountName)}
      >
        {getLedgerDisplayLabel(item.accountCode, item.accountName)}
      </span>

      <span
        className={cn('min-w-0 text-sm text-foreground/80', LEDGER_LABEL_TEXT_CLASSES)}
        title={
          typeof item.description === 'string' && item.description ? item.description : undefined
        }
      >
        {item.description || <span className="text-foreground/30 italic">&mdash;</span>}
      </span>

      <span className="text-xs font-mono tabular-nums text-foreground/60">
        {formatCurrencyTaxLatency(item.temporaryDifference, currencyLocale)}
      </span>

      <span className="text-xs font-mono tabular-nums text-foreground/50 w-12 text-right">
        {item.taxRate}%
      </span>

      <span
        className={cn(
          'text-xs font-bold tabular-nums whitespace-nowrap min-w-[80px] text-right',
          amount > 0
            ? 'text-moss-600 dark:text-moss-400'
            : amount < 0
              ? 'text-rust-600 dark:text-rust-400'
              : 'text-foreground/50'
        )}
      >
        {amount > 0 ? '+' : ''}
        {formatCurrencyTaxLatency(amount, currencyLocale)}
      </span>

      <div className="flex items-center gap-1 sm:justify-end lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="p-1.5 rounded-md text-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label={t('editItem')}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('editItem')}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="p-1.5 rounded-md text-foreground/30 hover:text-rust-600 hover:bg-rust-50 dark:hover:bg-rust-900/20 transition-colors"
                aria-label={t('removeItem')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('removeItem')}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      </div>
    </motion.div>
  )
})
