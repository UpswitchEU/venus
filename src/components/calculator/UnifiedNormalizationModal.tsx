'use client'

/**
 * Unified Normalization Modal
 *
 * Single source of truth for all EBITDA normalizations.
 * Features integrated Yuki/Exact/CSV upload and grootboekcode-centric UI.
 *
 * Entry points:
 * - Sidebar "Normalisaties" button
 * - Chat commands (e.g., "Normaliseer huur")
 * - Quick Actions panel clicks
 */

import { CalendarRange, CheckCircle2, ChevronRight, Clock, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, ModalContent } from '@/design-system/components/Modal'
import type { LedgerAccount } from '../../constants/grootboek'
import { getNetTaxLatencyImpact, useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import {
  findAcceptedAutoNormalizationCapBreaches,
  getReportedEbitdaBaseline,
  summarizeAcceptedNormalizations,
  summarizeNormalizationsForAnchorYear,
} from '../../utils/normalizationMath'
import { useFetchedLedgerAccounts } from './hooks/useFetchedLedgerAccounts'
import { TaxLatencySection } from './TaxLatencySection'
import { UnifiedNormalizationBulkActionsBar } from './UnifiedNormalizationBulkActionsBar'
import { UnifiedNormalizationEditorToggle } from './UnifiedNormalizationEditorToggle'
import type { NormalizationViewMode } from './UnifiedNormalizationEditorToolbar'
import { inferCategoryFromCode } from './UnifiedNormalizationHelpers'
import {
  bulkUpdateNormalizationStatus,
  removeSelectedNormalizations,
  updateNormalizationStatus,
} from './UnifiedNormalizationModalActions'
import { UnifiedNormalizationModalFooter } from './UnifiedNormalizationModalFooter'
import {
  type NormalizationPrimaryTab,
  UnifiedNormalizationModalHeader,
} from './UnifiedNormalizationModalHeader'
import {
  buildCrossYearPendingGroups,
  countPersistedTaxLatencyCandidates,
  groupNormalizationsByYear,
  resolveAvailableYears,
  resolveSafeOriginalEbitda,
} from './UnifiedNormalizationModalModel'
import { UnifiedNormalizationPromptEditor } from './UnifiedNormalizationPromptEditor'
import {
  isImportedLedgerNormalizationItem,
  type NormalizationItem,
  type NormalizationSource,
  type NormalizationStatus,
  type NormalizationType,
  requiresIndividualImportedNormalizationReview,
  type UnifiedNormalizationModalProps,
} from './UnifiedNormalizationTypes'
import { UnifiedNormalizationViewContent } from './UnifiedNormalizationViewContent'
import {
  type AutoNormalizationCapBreach,
  AutoNormalizationCapWarning,
  TaxLatencyReviewWarning,
} from './UnifiedNormalizationWarnings'
import { useUnifiedNormalizationDraftEditor } from './useUnifiedNormalizationDraftEditor'

export type { LedgerAccount } from '../../constants/grootboek'
export { inferCategoryFromCode } from './UnifiedNormalizationHelpers'
export type {
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
  NormalizationType,
  UnifiedNormalizationModalProps,
} from './UnifiedNormalizationTypes'
export { isImportedLedgerNormalizationItem } from './UnifiedNormalizationTypes'

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function UnifiedNormalizationModal({
  open,
  onOpenChange,
  companyName,
  currentYear = getCurrentFilingYear(),
  originalEBITDA,
  originalEBITDAByYear,
  normalizations,
  onNormalizationsChange,
  ledgerAccounts = [],
  countryCode,
  onUploadClick,
  initialSearchQuery = '',
  initialYearFilter = null,
  financialYears,
  fallbackFormDataRef,
}: UnifiedNormalizationModalProps) {
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
  const taxLatencyCount = useTaxLatencyStore((s) => s.items.length)
  const taxLatencyCandidateCount = useTaxLatencyStore((s) => s.candidates.length)
  const taxLatencyNetImpact = useTaxLatencyStore((s) => getNetTaxLatencyImpact(s.items))

  const [primaryTab, setPrimaryTab] = useState<NormalizationPrimaryTab>('ebitda')

  // View mode: bento (cards), compact (table rows), or financial (multi-year table)
  const [viewMode, setViewMode] = useState<NormalizationViewMode>('compact')

  // Note: We use searchQuery for both adding new normalizations AND filtering existing ones

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Full state reset when modal opens/closes to prevent stale UI between sessions
  useEffect(() => {
    if (open) {
      setPrimaryTab('ebitda')
      setSelectedIds(new Set())
    }
  }, [open])

  // Year grouping: collapsed state for each year
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!open) setCollapsedYears(new Set())
  }, [open])

  // Derive available years from user-entered financial data, falling back to 4-year range
  const availableYears = useMemo(
    () => resolveAvailableYears(currentYear, financialYears),
    [currentYear, financialYears]
  )

  // Get unique years from normalizations for filter
  const _yearsInData = useMemo(() => {
    const years = new Set<number>()
    normalizations.forEach((n) => {
      if (n.applyYears && n.applyYears.length > 0) {
        n.applyYears.forEach((y) => years.add(y))
      } else {
        years.add(n.year)
      }
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [normalizations])

  const fetchedLedgers = useFetchedLedgerAccounts('[UnifiedNormalizationModal]')

  // Keep explicit 0 EBITDA values instead of falling through to unrelated fallback sources.
  const safeOriginalEBITDA = resolveSafeOriginalEbitda({
    currentYear,
    originalEBITDA,
    originalEBITDAByYear,
    fallbackFormData: fallbackFormDataRef?.current,
  })

  const {
    addFormRef,
    inputContainerRef,
    searchInputRef,
    ledgerButtonRef,
    listContainerRef,
    fileInputRef,
    normalizationPresets,
    filteredLedgers,
    getLedgerDisplayName,
    dropdownAnchorRect,
    searchQuery,
    showAddForm,
    selectedLedger,
    showLedgerDropdown,
    newType,
    newValue,
    newSelectedYears,
    newReason,
    editingId,
    isEditorExpanded,
    yearFilter,
    setIsEditorExpanded,
    setYearFilter,
    setNewType,
    setNewValue,
    setNewSelectedYears,
    setNewReason,
    startEditing,
    cancelEditing,
    addNormalization,
    handleFileUpload,
    openSelectedLedgerPicker,
    handleSearchQueryChange,
    closeLedgerDropdown,
    selectLedgerAccount,
    selectCustomLedger,
    selectPreset,
    openFilePicker,
    handlePromptSubmit,
  } = useUnifiedNormalizationDraftEditor({
    open,
    currentYear,
    initialSearchQuery,
    initialYearFilter,
    availableYears,
    ledgerAccounts: ledgerAccounts.length > 0 ? ledgerAccounts : fetchedLedgers,
    countryCode,
    normalizations,
    onNormalizationsChange,
    onUploadClick,
    safeOriginalEBITDA,
    translate: nh,
  })

  // Filter normalizations by year and search
  const filteredNormalizations = useMemo(() => {
    let result = normalizations

    // Filter by year
    if (yearFilter !== null) {
      result = result.filter((n) => {
        if (n.applyAllYears) return true
        if (n.applyYears && n.applyYears.length > 0) {
          return n.applyYears.includes(yearFilter)
        }
        return n.year === yearFilter
      })
    }

    // Filter by search query (using main searchQuery for dual-purpose input)
    if (searchQuery.trim() && !showAddForm) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (n) =>
          (n.ledgerCode && n.ledgerCode.toLowerCase().includes(query)) ||
          getLedgerDisplayName(n.ledgerCode, n.ledgerName).toLowerCase().includes(query) ||
          (n.reason && n.reason.toLowerCase().includes(query))
      )
    }

    return result
  }, [normalizations, yearFilter, searchQuery, showAddForm, getLedgerDisplayName])

  /** Headline EBITDA bridge tiles: anchor year (`currentYear`), full store — unaffected by modal search UX. Filtered fiscal year preserves table-scoped totals. */
  const totals = useMemo(() => {
    if (yearFilter == null) {
      const anchorBaseline = getReportedEbitdaBaseline({
        year: currentYear,
        originalEBITDAByYear,
        fallbackCandidates: [safeOriginalEBITDA],
      })
      return summarizeNormalizationsForAnchorYear(normalizations, currentYear, anchorBaseline)
    }
    const reportedEbitda = getReportedEbitdaBaseline({
      year: yearFilter,
      originalEBITDAByYear,
      fallbackCandidates: [safeOriginalEBITDA],
    })
    return summarizeAcceptedNormalizations(filteredNormalizations, reportedEbitda)
  }, [
    normalizations,
    filteredNormalizations,
    yearFilter,
    originalEBITDAByYear,
    safeOriginalEBITDA,
    currentYear,
  ])

  const autoNormalizationCapBreaches = useMemo<AutoNormalizationCapBreach[]>(
    () =>
      findAcceptedAutoNormalizationCapBreaches({
        items: normalizations,
        availableYears,
        reportedEbitdaByYear: originalEBITDAByYear,
        fallbackYear: currentYear,
        fallbackReportedEbitda: safeOriginalEBITDA,
      }),
    [normalizations, availableYears, originalEBITDAByYear, currentYear, safeOriginalEBITDA]
  )

  const persistedTaxLatencyCandidateCount = countPersistedTaxLatencyCandidates(
    fallbackFormDataRef?.current
  )

  const requiresTaxLatencyReview =
    taxLatencyCount === 0 && (taxLatencyCandidateCount > 0 || persistedTaxLatencyCandidateCount > 0)
  const isDutch = String(locale).toLowerCase().startsWith('nl')

  // Auto-detected suggestions (pending + zero adjustment) that fire identically
  // across ≥2 years are noise when expanded into per-year rows — the same "rent
  // is high" flag appearing in 2021..2025 reads as five rows of nothing. Lift
  // them into a single consolidated card and exclude them from the per-year
  // grouping below. Accepted items keep year-specific rows because their
  // adjustments differ per year (different revenue / line totals).
  const crossYearPendingGroups = useMemo(
    () => buildCrossYearPendingGroups(filteredNormalizations),
    [filteredNormalizations]
  )

  const crossYearPendingIds = useMemo(
    () => new Set(crossYearPendingGroups.flatMap((bucket) => bucket.ids)),
    [crossYearPendingGroups]
  )

  // Group normalizations by year for collapsible sections.
  // Cross-year pending duplicates are surfaced separately above the year cards.
  const groupedByYear = useMemo(
    () =>
      groupNormalizationsByYear({
        filteredNormalizations,
        availableYears,
        crossYearPendingIds,
      }),
    [filteredNormalizations, availableYears, crossYearPendingIds]
  )

  // Toggle year collapse
  const toggleYearCollapse = useCallback((year: number) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) {
        next.delete(year)
      } else {
        next.add(year)
      }
      return next
    })
  }, [])

  // Bulk selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredNormalizations.map((n) => n.id)))
  }, [filteredNormalizations])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const isAllSelected =
    filteredNormalizations.length > 0 && filteredNormalizations.every((n) => selectedIds.has(n.id))
  const isSomeSelected = filteredNormalizations.some((n) => selectedIds.has(n.id))
  const bulkAcceptBlockedCount = useMemo(
    () =>
      normalizations.filter(
        (n) =>
          selectedIds.has(n.id) &&
          n.status !== 'accepted' &&
          requiresIndividualImportedNormalizationReview(n)
      ).length,
    [normalizations, selectedIds]
  )

  // Actions
  const updateStatus = useCallback(
    (id: string, status: NormalizationStatus) => {
      onNormalizationsChange(
        updateNormalizationStatus({
          items: normalizations,
          id,
          status,
          acceptedAt: new Date().toISOString(),
        })
      )
    },
    [normalizations, onNormalizationsChange]
  )

  const bulkUpdateStatus = useCallback(
    (status: NormalizationStatus) => {
      onNormalizationsChange(
        bulkUpdateNormalizationStatus({
          items: normalizations,
          selectedIds,
          status,
          acceptedAt: new Date().toISOString(),
        })
      )
      setSelectedIds(new Set())
    },
    [normalizations, onNormalizationsChange, selectedIds]
  )

  const bulkDelete = useCallback(() => {
    const count = selectedIds.size
    if (
      typeof window !== 'undefined' &&
      !window.confirm(nh('confirmBulkRemoveNormalizations', { count }))
    )
      return
    onNormalizationsChange(removeSelectedNormalizations({ items: normalizations, selectedIds }))
    setSelectedIds(new Set())
  }, [normalizations, onNormalizationsChange, selectedIds, nh])

  const removeNormalization = useCallback(
    (id: string) => {
      onNormalizationsChange(normalizations.filter((n) => n.id !== id))
    },
    [normalizations, onNormalizationsChange]
  )

  const removeWithConfirmation = useCallback(
    (id: string) => {
      if (typeof window !== 'undefined' && !window.confirm(nh('confirmRemoveNormalization'))) return
      removeNormalization(id)
    },
    [removeNormalization, nh]
  )

  return (
    <Modal open={open} onOpenChange={onOpenChange} coordinatedScrollLock>
      <ModalContent
        className="sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] min-h-0 flex flex-col p-0"
        size="full"
        description={nh('modalTitle')}
      >
        <UnifiedNormalizationModalHeader
          companyName={companyName}
          primaryTab={primaryTab}
          onPrimaryTabChange={setPrimaryTab}
          onClose={() => onOpenChange(false)}
          totals={totals}
          formatCurrency={formatCurrency}
          currentYear={currentYear}
          yearFilter={yearFilter}
          taxLatencyCount={taxLatencyCount}
          taxLatencyCandidateCount={taxLatencyCandidateCount}
          taxLatencyNetImpact={taxLatencyNetImpact}
          currencyLocale={currencyLocale}
        />

        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {primaryTab === 'ebitda' ? (
            <div
              ref={listContainerRef}
              id="ebitda-tab-content"
              role="tabpanel"
              className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-contain outline-none"
            >
              <AutoNormalizationCapWarning
                breaches={autoNormalizationCapBreaches}
                isDutch={isDutch}
                formatCurrency={formatCurrency}
              />

              <UnifiedNormalizationEditorToggle
                expanded={isEditorExpanded}
                onToggle={() => setIsEditorExpanded((expanded) => !expanded)}
              />

              <UnifiedNormalizationPromptEditor
                expanded={isEditorExpanded}
                inputContainerRef={inputContainerRef}
                fileInputRef={fileInputRef}
                searchInputRef={searchInputRef}
                searchQuery={searchQuery}
                showAddForm={showAddForm}
                normalizationsCount={normalizations.length}
                presets={normalizationPresets}
                filteredLedgers={filteredLedgers}
                showLedgerDropdown={showLedgerDropdown}
                dropdownAnchorRect={dropdownAnchorRect}
                availableYears={availableYears}
                yearFilter={yearFilter}
                viewMode={viewMode}
                onSearchQueryChange={handleSearchQueryChange}
                onPromptSubmit={handlePromptSubmit}
                onFileUpload={handleFileUpload}
                onUploadClick={openFilePicker}
                onPresetSelect={selectPreset}
                onCloseLedgerDropdown={closeLedgerDropdown}
                onLedgerSelect={selectLedgerAccount}
                onCustomLedgerSelect={selectCustomLedger}
                onYearFilterChange={setYearFilter}
                onViewModeChange={setViewMode}
              />

              <UnifiedNormalizationBulkActionsBar
                selectedCount={selectedIds.size}
                bulkAcceptBlockedCount={bulkAcceptBlockedCount}
                onDeselectAll={deselectAll}
                onBulkUpdateStatus={bulkUpdateStatus}
                onBulkDelete={bulkDelete}
              />

              <UnifiedNormalizationViewContent
                showAddForm={showAddForm}
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
                originalEBITDAByYear={originalEBITDAByYear}
                formatCurrency={formatCurrency}
                viewMode={viewMode}
                filteredNormalizations={filteredNormalizations}
                groupedByYear={groupedByYear}
                crossYearPendingGroups={crossYearPendingGroups}
                yearFilter={yearFilter}
                collapsedYears={collapsedYears}
                selectedIds={selectedIds}
                isAllSelected={isAllSelected}
                isSomeSelected={isSomeSelected}
                getLedgerDisplayName={getLedgerDisplayName}
                onChangeLedger={openSelectedLedgerPicker}
                onTypeChange={setNewType}
                onValueChange={setNewValue}
                onSelectedYearsChange={setNewSelectedYears}
                onReasonChange={setNewReason}
                onSubmit={addNormalization}
                onCancel={cancelEditing}
                onAccept={(id) => updateStatus(id, 'accepted')}
                onReject={(id) => updateStatus(id, 'rejected')}
                onRemove={removeWithConfirmation}
                onRestore={(id) => updateStatus(id, 'pending')}
                onEdit={startEditing}
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
                onToggleYearCollapse={toggleYearCollapse}
                onToggleSelect={toggleSelect}
                onUpdateStatus={updateStatus}
              />
            </div>
          ) : (
            <div
              id="balans-tab-content"
              role="tabpanel"
              aria-label={nh('section2Header')}
              className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pt-2 pb-6"
            >
              <TaxLatencyReviewWarning visible={requiresTaxLatencyReview} isDutch={isDutch} />
              <TaxLatencySection alwaysExpanded />
            </div>
          )}
        </div>

        <UnifiedNormalizationModalFooter
          primaryTab={primaryTab}
          filteredNormalizationsCount={filteredNormalizations.length}
          normalizationsCount={normalizations.length}
          yearFilter={yearFilter}
          taxLatencyCount={taxLatencyCount}
          onClose={() => onOpenChange(false)}
        />
      </ModalContent>
    </Modal>
  )
}

export default UnifiedNormalizationModal
