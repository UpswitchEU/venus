import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronRight, Edit3, HelpCircle, Plus, Search } from 'lucide-react'
import type { RefObject } from 'react'
import type { useTranslations } from 'next-intl'
import type { LedgerAccount } from '@/constants/grootboek'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import {
  formatCurrencyTaxLatency,
  type TaxLatencyType,
} from '../../store/useTaxLatencyStore'
import {
  getLedgerDisplayLabel,
  sanitizeNumericInput,
} from './TaxLatencySection.utils'

interface TaxLatencyEditorFormProps {
  amountInputRef: RefObject<HTMLInputElement>
  canSubmit: boolean
  currencyLocale: string
  defaultRateSource: 'navSchedule' | 'fallback'
  draftAmount: string
  draftDescription: string
  draftPreview: number
  draftRate: string
  draftType: TaxLatencyType
  editingId: string | null
  effectiveDefaultRate: number
  filteredLedgers: LedgerAccount[]
  ledgerQuery: string
  parsedAmount: number
  parsedRate: number
  selectedLedger: LedgerAccount | null
  showLedgerDropdown: boolean
  t: ReturnType<typeof useTranslations<'taxLatency'>>
  onCancelEdit: () => void
  onSelectLedger: (ledger: LedgerAccount) => void
  onSubmit: () => void
  setDraftAccountCode: (value: string) => void
  setDraftAccountName: (value: string) => void
  setDraftAmount: (value: string) => void
  setDraftDescription: (value: string) => void
  setDraftRate: (value: string) => void
  setDraftType: (value: TaxLatencyType) => void
  setLedgerQuery: (value: string) => void
  setShowLedgerDropdown: (value: boolean) => void
}

export function TaxLatencyEditorForm({
  amountInputRef,
  canSubmit,
  currencyLocale,
  defaultRateSource,
  draftAmount,
  draftDescription,
  draftPreview,
  draftRate,
  draftType,
  editingId,
  effectiveDefaultRate,
  filteredLedgers,
  ledgerQuery,
  parsedAmount,
  parsedRate,
  selectedLedger,
  showLedgerDropdown,
  t,
  onCancelEdit,
  onSelectLedger,
  onSubmit,
  setDraftAccountCode,
  setDraftAccountName,
  setDraftAmount,
  setDraftDescription,
  setDraftRate,
  setDraftType,
  setLedgerQuery,
  setShowLedgerDropdown,
}: TaxLatencyEditorFormProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        editingId
          ? 'border-primary/30 bg-primary/[0.02]'
          : 'border-foreground/[0.08] bg-foreground/[0.02]'
      )}
    >
      {editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" />
            {t('editItem')}
          </span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs text-foreground/50 hover:text-foreground/70 underline transition-colors"
          >
            {t('cancelEdit')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
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
              <option value="active" className="bg-background text-foreground">
                {t('typeActive')}
              </option>
              <option value="passive" className="bg-background text-foreground">
                {t('typePassive')}
              </option>
            </select>
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/30 rotate-90 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-foreground/50 mb-1 uppercase tracking-wide">
            {t('account')}
          </label>
          <div className="relative">
            <div
              className={cn(
                'flex items-center gap-2 h-9 px-2.5 rounded-md',
                'bg-background border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20',
                'transition-all'
              )}
            >
              <Search className="w-3.5 h-3.5 text-foreground/35 flex-shrink-0" />
              <input
                type="text"
                value={ledgerQuery}
                title={ledgerQuery.trim().length > 0 ? ledgerQuery : undefined}
                placeholder={t('accountPlaceholder')}
                onFocus={() => setShowLedgerDropdown(true)}
                onChange={(event) => {
                  const query = event.target.value
                  setLedgerQuery(query)
                  setShowLedgerDropdown(query.trim().length > 0)
                  if (query !== getLedgerDisplayLabel(selectedLedger?.code, selectedLedger?.name)) {
                    setDraftAccountCode('')
                    setDraftAccountName('')
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowLedgerDropdown(false)
                }}
                className="w-full bg-transparent border-none outline-none text-xs text-foreground placeholder:text-foreground/25"
              />
            </div>
            {showLedgerDropdown && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-foreground/[0.08] bg-background shadow-xl overflow-hidden">
                <div className="max-h-[min(22rem,50vh)] overflow-y-auto py-1">
                  {filteredLedgers.length > 0 ? (
                    filteredLedgers.map((ledger) => (
                      <button
                        key={ledger.code}
                        type="button"
                        onClick={() => onSelectLedger(ledger)}
                        className="w-full flex items-start justify-between gap-3 px-3 py-2 text-left hover:bg-foreground/[0.04] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono font-semibold text-foreground tabular-nums">
                            {ledger.code}
                          </div>
                          <div
                            className={cn(
                              'text-[11px] text-foreground/55 mt-0.5 leading-snug',
                              LEDGER_LABEL_TEXT_CLASSES
                            )}
                            title={ledger.name}
                          >
                            {ledger.name}
                          </div>
                        </div>
                        {ledger.category ? (
                          <span
                            className={cn(
                              'text-[10px] uppercase tracking-wide text-foreground/35 shrink-0 max-w-[40%] text-right leading-snug',
                              LEDGER_LABEL_TEXT_CLASSES
                            )}
                          >
                            {ledger.category}
                          </span>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-xs text-foreground/45">
                      {t('noLedgerResults')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_100px_auto] gap-3 items-end mt-3">
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
            }}
            className={cn(
              'w-full h-9 px-2.5 rounded-md text-xs',
              'bg-background border border-foreground/[0.08]',
              'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
              'transition-all outline-none placeholder:text-foreground/25'
            )}
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-foreground/50 mb-1 uppercase tracking-wide">
            {t('grossSurplusValue')}
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-foreground/40 font-medium">
              €
            </span>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              value={draftAmount}
              onChange={(e) => setDraftAmount(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit()
              }}
              className={cn(
                'w-full h-9 pl-6 pr-2.5 rounded-md text-xs tabular-nums text-right',
                'bg-background border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none'
              )}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-1">
            <label className="block text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
              {t('taxRate')}
            </label>
            {defaultRateSource === 'navSchedule' && !editingId && (
              <TooltipProvider delayDuration={200}>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold uppercase tracking-wide bg-primary/10 text-primary cursor-help">
                      {t('navDefaultBadge')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    {t('navDefaultTooltip', { rate: effectiveDefaultRate })}
                  </TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={draftRate}
              onChange={(e) => setDraftRate(sanitizeNumericInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit()
              }}
              className={cn(
                'w-full h-9 pl-2.5 pr-6 rounded-md text-xs tabular-nums text-right',
                'bg-background border border-foreground/[0.08]',
                'hover:border-foreground/[0.15] focus:border-primary focus:ring-1 focus:ring-primary/20',
                'transition-all outline-none'
              )}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-foreground/40 font-medium">
              %
            </span>
          </div>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onSubmit}
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
              {getLedgerDisplayLabel(selectedLedger?.code, selectedLedger?.name)} ·{' '}
              {formatCurrencyTaxLatency(parsedAmount, currencyLocale)} × {parsedRate}% =
            </span>
            <span
              className={cn(
                'font-bold tabular-nums',
                draftPreview > 0
                  ? 'text-moss-600 dark:text-moss-400'
                  : 'text-rust-600 dark:text-rust-400'
              )}
            >
              {draftPreview > 0 ? '+' : ''}
              {formatCurrencyTaxLatency(draftPreview, currencyLocale)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
