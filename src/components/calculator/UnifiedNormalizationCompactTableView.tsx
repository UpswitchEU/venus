'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckSquare, ChevronDown, Minus as MinusSquare, Square } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { cn } from '@/design-system/utils'
import {
  getReportedEbitdaBaseline,
  summarizeAcceptedNormalizations,
} from '../../utils/normalizationMath'
import { CompactTableRow } from './UnifiedNormalizationCompactTableRow'
import {
  type CrossYearPendingNormalizationGroup,
  UnifiedNormalizationCrossYearSuggestions,
} from './UnifiedNormalizationCrossYearSuggestions'
import { UnifiedNormalizationEmptyState } from './UnifiedNormalizationEmptyState'
import type {
  NormalizationItem,
  NormalizationStatus,
  UnifiedNormalizationModalProps,
} from './UnifiedNormalizationTypes'

interface GroupedNormalizationsByYear {
  year: number
  items: NormalizationItem[]
}

interface CompactTableHeaderProps {
  showYear: boolean
  isAllSelected?: boolean
  isSomeSelected?: boolean
  onToggleSelectAll?: () => void
}

function CompactTableHeader({
  showYear,
  isAllSelected = false,
  isSomeSelected = false,
  onToggleSelectAll,
}: CompactTableHeaderProps) {
  const nh = useTranslations('normalizationHub')

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-t border-b border-foreground/[0.06] bg-foreground/[0.01]">
      <div className="w-6 flex-shrink-0">
        {onToggleSelectAll ? (
          <button
            onClick={onToggleSelectAll}
            className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : isSomeSelected ? (
              <MinusSquare className="w-4 h-4 text-primary/60" />
            ) : (
              <Square className="w-4 h-4 text-foreground/30" />
            )}
          </button>
        ) : null}
      </div>
      <div className="w-16 flex-shrink-0">{nh('table.code')}</div>
      <div className="flex-1 min-w-0">{nh('table.grootboekrekening')}</div>
      {showYear ? <div className="w-20 flex-shrink-0 text-center">{nh('table.jaar')}</div> : null}
      <div className="w-36 flex-shrink-0 text-center">{nh('table.bron')}</div>
      <div className="w-32 flex-shrink-0 text-center">{nh('table.status')}</div>
      <div className="w-28 flex-shrink-0 text-right">{nh('amount')}</div>
      <div className="w-20 flex-shrink-0 text-right">{nh('table.acties')}</div>
    </div>
  )
}

interface YearNormalizationSectionProps {
  year: number
  items: NormalizationItem[]
  collapsed: boolean
  selectedIds: Set<string>
  originalEBITDAByYear?: UnifiedNormalizationModalProps['originalEBITDAByYear']
  safeOriginalEBITDA: number
  getLedgerDisplayName: (ledgerCode?: string, ledgerName?: string) => string
  onToggleCollapse: (year: number) => void
  onToggleSelect: (id: string) => void
  onUpdateStatus: (id: string, status: NormalizationStatus) => void
  onRemove: (id: string) => void
  onEdit: (item: NormalizationItem) => void
}

function YearNormalizationSection({
  year,
  items,
  collapsed,
  selectedIds,
  originalEBITDAByYear,
  safeOriginalEBITDA,
  getLedgerDisplayName,
  onToggleCollapse,
  onToggleSelect,
  onUpdateStatus,
  onRemove,
  onEdit,
}: YearNormalizationSectionProps) {
  const nh = useTranslations('normalizationHub')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const formatCurrency = useCallback(
    (amount: number) => {
      const safe = Number.isFinite(amount) ? amount : 0
      return new Intl.NumberFormat(currencyLocale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe)
    },
    [currencyLocale]
  )
  const yearSummary = summarizeAcceptedNormalizations(
    items,
    getReportedEbitdaBaseline({
      year,
      originalEBITDAByYear,
      fallbackCandidates: [safeOriginalEBITDA],
    })
  )
  const yearEbitda = yearSummary.original
  const yearTotal = yearSummary.adjustment

  return (
    <div className="rounded-xl border border-foreground/[0.06] overflow-hidden">
      <button
        onClick={() => onToggleCollapse(year)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          'bg-foreground/[0.02] hover:bg-foreground/[0.04]',
          'transition-colors'
        )}
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <ChevronDown className="w-4 h-4 text-foreground/40" />
          </motion.div>
          <span className="text-sm font-semibold text-foreground tabular-nums">{year}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
            {nh('itemCount', { count: items.length })}
          </span>
        </div>
        <span
          className={cn(
            'text-sm font-mono font-semibold tabular-nums',
            yearTotal > 0 ? 'text-success' : yearTotal < 0 ? 'text-secondary' : 'text-foreground/40'
          )}
        >
          {yearTotal > 0 ? '+' : ''}
          {formatCurrency(yearTotal)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[920px]">
                <CompactTableHeader showYear={false} />
                <div>
                  {items.map((item) => (
                    <CompactTableRow
                      key={item.id}
                      item={item}
                      isSelected={selectedIds.has(item.id)}
                      getLedgerDisplayName={getLedgerDisplayName}
                      onToggleSelect={() => onToggleSelect(item.id)}
                      onAccept={() => onUpdateStatus(item.id, 'accepted')}
                      onReject={() => onUpdateStatus(item.id, 'rejected')}
                      onRemove={() => onRemove(item.id)}
                      onRestore={() => onUpdateStatus(item.id, 'pending')}
                      onEdit={() => onEdit(item)}
                      hideYear
                      yearEbitda={yearEbitda}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface UnifiedNormalizationCompactTableViewProps {
  filteredNormalizations: NormalizationItem[]
  groupedByYear: GroupedNormalizationsByYear[]
  crossYearPendingGroups: CrossYearPendingNormalizationGroup[]
  yearFilter: number | null
  collapsedYears: Set<number>
  selectedIds: Set<string>
  isAllSelected: boolean
  isSomeSelected: boolean
  safeOriginalEBITDA: number
  originalEBITDAByYear?: UnifiedNormalizationModalProps['originalEBITDAByYear']
  getLedgerDisplayName: (ledgerCode?: string, ledgerName?: string) => string
  onSelectAll: () => void
  onDeselectAll: () => void
  onToggleYearCollapse: (year: number) => void
  onToggleSelect: (id: string) => void
  onUpdateStatus: (id: string, status: NormalizationStatus) => void
  onRemove: (id: string) => void
  onEdit: (item: NormalizationItem) => void
}

export function UnifiedNormalizationCompactTableView({
  filteredNormalizations,
  groupedByYear,
  crossYearPendingGroups,
  yearFilter,
  collapsedYears,
  selectedIds,
  isAllSelected,
  isSomeSelected,
  safeOriginalEBITDA,
  originalEBITDAByYear,
  getLedgerDisplayName,
  onSelectAll,
  onDeselectAll,
  onToggleYearCollapse,
  onToggleSelect,
  onUpdateStatus,
  onRemove,
  onEdit,
}: UnifiedNormalizationCompactTableViewProps) {
  const hasRows = filteredNormalizations.length > 0

  return (
    <>
      {hasRows && yearFilter !== null && (
        <div className="mb-1 min-w-0 overflow-x-auto">
          <div className="min-w-[920px]">
            <CompactTableHeader
              showYear
              isAllSelected={isAllSelected}
              isSomeSelected={isSomeSelected}
              onToggleSelectAll={() => (isAllSelected ? onDeselectAll() : onSelectAll())}
            />
          </div>
        </div>
      )}

      <UnifiedNormalizationCrossYearSuggestions
        groups={crossYearPendingGroups}
        getLedgerDisplayName={getLedgerDisplayName}
        onRejectGroup={(ids) => {
          for (const id of ids) onUpdateStatus(id, 'rejected')
        }}
        onReviewGroup={onEdit}
      />

      {hasRows ? (
        <div className="space-y-3">
          {groupedByYear.map(({ year, items }) => (
            <YearNormalizationSection
              key={year}
              year={year}
              items={items}
              collapsed={collapsedYears.has(year)}
              selectedIds={selectedIds}
              originalEBITDAByYear={originalEBITDAByYear}
              safeOriginalEBITDA={safeOriginalEBITDA}
              getLedgerDisplayName={getLedgerDisplayName}
              onToggleCollapse={onToggleYearCollapse}
              onToggleSelect={onToggleSelect}
              onUpdateStatus={onUpdateStatus}
              onRemove={onRemove}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : (
        <UnifiedNormalizationEmptyState />
      )}
    </>
  )
}
