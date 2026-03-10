'use client'

/**
 * Tax Latency Section
 *
 * Dedicated tab content for deferred tax assets/liabilities (belastinglatenties).
 * Uses an explicit "input form → + Toevoegen → read-only list" pattern
 * so accountants always know when data is committed.
 *
 * Each item: Type (active/passive), Description, Temporary Difference (€), Tax Rate (%).
 * Calculation: Temporary Difference × Tax Rate = Latency Amount.
 * Active → adds to equity value, Passive → subtracts from equity value.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronRight, Edit3, HelpCircle, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
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
  formatCurrencyTaxLatency,
  getNetTaxLatencyImpact,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function generateId(): string {
  return `tl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

// ─────────────────────────────────────────
// READ-ONLY ITEM ROW
// ─────────────────────────────────────────

interface TaxLatencyRowProps {
  item: TaxLatencyItem
  currencyLocale: string
  onEdit: (item: TaxLatencyItem) => void
  onRemove: (id: string) => void
  t: ReturnType<typeof useTranslations<'taxLatency'>>
}

function TaxLatencyRow({ item, currencyLocale, onEdit, onRemove, t }: TaxLatencyRowProps) {
  const amount = calculateLatencyAmount(item)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-3 px-3 h-12 rounded-lg border border-foreground/[0.08] bg-background/60 hover:border-foreground/[0.12] transition-colors"
    >
      {/* Type badge */}
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[120px] px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0',
          item.type === 'active'
            ? 'bg-moss-100 text-moss-700 dark:bg-moss-900/30 dark:text-moss-400'
            : 'bg-rust-100 text-rust-700 dark:bg-rust-900/30 dark:text-rust-400'
        )}
      >
        {item.type === 'active' ? t('typeActive') : t('typePassive')}
      </span>

      {/* Description */}
      <span className="flex-1 min-w-0 text-sm text-foreground/80 truncate">
        {item.description || <span className="text-foreground/30 italic">—</span>}
      </span>

      {/* Temporary Difference */}
      <span className="text-xs font-mono tabular-nums text-foreground/60 flex-shrink-0">
        {formatCurrencyTaxLatency(item.temporaryDifference, currencyLocale)}
      </span>

      {/* Tax Rate */}
      <span className="text-xs font-mono tabular-nums text-foreground/50 flex-shrink-0 w-12 text-right">
        {item.taxRate}%
      </span>

      {/* Calculated result */}
      <span
        className={cn(
          'text-xs font-bold tabular-nums whitespace-nowrap min-w-[80px] text-right flex-shrink-0',
          amount > 0 ? 'text-moss-600 dark:text-moss-400' : amount < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-foreground/50'
        )}
      >
        {amount > 0 ? '+' : ''}{formatCurrencyTaxLatency(amount, currencyLocale)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
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
}

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

interface TaxLatencySectionProps {
  defaultTaxRate?: number
  /** When true, section is always expanded (e.g. when shown as main tab content) */
  alwaysExpanded?: boolean
}

export function TaxLatencySection({ defaultTaxRate = 25, alwaysExpanded = false }: TaxLatencySectionProps) {
  const t = useTranslations('taxLatency')
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'

  const items = useTaxLatencyStore((s) => s.items)
  const addItem = useTaxLatencyStore((s) => s.addItem)
  const removeItem = useTaxLatencyStore((s) => s.removeItem)
  const updateItem = useTaxLatencyStore((s) => s.updateItem)

  const netImpact = getNetTaxLatencyImpact(items)
  const hasItems = items.length > 0

  // Draft form state
  const [draftType, setDraftType] = useState<TaxLatencyType>('passive')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftAmount, setDraftAmount] = useState('')
  const [draftRate, setDraftRate] = useState(String(defaultTaxRate))
  const [editingId, setEditingId] = useState<string | null>(null)

  const parsedAmount = (() => {
    const raw = draftAmount.replace(/[^\d.,]/g, '')
    if (raw === '') return 0
    const val = Number(raw.replace(',', '.'))
    return Number.isNaN(val) ? 0 : val
  })()

  const parsedRate = (() => {
    const raw = draftRate.replace(/[^\d.,]/g, '')
    if (raw === '') return 0
    const val = Number(raw.replace(',', '.'))
    return Number.isNaN(val) ? 0 : Math.min(100, Math.max(0, val))
  })()

  const draftPreview = draftType === 'active'
    ? Math.abs(parsedAmount) * (parsedRate / 100)
    : -(Math.abs(parsedAmount) * (parsedRate / 100))

  const canSubmit = parsedAmount > 0

  const resetDraft = useCallback(() => {
    setDraftType('passive')
    setDraftDescription('')
    setDraftAmount('')
    setDraftRate(String(defaultTaxRate))
    setEditingId(null)
  }, [defaultTaxRate])

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return

    if (editingId) {
      updateItem(editingId, {
        type: draftType,
        description: draftDescription,
        temporaryDifference: Math.abs(parsedAmount),
        taxRate: parsedRate,
      })
    } else {
      addItem({
        id: generateId(),
        type: draftType,
        description: draftDescription,
        temporaryDifference: Math.abs(parsedAmount),
        taxRate: parsedRate,
      })
    }
    resetDraft()
  }, [canSubmit, editingId, draftType, draftDescription, parsedAmount, parsedRate, addItem, updateItem, resetDraft])

  const handleEdit = useCallback((item: TaxLatencyItem) => {
    setDraftType(item.type)
    setDraftDescription(item.description)
    setDraftAmount(String(item.temporaryDifference))
    setDraftRate(String(item.taxRate))
    setEditingId(item.id)
  }, [])

  const handleCancelEdit = useCallback(() => {
    resetDraft()
  }, [resetDraft])

  const handleRemove = useCallback((id: string) => {
    if (editingId === id) resetDraft()
    removeItem(id)
  }, [editingId, resetDraft, removeItem])

  // Collapsible state (only used when not alwaysExpanded)
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded || hasItems)

  const inputForm = (
    <div className={cn(
      'rounded-xl border p-4 transition-colors',
      editingId
        ? 'border-primary/30 bg-primary/[0.02]'
        : 'border-foreground/[0.08] bg-foreground/[0.02]'
    )}>
      {/* Form heading when editing */}
      {editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" />
            {t('editItem')}
          </span>
          <button
            type="button"
            onClick={handleCancelEdit}
            className="text-xs text-foreground/50 hover:text-foreground/70 underline transition-colors"
          >
            {t('cancelEdit')}
          </button>
        </div>
      )}

      {/* Row 1: What is it — Type + Description */}
      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3">
        {/* Type */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <label className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
              {t('type')}
            </label>
            <TooltipProvider delayDuration={200}>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <span className="inline-flex text-foreground/30 hover:text-foreground/50 transition-colors cursor-help">
                    <HelpCircle className="w-3 h-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  {draftType === 'active' ? t('activeTooltip') : t('passiveTooltip')}
                </TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          </div>
          <div className="relative">
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as TaxLatencyType)}
              className={cn(
                'w-full min-w-[180px] h-9 pl-2.5 pr-7 rounded-md text-xs font-medium appearance-none cursor-pointer',
                'bg-background border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none',
                draftType === 'active'
                  ? 'text-moss-700 dark:text-moss-400'
                  : 'text-rust-700 dark:text-rust-400'
              )}
            >
              <option value="active" className="bg-background text-foreground">{t('typeActive')}</option>
              <option value="passive" className="bg-background text-foreground">{t('typePassive')}</option>
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
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            maxLength={200}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className={cn(
              'w-full h-9 px-2.5 rounded-md text-xs',
              'bg-background border border-foreground/[0.08]',
              'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
              'transition-all outline-none placeholder:text-foreground/25'
            )}
          />
        </div>
      </div>

      {/* Row 2: Values — Amount + Rate + Action */}
      <div className="grid grid-cols-[1fr_80px_auto] sm:grid-cols-[160px_100px_auto] gap-3 items-end mt-3">
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
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="0"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className={cn(
                'w-full h-9 pl-6 pr-2.5 rounded-md text-xs tabular-nums text-right',
                'bg-background border border-foreground/[0.08]',
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
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className={cn(
                'w-full h-9 pl-2.5 pr-6 rounded-md text-xs tabular-nums text-right',
                'bg-background border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none'
              )}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-foreground/40 font-medium">%</span>
          </div>
        </div>

        {/* Submit CTA */}
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'h-9 px-4 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap',
              canSubmit
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'bg-foreground/[0.06] text-foreground/30 cursor-not-allowed'
            )}
          >
            {editingId ? (
              <>
                <Check className="w-3.5 h-3.5" />
                {t('saveCta')}
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                {t('addCta')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live preview of the calculation */}
      <AnimatePresence>
        {canSubmit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-3 flex items-center gap-2 text-xs text-foreground/50"
          >
            <span>
              {formatCurrencyTaxLatency(parsedAmount, currencyLocale)} × {parsedRate}% =
            </span>
            <span
              className={cn(
                'font-bold tabular-nums',
                draftPreview > 0 ? 'text-moss-600 dark:text-moss-400' : 'text-rust-600 dark:text-rust-400'
              )}
            >
              {draftPreview > 0 ? '+' : ''}{formatCurrencyTaxLatency(draftPreview, currencyLocale)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  const itemsList = (
    <div className="space-y-1.5 mt-4">
      {/* Column headers — hidden on mobile where badges are self-documenting */}
      {hasItems && (
        <div className="hidden sm:flex items-center gap-3 px-3 h-8 text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
          <span className="min-w-[120px] flex-shrink-0">{t('type')}</span>
          <span className="flex-1 min-w-0">{t('description')}</span>
          <span className="flex-shrink-0">{t('temporaryDifference')}</span>
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
            onEdit={handleEdit}
            onRemove={handleRemove}
            t={t}
          />
        ))}
      </AnimatePresence>

      {/* Empty state */}
      {!hasItems && (
        <div className="py-12 text-center">
          <p className="text-sm text-foreground/50 mb-1">{t('noItems')}</p>
          <p className="text-xs text-foreground/35">{t('noItemsDesc')}</p>
        </div>
      )}

      {/* Net impact summary */}
      {hasItems && (
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-foreground/[0.06]">
          <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
            {t('netImpact')}
          </span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              netImpact > 0 ? 'text-moss-600 dark:text-moss-400' : netImpact < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-foreground/50'
            )}
          >
            {netImpact > 0 ? '+' : ''}{formatCurrencyTaxLatency(netImpact, currencyLocale)}
          </span>
        </div>
      )}
    </div>
  )

  if (alwaysExpanded) {
    return (
      <div className="pt-2">
        {inputForm}
        {itemsList}
      </div>
    )
  }

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
            {netImpact > 0 ? '+' : ''}{formatCurrencyTaxLatency(netImpact, currencyLocale)}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id="tax-latency-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={cn('pt-2 pb-1')}>
              {inputForm}
              {itemsList}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
