'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CalendarRange, Plus, Search, X } from 'lucide-react'
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
import type { LedgerAccount } from '../../constants/grootboek'
import {
  type NormalizationPreset,
  normalizationPresets,
  typeOptions,
} from './NormalisationReviewStep.constants'
import type { NormalizationType } from './NormalisationReviewStep.types'
import { parseCustomLedgerFromQuery } from './NormalisationReviewStepModel'

type Translate = (key: string, values?: Record<string, string | number>) => string

interface NormalisationAddFormProps {
  showAddForm: boolean
  selectedLedger: LedgerAccount | null
  searchQuery: string
  showLedgerDropdown: boolean
  filteredLedgers: LedgerAccount[]
  newType: NormalizationType
  newAmount: string
  newApplyAllYears: boolean
  newReason: string
  formatCurrency: (amount: number) => string
  nh: Translate
  onShowAddFormChange: (value: boolean) => void
  onSelectedLedgerChange: (value: LedgerAccount | null) => void
  onSearchQueryChange: (value: string) => void
  onShowLedgerDropdownChange: (value: boolean) => void
  onNewTypeChange: (value: NormalizationType) => void
  onNewAmountChange: (value: string) => void
  onNewApplyAllYearsChange: (value: boolean) => void
  onNewReasonChange: (value: string) => void
  onAddFromPreset: (preset: NormalizationPreset) => void
  onAddFromLedger: () => void
}

export function NormalisationAddForm({
  showAddForm,
  selectedLedger,
  searchQuery,
  showLedgerDropdown,
  filteredLedgers,
  newType,
  newAmount,
  newApplyAllYears,
  newReason,
  formatCurrency,
  nh,
  onShowAddFormChange,
  onSelectedLedgerChange,
  onSearchQueryChange,
  onShowLedgerDropdownChange,
  onNewTypeChange,
  onNewAmountChange,
  onNewApplyAllYearsChange,
  onNewReasonChange,
  onAddFromPreset,
  onAddFromLedger,
}: NormalisationAddFormProps) {
  const selectLedger = (ledger: LedgerAccount) => {
    onSelectedLedgerChange(ledger)
    onSearchQueryChange(`${ledger.code} · ${ledger.name}`)
    onShowLedgerDropdownChange(false)
  }

  const selectCustomLedger = () => {
    const { code, name } = parseCustomLedgerFromQuery(searchQuery)
    selectLedger({ code, name })
  }

  return (
    <div className="mt-4 pt-4 border-t border-foreground/[0.06]">
      {!showAddForm ? (
        <button
          type="button"
          onClick={() => onShowAddFormChange(true)}
          className="w-full p-3 rounded-xl border border-dashed border-foreground/10 hover:border-primary/30 hover:bg-primary/[0.02] transition-all flex items-center justify-center gap-2 text-sm text-foreground/50 hover:text-primary"
        >
          <Plus className="w-4 h-4" />
          {nh('addNormalization')}
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-4 p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.08]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground/60">{nh('addNormalization')}</span>
            <button
              type="button"
              aria-label={nh('actions.cancel')}
              onClick={() => {
                onShowAddFormChange(false)
                onSelectedLedgerChange(null)
                onSearchQueryChange('')
              }}
              className="p-1 rounded hover:bg-foreground/10"
            >
              <X className="w-3.5 h-3.5 text-foreground/40" />
            </button>
          </div>

          {!selectedLedger && (
            <>
              <div className="space-y-2">
                <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider">
                  {nh('quickChoices')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {normalizationPresets.slice(0, 4).map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => onAddFromPreset(preset)}
                      className="p-2.5 rounded-xl bg-foreground/[0.02] border border-foreground/[0.06] hover:border-primary/30 hover:bg-primary/[0.02] transition-all text-left group"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-sm">{preset.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-xs font-medium text-foreground/80 group-hover:text-foreground leading-snug',
                              LEDGER_LABEL_TEXT_CLASSES
                            )}
                          >
                            {nh(preset.labelKey)}
                          </p>
                          <p className="text-[10px] text-foreground/40">
                            +{formatCurrency(preset.defaultAmount)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-foreground/[0.06]" />
                <span className="text-[10px] text-foreground/30 uppercase">{nh('orSearch')}</span>
                <div className="flex-1 h-px bg-foreground/[0.06]" />
              </div>
            </>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
            <Input
              placeholder={nh('searchLedgerPlaceholder')}
              value={searchQuery}
              title={searchQuery.trim().length > 0 ? searchQuery : undefined}
              onChange={(event) => {
                onSearchQueryChange(event.target.value)
                onShowLedgerDropdownChange(true)
                onSelectedLedgerChange(null)
              }}
              onFocus={() => onShowLedgerDropdownChange(true)}
              className="pl-10 text-base"
            />

            <AnimatePresence>
              {showLedgerDropdown && !selectedLedger && searchQuery && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute z-50 w-full mt-1 py-1 bg-background border border-foreground/10 rounded-lg shadow-lg max-h-[min(18rem,45vh)] overflow-y-auto"
                >
                  {filteredLedgers.map((account) => (
                    <button
                      type="button"
                      key={account.code}
                      onClick={() => selectLedger(account)}
                      className="w-full px-3 py-2 text-left hover:bg-foreground/[0.04] flex items-start gap-3 transition-colors"
                    >
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60 shrink-0 mt-0.5">
                        {account.code}
                      </span>
                      <span
                        className={cn(
                          'text-sm text-foreground/80 min-w-0 text-left',
                          LEDGER_LABEL_TEXT_CLASSES
                        )}
                        title={account.name}
                      >
                        {account.name}
                      </span>
                    </button>
                  ))}
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={selectCustomLedger}
                      className={cn(
                        'w-full px-3 py-2 text-left hover:bg-primary/5 flex items-start justify-between gap-3 transition-colors cursor-pointer',
                        filteredLedgers.length > 0 && 'border-t border-foreground/[0.06]'
                      )}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0 mt-0.5">
                          +
                        </span>
                        <span
                          className={cn(
                            'text-sm text-foreground/80 min-w-0 text-left',
                            LEDGER_LABEL_TEXT_CLASSES
                          )}
                        >
                          {nh('useCustomCode', { query: searchQuery.trim() })}
                        </span>
                      </div>
                      <span className="flex-shrink-0 self-start mt-0.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                        {nh('actions.add')}
                      </span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {selectedLedger && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                  {selectedLedger.code}
                </span>
                <span
                  className={cn(
                    'text-sm text-foreground/80 flex-1 min-w-0',
                    LEDGER_LABEL_TEXT_CLASSES
                  )}
                >
                  {selectedLedger.name}
                </span>
                <button
                  type="button"
                  aria-label={nh('changeLedgerButton')}
                  onClick={() => {
                    onSelectedLedgerChange(null)
                    onSearchQueryChange('')
                  }}
                  className="p-1 rounded hover:bg-foreground/10"
                >
                  <X className="w-3 h-3 text-foreground/40" />
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
                            onClick={() => onNewTypeChange(option.value)}
                            className={cn(
                              'px-2.5 py-2 rounded-lg text-xs font-medium transition-all',
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
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">
                    {newType.includes('percent') ? '%' : '€'}
                  </span>
                  <Input
                    type="text"
                    placeholder={nh('amountPlaceholder')}
                    value={newAmount}
                    onChange={(event) => onNewAmountChange(event.target.value)}
                    className="pl-8 font-mono text-base"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={newApplyAllYears} onChange={onNewApplyAllYearsChange} />
                <span className="text-xs text-foreground/60 flex items-center gap-1">
                  <CalendarRange className="w-3 h-3" />
                  {nh('applyToAllYears')}
                </span>
              </label>

              <Input
                placeholder={nh('explanationOptionalPlaceholder')}
                value={newReason}
                onChange={(event) => onNewReasonChange(event.target.value)}
                className="text-sm"
              />

              <Button onClick={onAddFromLedger} disabled={!newAmount} className="w-full gap-2">
                <Plus className="w-4 h-4" />
                {nh('actions.add')}
              </Button>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  )
}
