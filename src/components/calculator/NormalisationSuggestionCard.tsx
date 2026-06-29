'use client'

import { motion } from 'framer-motion'
import { CalendarRange, Check, Edit3, Undo2, X } from 'lucide-react'
import { forwardRef } from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { Checkbox } from '@/design-system/components/Checkbox'
import { AuroraInput as Input } from '@/design-system/components/Input'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import {
  categoryIcons,
  categoryLabelKeys,
  sourceLabels,
  typeOptions,
} from './NormalisationReviewStep.constants'
import type { NormalizationType, SuggestedNormalisation } from './NormalisationReviewStep.types'

type Translate = (key: string, values?: Record<string, string | number>) => string

interface NormalisationSuggestionCardProps {
  suggestion: SuggestedNormalisation
  index: number
  isEditing: boolean
  canEdit: boolean
  editAmount: string
  editType: NormalizationType
  editApplyAllYears: boolean
  editReason: string
  formatCurrency: (amount: number) => string
  nh: Translate
  ca: Translate
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onStartEditing: (suggestion: SuggestedNormalisation) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onEditAmountChange: (value: string) => void
  onEditTypeChange: (value: NormalizationType) => void
  onEditApplyAllYearsChange: (value: boolean) => void
  onEditReasonChange: (value: string) => void
}

export const NormalisationSuggestionCard = forwardRef<
  HTMLDivElement,
  NormalisationSuggestionCardProps
>(function NormalisationSuggestionCard(
  {
    suggestion,
    index,
    isEditing,
    canEdit,
    editAmount,
    editType,
    editApplyAllYears,
    editReason,
    formatCurrency,
    nh,
    ca,
    onAccept,
    onReject,
    onStartEditing,
    onCancelEdit,
    onSaveEdit,
    onEditAmountChange,
    onEditTypeChange,
    onEditApplyAllYearsChange,
    onEditReasonChange,
  },
  ref
) {
  const source = suggestion.source || 'manual'

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.02 }}
      className={cn(
        'rounded-xl border transition-all overflow-hidden',
        suggestion.status === 'pending'
          ? 'bg-foreground/[0.02] border-foreground/[0.08]'
          : suggestion.status === 'accepted'
            ? 'bg-success/5 border-success/20'
            : 'bg-foreground/[0.01] border-foreground/[0.04] opacity-50'
      )}
    >
      {isEditing ? (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{categoryIcons[suggestion.category]}</span>
              <span className="text-sm font-medium text-foreground">{suggestion.description}</span>
            </div>
            <button
              type="button"
              onClick={onCancelEdit}
              aria-label={nh('actions.cancel')}
              className="p-1.5 rounded-lg hover:bg-foreground/10"
            >
              <X className="w-4 h-4 text-foreground/40" />
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex gap-0.5">
              {typeOptions.map((option) => (
                <TooltipProvider key={option.value}>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onEditTypeChange(option.value)}
                        className={cn(
                          'px-2.5 py-2 rounded-lg text-xs font-medium transition-all',
                          editType === option.value
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
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">
                {editType.includes('percent') ? '%' : '€'}
              </span>
              <Input
                type="text"
                placeholder={nh('amountPlaceholder')}
                value={editAmount}
                onChange={(event) => onEditAmountChange(event.target.value)}
                className="pl-8 font-mono text-base"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={editApplyAllYears} onChange={onEditApplyAllYearsChange} />
            <span className="text-xs text-foreground/60 flex items-center gap-1">
              <CalendarRange className="w-3 h-3" />
              {nh('applyToAllYears')}
            </span>
          </label>

          <Input
            placeholder={nh('explanationOptionalPlaceholder')}
            value={editReason}
            onChange={(event) => onEditReasonChange(event.target.value)}
            className="text-sm"
          />

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancelEdit} className="flex-1">
              {nh('actions.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={onSaveEdit} className="flex-1 gap-1">
              <Check className="w-3.5 h-3.5" />
              {nh('actions.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 md:p-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center text-base md:text-lg shrink-0">
              {categoryIcons[suggestion.category]}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span
                  className={cn(
                    'text-sm font-medium text-foreground min-w-0',
                    LEDGER_LABEL_TEXT_CLASSES
                  )}
                  title={suggestion.description}
                >
                  {suggestion.description}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[8px] md:text-[9px] px-1.5 py-0.5 rounded font-medium',
                    sourceLabels[source].color
                  )}
                >
                  {nh(sourceLabels[source].labelKey)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-foreground/50 flex-wrap">
                <span className="font-mono text-foreground/40">{suggestion.code}</span>
                <span className="hidden sm:inline">·</span>
                <span>{nh(categoryLabelKeys[suggestion.category])}</span>
                {suggestion.applyAllYears && (
                  <>
                    <span className="hidden sm:inline">·</span>
                    <span className="flex items-center gap-0.5 text-primary">
                      <CalendarRange className="w-2.5 h-2.5" />
                      {nh('allYears')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  'text-sm md:text-base font-mono font-semibold',
                  suggestion.amount > 0 ? 'text-success' : 'text-secondary'
                )}
              >
                {suggestion.amount > 0 ? '+' : ''}
                {formatCurrency(suggestion.amount)}
              </p>
              {suggestion.marketBenchmark && (
                <p className="text-[9px] text-foreground/40">
                  {nh('marketPrefix')} {suggestion.marketBenchmark}
                </p>
              )}
            </div>

            {suggestion.status === 'pending' ? (
              <div className="flex items-center gap-1 shrink-0">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onStartEditing(suggestion)}
                    className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                    aria-label={nh('actions.edit')}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-foreground/40" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onReject(suggestion.id)}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                  aria-label={ca('reject')}
                >
                  <X className="w-4 h-4 text-foreground/40" />
                </button>
                <button
                  type="button"
                  onClick={() => onAccept(suggestion.id)}
                  className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center bg-primary/10 hover:bg-primary/20 transition-colors"
                  aria-label={ca('accept')}
                >
                  <Check className="w-4 h-4 text-primary" />
                </button>
              </div>
            ) : suggestion.status === 'accepted' ? (
              <div className="shrink-0 flex items-center gap-1">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onStartEditing(suggestion)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                    aria-label={nh('actions.edit')}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-foreground/40" />
                  </button>
                )}
                <div className="flex items-center gap-1 text-[10px] md:text-xs text-success font-medium px-2 py-1 rounded-full bg-success/10">
                  <Check className="w-3 h-3" />
                  <span className="hidden sm:inline">{ca('accepted')}</span>
                  <span className="sm:hidden">OK</span>
                </div>
              </div>
            ) : (
              <div className="shrink-0 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAccept(suggestion.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                  aria-label={nh('actions.undo')}
                >
                  <Undo2 className="w-3.5 h-3.5 text-foreground/40" />
                </button>
                <div className="flex items-center gap-1 text-[10px] md:text-xs text-foreground/40 font-medium px-2 py-1 rounded-full bg-foreground/[0.04]">
                  <X className="w-3 h-3" />
                  <span className="hidden sm:inline">{ca('rejected')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
})
