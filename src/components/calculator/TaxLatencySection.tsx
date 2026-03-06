'use client'

/**
 * Tax Latency Section
 *
 * Collapsible section within the Normalization Modal for deferred tax assets/liabilities.
 * Each item: Type (active/passive), Description, Temporary Difference (€), Tax Rate (%).
 * Calculation: Temporary Difference × Tax Rate = Latency Amount.
 * Active → adds to equity value, Passive → subtracts from equity value.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, HelpCircle, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import {
  type TaxLatencyItem,
  type TaxLatencyType,
  calculateLatencyAmount,
  getNetTaxLatencyImpact,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function generateId(): string {
  return `tl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

function formatCurrency(value: number, currencyLocale: string): string {
  return new Intl.NumberFormat(currencyLocale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// ─────────────────────────────────────────
// ITEM ROW
// ─────────────────────────────────────────

interface TaxLatencyRowProps {
  item: TaxLatencyItem
  currencyLocale: string
  onUpdate: (id: string, partial: Partial<TaxLatencyItem>) => void
  onRemove: (id: string) => void
  t: ReturnType<typeof useTranslations<'taxLatency'>>
}

function TaxLatencyRow({ item, currencyLocale, onUpdate, onRemove, t }: TaxLatencyRowProps) {
  const amount = calculateLatencyAmount(item)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="group rounded-lg border border-foreground/[0.08] bg-background/60 hover:border-foreground/[0.12] transition-colors"
    >
      {/* Compact row: all fields on one line for desktop, stacked on mobile */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-[140px_1fr_140px_100px_auto] gap-2 items-end">
        {/* Type */}
        <div>
          <label className="block text-[11px] font-medium text-foreground/50 mb-1 uppercase tracking-wide">
            {t('type')}
          </label>
          <div className="relative">
            <select
              value={item.type}
              onChange={(e) => onUpdate(item.id, { type: e.target.value as TaxLatencyType })}
              className={cn(
                'w-full h-8 pl-2.5 pr-7 rounded-md text-xs font-medium appearance-none cursor-pointer',
                'bg-foreground/[0.04] border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none',
                item.type === 'active'
                  ? 'text-moss-700 dark:text-moss-400'
                  : 'text-rust-700 dark:text-rust-400'
              )}
            >
              <option value="active">{t('typeActive')}</option>
              <option value="passive">{t('typePassive')}</option>
            </select>
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/30 rotate-90 pointer-events-none" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-[11px] font-medium text-foreground/50 mb-1 uppercase tracking-wide">
            {t('description')}
          </label>
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate(item.id, { description: e.target.value })}
            placeholder={t('descriptionPlaceholder')}
            maxLength={200}
            className={cn(
              'w-full h-8 px-2.5 rounded-md text-xs',
              'bg-foreground/[0.04] border border-foreground/[0.08]',
              'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
              'transition-all outline-none placeholder:text-foreground/25'
            )}
          />
        </div>

        {/* Temporary Difference */}
        <div>
          <label className="block text-[11px] font-medium text-foreground/50 mb-1 uppercase tracking-wide">
            {t('temporaryDifference')}
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-foreground/40 font-medium">€</span>
            <input
              type="text"
              inputMode="decimal"
              value={item.temporaryDifference || ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, '')
                const val = raw === '' ? 0 : Number(raw.replace(',', '.'))
                if (!Number.isNaN(val)) onUpdate(item.id, { temporaryDifference: Math.abs(val) })
              }}
              className={cn(
                'w-full h-8 pl-6 pr-2.5 rounded-md text-xs tabular-nums text-right',
                'bg-foreground/[0.04] border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none'
              )}
            />
          </div>
        </div>

        {/* Tax Rate */}
        <div>
          <label className="block text-[11px] font-medium text-foreground/50 mb-1 uppercase tracking-wide">
            {t('taxRate')}
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={item.taxRate || ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, '')
                const val = raw === '' ? 0 : Number(raw.replace(',', '.'))
                if (!Number.isNaN(val)) onUpdate(item.id, { taxRate: Math.min(100, Math.max(0, val)) })
              }}
              className={cn(
                'w-full h-8 pl-2.5 pr-6 rounded-md text-xs tabular-nums text-right',
                'bg-foreground/[0.04] border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none'
              )}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-foreground/40 font-medium">%</span>
          </div>
        </div>

        {/* Result + delete */}
        <div className="flex items-end gap-1.5">
          <div className="text-right min-w-[80px] pb-1">
            <span
              className={cn(
                'text-xs font-bold tabular-nums whitespace-nowrap',
                amount > 0 ? 'text-moss-600 dark:text-moss-400' : amount < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-foreground/50'
              )}
            >
              {amount > 0 ? '+' : ''}{formatCurrency(amount, currencyLocale)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-foreground/30 hover:text-rust-600 hover:bg-rust-50 dark:hover:bg-rust-900/20 transition-colors flex-shrink-0"
            aria-label={t('removeItem')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

interface TaxLatencySectionProps {
  defaultTaxRate?: number
}

export function TaxLatencySection({ defaultTaxRate = 25 }: TaxLatencySectionProps) {
  const t = useTranslations('taxLatency')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'

  const [isExpanded, setIsExpanded] = useState(false)

  const items = useTaxLatencyStore((s) => s.items)
  const addItem = useTaxLatencyStore((s) => s.addItem)
  const removeItem = useTaxLatencyStore((s) => s.removeItem)
  const updateItem = useTaxLatencyStore((s) => s.updateItem)

  const netImpact = getNetTaxLatencyImpact(items)
  const hasItems = items.length > 0

  useEffect(() => {
    if (items.length > 0 && !isExpanded) {
      setIsExpanded(true)
    }
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddItem = useCallback(() => {
    addItem({
      id: generateId(),
      type: 'passive',
      description: '',
      temporaryDifference: 0,
      taxRate: defaultTaxRate,
    })
    if (!isExpanded) setIsExpanded(true)
  }, [addItem, defaultTaxRate, isExpanded])

  return (
    <div>
      {/* Section header — matches modal's native section style */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="tax-latency-panel"
        className={cn(
          'w-full flex items-center justify-between py-2 text-left group',
          'transition-colors'
        )}
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-foreground/40 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
          <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
            {t('sectionTitle')}
          </span>

          {hasItems && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums bg-foreground/[0.06] text-foreground/50">
              {items.length}
            </span>
          )}

          <TooltipProvider delayDuration={300}>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center justify-center text-foreground/30 hover:text-foreground/50 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HelpCircle className="w-3 h-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs">
                {t('sectionDescription')}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>

        {hasItems && (
          <span
            className={cn(
              'text-xs font-bold tabular-nums',
              netImpact > 0 ? 'text-moss-600 dark:text-moss-400' : netImpact < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-foreground/50'
            )}
          >
            {netImpact > 0 ? '+' : ''}{formatCurrency(netImpact, currencyLocale)}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div id="tax-latency-panel" className="pt-2 pb-1 space-y-2">
              {/* Items */}
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <TaxLatencyRow
                    key={item.id}
                    item={item}
                    currencyLocale={currencyLocale}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                    t={t}
                  />
                ))}
              </AnimatePresence>

              {/* Add button */}
              <button
                type="button"
                onClick={handleAddItem}
                className={cn(
                  'w-full flex items-center justify-center gap-1.5 py-2 rounded-md',
                  'border border-dashed border-foreground/[0.1] hover:border-primary/30',
                  'text-[11px] font-medium text-foreground/40 hover:text-primary',
                  'transition-all duration-200 hover:bg-primary/[0.03]'
                )}
              >
                <Plus className="w-3 h-3" />
                {t('addItem')}
              </button>

              {/* Net impact summary */}
              {hasItems && (
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-foreground/[0.06]">
                  <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
                    {t('netImpact')}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-bold tabular-nums',
                      netImpact > 0 ? 'text-moss-600 dark:text-moss-400' : netImpact < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-foreground/50'
                    )}
                  >
                    {netImpact > 0 ? '+' : ''}{formatCurrency(netImpact, currencyLocale)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
