'use client'

/**
 * Normalisation Review Step
 *
 * H8 Hypothesis: "Een overzichtelijke Normalisatie Review (1 scherm, volledig controleerbaar)"
 *
 * World-class fintech UX (Klarna/Stripe quality):
 * - Full inline editing for amounts with type selector (+€, -€, +%, -%, ABS)
 * - Ledger account search (grootboek zoekbalk) for manual additions
 * - Year scope toggles (current year / all years)
 * - Source attribution (Manual/Yuki/Exact Online/AI)
 * - Accept/Reject with undo capability
 * - 60/30/10 color compliant
 */

import { AnimatePresence } from 'framer-motion'
import { AlertCircle, ChevronRight, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { useManagedTimeout } from '@/hooks/useManagedTimeout'
import type { LedgerAccount } from '../../constants/grootboek'
import { useFetchedLedgerAccounts } from './hooks/useFetchedLedgerAccounts'
import { NormalisationAddForm } from './NormalisationAddForm'
import {
  defaultLedgerAccounts,
  type NormalizationPreset,
} from './NormalisationReviewStep.constants'
import type {
  NormalisationReviewStepProps,
  NormalizationType,
  SuggestedNormalisation,
} from './NormalisationReviewStep.types'
import { NormalisationReviewStepHeader } from './NormalisationReviewStepHeader'
import {
  buildManualNormalisationFromLedger,
  buildNormalisationReviewUpdate,
  filterNormalisationReviewLedgers,
  summarizeNormalisationReview,
} from './NormalisationReviewStepModel'
import { NormalisationSuggestionCard } from './NormalisationSuggestionCard'

export type {
  NormalisationReviewStepProps,
  NormalizationSource,
  NormalizationType,
  SuggestedNormalisation,
} from './NormalisationReviewStep.types'

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function NormalisationReviewStep({
  suggestions,
  originalEbitda,
  companyName,
  sourceIntegration = 'manual',
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onContinue,
  onBack,
  onUpdate,
  onAdd,
}: NormalisationReviewStepProps) {
  const nh = useTranslations('normalizationHub')
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const formatCurrency = useCallback(
    (amount: number) => {
      if (Math.abs(amount) >= 1000000) return `€${(amount / 1000000).toFixed(2)}M`
      if (Math.abs(amount) >= 1000) return `€${(amount / 1000).toFixed(0)}K`
      return new Intl.NumberFormat(currencyLocale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount)
    },
    [currencyLocale]
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false)
  const isProcessingRef = useRef(false)
  const { schedule: scheduleProcessingReset } = useManagedTimeout()
  const { schedule: scheduleContinue } = useManagedTimeout()

  // Edit form state
  const [editAmount, setEditAmount] = useState('')
  const [editType, setEditType] = useState<NormalizationType>('add')
  const [editApplyAllYears, setEditApplyAllYears] = useState(false)
  const [editReason, setEditReason] = useState('')

  // Add form state
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null)
  const [newAmount, setNewAmount] = useState('')
  const [newType, setNewType] = useState<NormalizationType>('add')
  const [newApplyAllYears, setNewApplyAllYears] = useState(false)
  const [newReason, setNewReason] = useState('')

  const fetchedLedgers = useFetchedLedgerAccounts('[NormalisationReviewStep]')

  const availableLedgers = useMemo(() => {
    if (fetchedLedgers.length > 0) return fetchedLedgers
    return defaultLedgerAccounts
  }, [fetchedLedgers])

  const { pendingCount, acceptedCount, rejectedCount, totalAcceptedAdjustment, normalizedEbitda } =
    useMemo(
      () => summarizeNormalisationReview(suggestions, originalEbitda),
      [suggestions, originalEbitda]
    )

  const integrationLabels: Record<string, string> = {
    yuki: nh('sources.yuki'),
    exact: nh('sources.exact'),
    silverfin: nh('sources.silverfin'),
    odoo: nh('sources.odoo'),
    octopus: nh('sources.octopus'),
    expertm: nh('sources.expertm'),
    accountable: nh('sources.accountable'),
    manual: nh('sources.manual'),
  }

  // Filter ledger accounts based on search
  const filteredLedgers = useMemo(() => {
    return filterNormalisationReviewLedgers(availableLedgers, searchQuery)
  }, [searchQuery, availableLedgers])

  // Start editing a normalisation
  const startEditing = useCallback((suggestion: SuggestedNormalisation) => {
    setEditingId(suggestion.id)
    setEditAmount(Math.abs(suggestion.amount).toString())
    setEditType(suggestion.type || (suggestion.amount >= 0 ? 'add' : 'subtract'))
    setEditApplyAllYears(suggestion.applyAllYears || false)
    setEditReason(suggestion.reason || '')
  }, [])

  // Save edit
  const saveEdit = useCallback(() => {
    if (!editingId || !editAmount || !onUpdate) return

    const update = buildNormalisationReviewUpdate({
      amountInput: editAmount,
      type: editType,
      applyAllYears: editApplyAllYears,
      reason: editReason,
      originalEbitda,
    })
    if (!update) return

    onUpdate(editingId, update)

    setEditingId(null)
  }, [editingId, editAmount, editType, editApplyAllYears, editReason, originalEbitda, onUpdate])

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  // Add new normalisation from preset
  const addFromPreset = useCallback(
    (preset: NormalizationPreset) => {
      if (!onAdd) return

      onAdd({
        code: preset.code,
        description: nh(preset.descriptionKey),
        category: preset.category,
        amount: preset.defaultAmount,
        reason: nh(preset.reasonKey),
        source: 'manual',
        type: 'add',
        applyAllYears: false,
        marketBenchmark: preset.marketBenchmark,
      })

      setShowAddForm(false)
    },
    [onAdd, nh]
  )

  // Add from ledger search
  const addFromLedger = useCallback(() => {
    if (!selectedLedger || !newAmount || !onAdd) return

    const normalisation = buildManualNormalisationFromLedger({
      ledger: selectedLedger,
      amountInput: newAmount,
      type: newType,
      applyAllYears: newApplyAllYears,
      reason: newReason,
      originalEbitda,
      fallbackReason: nh('manualCorrection', { name: selectedLedger.name }),
    })
    if (!normalisation) return

    onAdd(normalisation)

    // Reset form
    setSelectedLedger(null)
    setNewAmount('')
    setNewReason('')
    setSearchQuery('')
    setShowAddForm(false)
  }, [selectedLedger, newAmount, newType, newApplyAllYears, newReason, originalEbitda, onAdd, nh])

  const finishProcessing = useCallback(() => {
    isProcessingRef.current = false
    setIsProcessing(false)
  }, [])

  const beginProcessing = useCallback(() => {
    if (isProcessingRef.current) return false
    isProcessingRef.current = true
    setIsProcessing(true)
    return true
  }, [])

  const handleAcceptAll = useCallback(() => {
    if (!beginProcessing()) return

    try {
      onAcceptAll()
    } catch (error) {
      finishProcessing()
      throw error
    }

    scheduleProcessingReset(finishProcessing, 300)
  }, [beginProcessing, finishProcessing, onAcceptAll, scheduleProcessingReset])

  const handleContinue = useCallback(() => {
    if (!beginProcessing()) return

    scheduleContinue(() => {
      finishProcessing()
      onContinue()
    }, 500)
  }, [beginProcessing, finishProcessing, onContinue, scheduleContinue])

  return (
    <div className="h-full flex flex-col bg-background">
      <NormalisationReviewStepHeader
        companyName={companyName}
        sourceLabel={integrationLabels[sourceIntegration]}
        acceptedCount={acceptedCount}
        rejectedCount={rejectedCount}
        pendingCount={pendingCount}
        originalEbitda={originalEbitda}
        totalAcceptedAdjustment={totalAcceptedAdjustment}
        normalizedEbitda={normalizedEbitda}
        formatCurrency={formatCurrency}
        onRejectAll={onRejectAll}
        onAcceptAll={handleAcceptAll}
        isProcessing={isProcessing}
        labels={{
          original: nh('original'),
          adjustment: nh('adjustment'),
          normalized: nh('normalized'),
          toReviewShort: nh('toReviewShort'),
          rejectAll: nh('rejectAll'),
          acceptAll: nh('acceptAll'),
          adjustmentsCount: nh('adjustmentsCount', { count: suggestions.length }),
        }}
      />

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4">
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {suggestions.map((suggestion, index) => {
              const isEditing = editingId === suggestion.id

              return (
                <NormalisationSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  index={index}
                  isEditing={isEditing}
                  canEdit={Boolean(onUpdate)}
                  editAmount={editAmount}
                  editType={editType}
                  editApplyAllYears={editApplyAllYears}
                  editReason={editReason}
                  formatCurrency={formatCurrency}
                  nh={nh}
                  ca={ca}
                  onAccept={onAccept}
                  onReject={onReject}
                  onStartEditing={startEditing}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onEditAmountChange={setEditAmount}
                  onEditTypeChange={setEditType}
                  onEditApplyAllYearsChange={setEditApplyAllYears}
                  onEditReasonChange={setEditReason}
                />
              )
            })}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {suggestions.length === 0 && !showAddForm && (
          <div className="text-center py-12">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-foreground/[0.04] flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 md:w-8 md:h-8 text-foreground/30" />
            </div>
            <p className="text-foreground/60 mb-1 text-sm md:text-base">
              {nh('noNormalizationsDetected')}
            </p>
            <p className="text-xs md:text-sm text-foreground/40 mb-4">
              {nh('noAdjustmentsInData')}
            </p>
            {onAdd && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {nh('addManually')}
              </Button>
            )}
          </div>
        )}

        {/* Add Normalization Form */}
        {onAdd && (
          <NormalisationAddForm
            showAddForm={showAddForm}
            selectedLedger={selectedLedger}
            searchQuery={searchQuery}
            showLedgerDropdown={showLedgerDropdown}
            filteredLedgers={filteredLedgers}
            newType={newType}
            newAmount={newAmount}
            newApplyAllYears={newApplyAllYears}
            newReason={newReason}
            formatCurrency={formatCurrency}
            nh={nh}
            onShowAddFormChange={setShowAddForm}
            onSelectedLedgerChange={setSelectedLedger}
            onSearchQueryChange={setSearchQuery}
            onShowLedgerDropdownChange={setShowLedgerDropdown}
            onNewTypeChange={setNewType}
            onNewAmountChange={setNewAmount}
            onNewApplyAllYearsChange={setNewApplyAllYears}
            onNewReasonChange={setNewReason}
            onAddFromPreset={addFromPreset}
            onAddFromLedger={addFromLedger}
          />
        )}
      </div>

      {/* Footer CTA */}
      <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-foreground/[0.06] bg-background">
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {nh('back')}
          </Button>
          <Button
            variant="primary"
            className="flex-1 gap-2"
            onClick={handleContinue}
            loading={isProcessing}
            disabled={isProcessing || pendingCount > 0}
          >
            {pendingCount > 0
              ? `${pendingCount} ${nh('pendingToReview')}`
              : nh('continueToEstimate')}
            {pendingCount === 0 && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>

        {pendingCount > 0 && (
          <p className="text-center text-[10px] md:text-xs text-foreground/40 mt-2">
            {nh('reviewAllToContinue')}
          </p>
        )}
      </div>
    </div>
  )
}

export default NormalisationReviewStep
