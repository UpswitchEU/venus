'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Edit3, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type React from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { AuroraInput as Input } from '@/design-system/components/Input'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import { coalesceFiniteNumber } from '@/lib/omniPreview'
import type { LedgerAccount } from '../../constants/grootboek'
import { getNormalizationAmountForBase } from '../../utils/normalizationMath'
import type { NormalizationType } from './UnifiedNormalizationTypes'

const typeOptions: Array<{
  value: NormalizationType
  label: string
  tooltipKey: string
}> = [
  { value: 'add', label: '+€', tooltipKey: 'typeAddAmount' },
  { value: 'subtract', label: '-€', tooltipKey: 'typeSubtractAmount' },
  { value: 'add_percent', label: '+%', tooltipKey: 'typeAddPercent' },
  { value: 'subtract_percent', label: '-%', tooltipKey: 'typeSubtractPercent' },
  { value: 'absolute', label: 'ABS', tooltipKey: 'typeSetTarget' },
]

interface UnifiedNormalizationAddFormProps {
  open: boolean
  addFormRef: React.Ref<HTMLDivElement>
  ledgerButtonRef: React.Ref<HTMLButtonElement>
  selectedLedger: LedgerAccount | null
  availableYears: number[]
  editingId: string | null
  newType: NormalizationType
  newValue: string
  newSelectedYears: number[]
  newReason: string
  safeOriginalEBITDA: number
  formatCurrency: (amount: number) => string
  onChangeLedger: () => void
  onTypeChange: (type: NormalizationType) => void
  onValueChange: (value: string) => void
  onSelectedYearsChange: (years: number[]) => void
  onReasonChange: (reason: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function UnifiedNormalizationAddForm({
  open,
  addFormRef,
  ledgerButtonRef,
  selectedLedger,
  availableYears,
  editingId,
  newType,
  newValue,
  newSelectedYears,
  newReason,
  safeOriginalEBITDA,
  formatCurrency,
  onChangeLedger,
  onTypeChange,
  onValueChange,
  onSelectedYearsChange,
  onReasonChange,
  onSubmit,
  onCancel,
}: UnifiedNormalizationAddFormProps) {
  const nh = useTranslations('normalizationHub')
  const tCommon = useTranslations('common.actions')

  const toggleYear = (year: number) => {
    if (newSelectedYears.includes(year)) {
      if (newSelectedYears.length > 1) {
        onSelectedYearsChange(newSelectedYears.filter((selectedYear) => selectedYear !== year))
      }
      return
    }
    onSelectedYearsChange([...newSelectedYears, year].sort((a, b) => b - a))
  }

  const previewAdjustment = getNormalizationAmountForBase(
    {
      type: newType,
      value: coalesceFiniteNumber(newValue.replace(/[^0-9.-]/g, '')),
      adjustment: 0,
    },
    safeOriginalEBITDA
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={addFormRef}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="p-4 rounded-xl bg-primary/[0.03] border border-primary/20 mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              {nh('addNormalization')}
            </span>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/40 hover:text-foreground/60 transition-colors"
              aria-label={nh('actions.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedLedger && (
            <div className="mb-4">
              <label className="text-xs font-medium text-foreground/60 mb-1.5 block">
                {nh('ledgerAccountLabel')}
              </label>
              <div className="flex items-center gap-2">
                <button
                  ref={ledgerButtonRef}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    onChangeLedger()
                  }}
                  className="flex-1 flex items-start gap-3 p-2.5 rounded-lg bg-background/80 border border-foreground/[0.08] hover:border-primary/30 hover:bg-primary/[0.02] transition-all group text-left"
                  aria-label={nh('clickToChooseLedger')}
                >
                  <span className="font-mono text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-bold group-hover:bg-primary/15 transition-colors shrink-0">
                    {selectedLedger.code}
                  </span>
                  <span
                    className={cn(
                      'text-sm text-foreground flex-1 min-w-0 text-left',
                      LEDGER_LABEL_TEXT_CLASSES
                    )}
                  >
                    {selectedLedger.name}
                  </span>
                  <span className="text-[10px] text-foreground/40 group-hover:text-primary transition-colors flex items-center gap-1 shrink-0 pt-0.5">
                    <Edit3 className="w-3 h-3" />
                    {nh('changeLedgerButton')}
                  </span>
                </button>
              </div>
              <p className="text-[10px] text-foreground/40 mt-1">{nh('clickToChooseLedger')}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">{nh('type')}</label>
              <div className="flex gap-1">
                {typeOptions.map((option) => (
                  <TooltipProvider key={option.value}>
                    <TooltipRoot>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onTypeChange(option.value)}
                          className={cn(
                            'px-3 py-2 rounded-lg text-xs font-medium transition-all',
                            newType === option.value
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]'
                          )}
                        >
                          {option.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px] text-xs">
                        {nh(option.tooltipKey)}
                      </TooltipContent>
                    </TooltipRoot>
                  </TooltipProvider>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-[140px]">
              <Input
                label={newType.includes('percent') ? nh('percentage') : nh('amount')}
                type="text"
                placeholder={newType.includes('percent') ? '10' : '0'}
                value={newValue}
                onChange={(event) => onValueChange(event.target.value)}
                leftIcon={
                  <span className="text-foreground/40 text-sm font-medium">
                    {newType.includes('percent') ? '%' : '€'}
                  </span>
                }
                size="sm"
                truncateLabel={false}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/60">{nh('applyTo')}</label>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-foreground/[0.03]">
                {availableYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => toggleYear(year)}
                    className={cn(
                      'px-2.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                      newSelectedYears.includes(year)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]'
                    )}
                  >
                    {year}
                  </button>
                ))}
                <div className="w-px h-6 bg-foreground/10 mx-1" />
                <button
                  type="button"
                  onClick={() => onSelectedYearsChange([...availableYears])}
                  className={cn(
                    'px-2.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                    newSelectedYears.length === availableYears.length
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]'
                  )}
                >
                  {nh('all')}
                </button>
              </div>
            </div>

            <Button
              onClick={onSubmit}
              disabled={!newValue || !selectedLedger}
              size="sm"
              className="gap-1.5 h-10 self-end"
            >
              <Check className="w-3.5 h-3.5" />
              {editingId ? tCommon('save') : tCommon('add')}
            </Button>

            {editingId && (
              <Button
                onClick={onCancel}
                variant="ghost"
                size="sm"
                className="gap-1.5 h-10 self-end"
              >
                <X className="w-3.5 h-3.5" />
                {tCommon('cancel')}
              </Button>
            )}
          </div>

          {(newType === 'add_percent' || newType === 'subtract_percent') && newValue && (
            <div className="mt-4 p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5">
                    {nh('originalEbitda')}
                  </p>
                  <p className="text-sm font-mono font-medium text-foreground/60">
                    {formatCurrency(safeOriginalEBITDA)}
                  </p>
                </div>
                <div className="text-foreground/30">→</div>
                <div>
                  <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5">
                    {nh('adjustment')}
                  </p>
                  <p
                    className={cn(
                      'text-sm font-mono font-semibold',
                      newType === 'add_percent' ? 'text-success' : 'text-secondary'
                    )}
                  >
                    {newType === 'add_percent' ? '+' : '-'}
                    {formatCurrency(Math.abs(previewAdjustment))}
                  </p>
                </div>
                <div className="text-foreground/30">→</div>
                <div>
                  <p className="text-[9px] font-medium text-primary uppercase tracking-wider mb-0.5">
                    {nh('outcome')}
                  </p>
                  <p className="text-sm font-mono font-bold text-foreground">
                    {formatCurrency(safeOriginalEBITDA + previewAdjustment)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4">
            <Input
              label={nh('explanation')}
              placeholder={nh('explanationPlaceholder')}
              value={newReason}
              onChange={(event) => onReasonChange(event.target.value)}
              size="sm"
              truncateLabel={false}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
