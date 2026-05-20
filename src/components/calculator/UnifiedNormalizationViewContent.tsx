'use client'

import type React from 'react'
import type { LedgerAccount } from '../../constants/grootboek'
import { NormalizationBentoView, NormalizationTableView } from './NormalizationViews'
import { UnifiedNormalizationAddForm } from './UnifiedNormalizationAddForm'
import { UnifiedNormalizationCompactTableView } from './UnifiedNormalizationCompactTableView'
import type { CrossYearPendingNormalizationGroup } from './UnifiedNormalizationCrossYearSuggestions'
import type { NormalizationViewMode } from './UnifiedNormalizationEditorToolbar'
import { UnifiedNormalizationEmptyState } from './UnifiedNormalizationEmptyState'
import type {
  NormalizationItem,
  NormalizationStatus,
  NormalizationType,
  UnifiedNormalizationModalProps,
} from './UnifiedNormalizationTypes'

interface GroupedNormalizationsByYear {
  year: number
  items: NormalizationItem[]
}

interface UnifiedNormalizationViewContentProps {
  showAddForm: boolean
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
  originalEBITDAByYear?: UnifiedNormalizationModalProps['originalEBITDAByYear']
  formatCurrency: (amount: number) => string
  viewMode: NormalizationViewMode
  filteredNormalizations: NormalizationItem[]
  groupedByYear: GroupedNormalizationsByYear[]
  crossYearPendingGroups: CrossYearPendingNormalizationGroup[]
  yearFilter: number | null
  collapsedYears: Set<number>
  selectedIds: Set<string>
  isAllSelected: boolean
  isSomeSelected: boolean
  getLedgerDisplayName: (ledgerCode?: string, ledgerName?: string) => string
  onChangeLedger: () => void
  onTypeChange: (type: NormalizationType) => void
  onValueChange: (value: string) => void
  onSelectedYearsChange: (years: number[]) => void
  onReasonChange: (reason: string) => void
  onSubmit: () => void
  onCancel: () => void
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  onEdit: (item: NormalizationItem) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onToggleYearCollapse: (year: number) => void
  onToggleSelect: (id: string) => void
  onUpdateStatus: (id: string, status: NormalizationStatus) => void
}

export function UnifiedNormalizationViewContent({
  showAddForm,
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
  originalEBITDAByYear,
  formatCurrency,
  viewMode,
  filteredNormalizations,
  groupedByYear,
  crossYearPendingGroups,
  yearFilter,
  collapsedYears,
  selectedIds,
  isAllSelected,
  isSomeSelected,
  getLedgerDisplayName,
  onChangeLedger,
  onTypeChange,
  onValueChange,
  onSelectedYearsChange,
  onReasonChange,
  onSubmit,
  onCancel,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
  onSelectAll,
  onDeselectAll,
  onToggleYearCollapse,
  onToggleSelect,
  onUpdateStatus,
}: UnifiedNormalizationViewContentProps) {
  return (
    <div className="px-6 pb-6 shrink-0">
      <UnifiedNormalizationAddForm
        open={showAddForm}
        addFormRef={addFormRef}
        ledgerButtonRef={ledgerButtonRef}
        selectedLedger={selectedLedger}
        availableYears={availableYears}
        editingId={editingId}
        newType={newType}
        newValue={newValue}
        newSelectedYears={newSelectedYears}
        newReason={newReason}
        safeOriginalEBITDA={safeOriginalEBITDA}
        formatCurrency={formatCurrency}
        onChangeLedger={onChangeLedger}
        onTypeChange={onTypeChange}
        onValueChange={onValueChange}
        onSelectedYearsChange={onSelectedYearsChange}
        onReasonChange={onReasonChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />

      {viewMode === 'financial' ? (
        <NormalizationTableView
          items={filteredNormalizations}
          years={availableYears}
          originalEBITDA={safeOriginalEBITDA}
          originalEBITDAByYear={originalEBITDAByYear}
          onAccept={onAccept}
          onReject={onReject}
          onRemove={onRemove}
          onRestore={onRestore}
          onEdit={onEdit}
        />
      ) : viewMode === 'bento' ? (
        <NormalizationBentoView
          items={filteredNormalizations}
          years={availableYears}
          originalEBITDA={safeOriginalEBITDA}
          originalEBITDAByYear={originalEBITDAByYear}
          onAccept={onAccept}
          onReject={onReject}
          onRemove={onRemove}
          onRestore={onRestore}
          onEdit={onEdit}
        />
      ) : (
        <UnifiedNormalizationCompactTableView
          filteredNormalizations={filteredNormalizations}
          groupedByYear={groupedByYear}
          crossYearPendingGroups={crossYearPendingGroups}
          yearFilter={yearFilter}
          collapsedYears={collapsedYears}
          selectedIds={selectedIds}
          isAllSelected={isAllSelected}
          isSomeSelected={isSomeSelected}
          safeOriginalEBITDA={safeOriginalEBITDA}
          originalEBITDAByYear={originalEBITDAByYear}
          getLedgerDisplayName={getLedgerDisplayName}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onToggleYearCollapse={onToggleYearCollapse}
          onToggleSelect={onToggleSelect}
          onUpdateStatus={onUpdateStatus}
          onRemove={onRemove}
          onEdit={onEdit}
        />
      )}

      {(viewMode === 'financial' || viewMode === 'bento') &&
        filteredNormalizations.length === 0 && <UnifiedNormalizationEmptyState />}
    </div>
  )
}
