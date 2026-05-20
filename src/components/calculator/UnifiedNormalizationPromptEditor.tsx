'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Search, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type React from 'react'
import { createPortal } from 'react-dom'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'
import type { NormalizationViewMode } from './UnifiedNormalizationEditorToolbar'
import { UnifiedNormalizationEditorToolbar } from './UnifiedNormalizationEditorToolbar'
import type {
  NormalizationPresetOption,
  SearchableLedgerAccount,
} from './UnifiedNormalizationTypes'

interface UnifiedNormalizationPromptEditorProps {
  expanded: boolean
  inputContainerRef: React.Ref<HTMLDivElement>
  fileInputRef: React.Ref<HTMLInputElement>
  searchInputRef: React.Ref<HTMLInputElement>
  searchQuery: string
  showAddForm: boolean
  normalizationsCount: number
  presets: NormalizationPresetOption[]
  filteredLedgers: SearchableLedgerAccount[]
  showLedgerDropdown: boolean
  dropdownAnchorRect: DOMRect | null
  availableYears: number[]
  yearFilter: number | null
  viewMode: NormalizationViewMode
  onSearchQueryChange: (query: string) => void
  onPromptSubmit: (query: string) => void
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onUploadClick: () => void
  onPresetSelect: (preset: NormalizationPresetOption) => void
  onCloseLedgerDropdown: () => void
  onLedgerSelect: (account: SearchableLedgerAccount) => void
  onCustomLedgerSelect: (query: string) => void
  onYearFilterChange: (year: number | null) => void
  onViewModeChange: (mode: NormalizationViewMode) => void
}

export function UnifiedNormalizationPromptEditor({
  expanded,
  inputContainerRef,
  fileInputRef,
  searchInputRef,
  searchQuery,
  showAddForm,
  normalizationsCount,
  presets,
  filteredLedgers,
  showLedgerDropdown,
  dropdownAnchorRect,
  availableYears,
  yearFilter,
  viewMode,
  onSearchQueryChange,
  onPromptSubmit,
  onFileUpload,
  onUploadClick,
  onPresetSelect,
  onCloseLedgerDropdown,
  onLedgerSelect,
  onCustomLedgerSelect,
  onYearFilterChange,
  onViewModeChange,
}: UnifiedNormalizationPromptEditorProps) {
  const nh = useTranslations('normalizationHub')
  const trimmedQuery = searchQuery.trim()

  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          id="normalization-editor-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="overflow-hidden border-b border-foreground/[0.06] shrink-0"
        >
          <div ref={inputContainerRef} className="px-6 py-4 relative shrink-0">
            <p
              className={cn(
                'text-xs text-foreground/50 leading-snug mb-3',
                LEDGER_LABEL_TEXT_CLASSES
              )}
            >
              {nh('editorToggleSubtitle')}
            </p>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'relative rounded-2xl',
                'bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.02]',
                'backdrop-blur-sm',
                'border border-foreground/[0.08]',
                'transition-all duration-300',
                'focus-within:border-foreground/20 focus-within:shadow-[0_0_20px_-8px_hsl(var(--foreground)/0.06)]'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={onFileUpload}
                className="hidden"
              />

              <div className="flex items-center gap-3 px-4 py-3">
                <Search className="w-4 h-4 text-foreground/40 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={
                    showAddForm
                      ? nh('searchOtherLedger')
                      : normalizationsCount > 0
                        ? nh('searchOrAddNew')
                        : nh('typeCodeOrChoose')
                  }
                  value={searchQuery}
                  title={trimmedQuery.length > 0 ? searchQuery : undefined}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && trimmedQuery) {
                      event.preventDefault()
                      onPromptSubmit(searchQuery)
                    }
                  }}
                  className={cn(
                    'flex-1 bg-transparent border-none outline-none',
                    'focus:outline-none focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus:shadow-none focus:border-transparent',
                    'text-sm text-foreground placeholder:text-foreground/35',
                    'min-w-0'
                  )}
                />

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onUploadClick}
                  className={cn(
                    'p-2 rounded-lg flex items-center gap-1.5',
                    'text-foreground/50 hover:text-foreground/70',
                    'bg-foreground/[0.04] hover:bg-foreground/[0.08]',
                    'border border-foreground/[0.06]',
                    'transition-all duration-200'
                  )}
                  title={nh('importLedger')}
                >
                  <Upload className="w-4 h-4" />
                </motion.button>
              </div>

              <AnimatePresence>
                {!showAddForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="px-4 pb-3 pt-2"
                  >
                    <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                      {presets.slice(0, 6).map((preset, index) => (
                        <motion.button
                          key={preset.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: 0.05 * index,
                            type: 'spring',
                            stiffness: 400,
                            damping: 25,
                          }}
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => onPresetSelect(preset)}
                          className={cn(
                            'inline-flex shrink-0 items-center px-4 py-2 rounded-xl',
                            'bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.02]',
                            'border border-foreground/[0.08]',
                            'text-xs text-foreground/70 font-medium',
                            'hover:bg-gradient-to-br hover:from-foreground/[0.08] hover:to-foreground/[0.04]',
                            'hover:border-foreground/[0.15] hover:text-foreground',
                            'hover:shadow-md hover:shadow-foreground/[0.03]',
                            'transition-all duration-200'
                          )}
                        >
                          {preset.label}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {showLedgerDropdown &&
                trimmedQuery.length > 0 &&
                dropdownAnchorRect &&
                createPortal(
                  <LedgerDropdown
                    searchQuery={searchQuery}
                    anchorRect={dropdownAnchorRect}
                    ledgers={filteredLedgers}
                    onClose={onCloseLedgerDropdown}
                    onLedgerSelect={onLedgerSelect}
                    onCustomLedgerSelect={onCustomLedgerSelect}
                  />,
                  document.body
                )}
            </motion.div>
          </div>

          <UnifiedNormalizationEditorToolbar
            availableYears={availableYears}
            yearFilter={yearFilter}
            viewMode={viewMode}
            onYearFilterChange={onYearFilterChange}
            onViewModeChange={onViewModeChange}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface LedgerDropdownProps {
  searchQuery: string
  anchorRect: DOMRect
  ledgers: SearchableLedgerAccount[]
  onClose: () => void
  onLedgerSelect: (account: SearchableLedgerAccount) => void
  onCustomLedgerSelect: (query: string) => void
}

function LedgerDropdown({
  searchQuery,
  anchorRect,
  ledgers,
  onClose,
  onLedgerSelect,
  onCustomLedgerSelect,
}: LedgerDropdownProps) {
  const nh = useTranslations('normalizationHub')
  const trimmedQuery = searchQuery.trim()

  return (
    <div className="fixed inset-0 z-[11000] pointer-events-none">
      <button
        type="button"
        aria-label={nh('closeLedgerDropdown')}
        className="absolute inset-0 pointer-events-auto bg-transparent"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="absolute z-[11001] pointer-events-auto py-1 bg-background border border-foreground/10 rounded-xl shadow-2xl max-h-[min(26rem,55vh)] overflow-y-auto"
        style={{
          top: anchorRect.bottom + 4,
          left: anchorRect.left,
          width: Math.max(anchorRect.width, 320),
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-3 py-1.5 border-b border-foreground/[0.06] flex items-center justify-between sticky top-0 bg-background z-10">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
            {nh('ledgerAccounts')}
          </span>
          <span className="text-[10px] text-foreground/30 tabular-nums">
            {ledgers.length > 0
              ? nh('foundCount', { count: ledgers.length })
              : nh('customLedgerCode')}
          </span>
        </div>
        <div className="py-0.5">
          {ledgers.map((account, index) => (
            <LedgerDropdownRow
              key={account.code}
              account={account}
              index={index}
              onSelect={() => onLedgerSelect(account)}
            />
          ))}
          {trimmedQuery && (
            <CustomLedgerRow
              query={trimmedQuery}
              hasLedgerMatches={ledgers.length > 0}
              onSelect={() => onCustomLedgerSelect(searchQuery)}
            />
          )}
        </div>
      </motion.div>
    </div>
  )
}

interface LedgerDropdownRowProps {
  account: SearchableLedgerAccount
  index: number
  onSelect: () => void
}

function LedgerDropdownRow({ account, index, onSelect }: LedgerDropdownRowProps) {
  return (
    <motion.button
      key={account.code}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.015, 0.15) }}
      onClick={onSelect}
      className="w-full px-3 py-2.5 text-left hover:bg-primary/5 flex items-start gap-2.5 transition-colors group"
    >
      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold min-w-[3rem] text-center group-hover:bg-primary/15 transition-colors flex-shrink-0 mt-0.5">
        {renderHighlightedText(account.code, account._codeIndices ?? [], 'font-bold')}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-foreground/90 leading-snug', LEDGER_LABEL_TEXT_CLASSES)}>
          {renderHighlightedText(account.name, account._nameIndices ?? [], 'font-semibold')}
        </p>
        {account.category && (
          <p
            className={cn(
              'text-[10px] text-foreground/40 leading-snug mt-0.5',
              LEDGER_LABEL_TEXT_CLASSES
            )}
          >
            {account.category}
          </p>
        )}
      </div>
    </motion.button>
  )
}

interface CustomLedgerRowProps {
  query: string
  hasLedgerMatches: boolean
  onSelect: () => void
}

function CustomLedgerRow({ query, hasLedgerMatches, onSelect }: CustomLedgerRowProps) {
  const nh = useTranslations('normalizationHub')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'w-full px-3 py-3 text-left hover:bg-primary/5 flex items-center justify-between gap-2.5 transition-colors min-h-[52px] cursor-pointer',
        hasLedgerMatches && 'border-t border-foreground/[0.06]'
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold min-w-[3rem] text-center flex-shrink-0">
          +
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground/90 font-medium">{nh('useCustomCode', { query })}</p>
          <p className="text-[10px] text-foreground/40 mt-0.5">{nh('customLedgerCode')}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        {nh('actions.add')}
      </button>
    </div>
  )
}

function renderHighlightedText(text: string, indices: number[], emphasisClassName: string) {
  if (indices.length === 0) return text
  return text.split('').map((char, index) => (
    <span
      key={`${char}-${index}`}
      className={indices.includes(index) ? `text-primary ${emphasisClassName}` : ''}
    >
      {char}
    </span>
  ))
}
