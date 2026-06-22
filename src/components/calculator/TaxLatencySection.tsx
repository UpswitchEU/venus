'use client'

/**
 * Tax Latency Section
 *
 * Ledger-linked deferred tax rows for the EV-to-equity bridge.
 * Accountants can tie each latency to a balance-sheet account and review
 * imported ledger suggestions from Exact/Yuki before accepting them.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, ChevronRight, HelpCircle, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyGrootboekCountryOverrides,
  DEFAULT_LEDGER_ACCOUNTS,
  type LedgerAccount,
} from '@/constants/grootboek'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import { scrollElementIntoManualLayout } from '@/features/manual/utils/manualLayoutScroll'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import {
  formatCurrencyTaxLatency,
  getNetTaxLatencyImpact,
  type TaxLatencyItem,
  type TaxLatencyType,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'
import { useFetchedLedgerAccounts } from './hooks/useFetchedLedgerAccounts'
import { TaxLatencyCandidateCard } from './TaxLatencyCandidateCard'
import { TaxLatencyConflictBanner } from './TaxLatencyConflictBanner'
import { TaxLatencyEditorForm } from './TaxLatencyEditorForm'
import { TaxLatencyItemsList } from './TaxLatencyItemsList'
import {
  buildTaxLatencyDraftMetrics,
  buildTaxLatencyDraftPayload,
  findNavTaxLatencyConflicts,
  fuzzyMatch,
  type GroupedTaxLatencyCandidate,
  generateTaxLatencyId,
  getLedgerDisplayLabel,
  groupTaxLatencyCandidates,
  resolveTaxLatencyDefaultRate,
} from './TaxLatencySection.utils'

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

interface TaxLatencySectionProps {
  defaultTaxRate?: number
  /** When true, section is always expanded (e.g. when shown as main tab content) */
  alwaysExpanded?: boolean
}

export function TaxLatencySection({
  defaultTaxRate = 25,
  alwaysExpanded = false,
}: TaxLatencySectionProps) {
  const t = useTranslations('taxLatency')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const countryCode = useManualFormStore((s) => s.formData.country_code)
  // Pull the user-chosen NAV-schedule tax rate so newly added latency rows default to
  // the same percentage as the asset-based NAV bridge (e.g. 0% for participation
  // exemption, custom rate for non-BE jurisdictions). Without this, new rows always
  // defaulted to 25% even when the user explicitly set NAV % to something else.
  const navTaxLatencyPct = useManualFormStore(
    (s) => (s.formData as { nav_tax_latency_pct?: number }).nav_tax_latency_pct
  )
  const { rate: effectiveDefaultRate, source: defaultRateSource } = resolveTaxLatencyDefaultRate(
    navTaxLatencyPct,
    defaultTaxRate
  )

  // Pull NAV-schedule uplift fields so we can warn when a positive uplift will be
  // taxed via the NAV-% deduction at the same time as the user adds an itemised
  // BSA tax_latency row for the same asset class (real estate is the typical case).
  const navAssets = useManualFormStore(
    (s) =>
      s.formData as {
        nav_real_estate_adjustment?: number
        nav_inventory_adjustment?: number
        nav_hidden_reserves?: number
        nav_other_revaluations?: number
      }
  )
  const {
    nav_real_estate_adjustment: navRealEstateAdjustment,
    nav_inventory_adjustment: navInventoryAdjustment,
    nav_hidden_reserves: navHiddenReserves,
    nav_other_revaluations: navOtherRevaluations,
  } = navAssets

  const items = useTaxLatencyStore((s) => s.items)
  const candidates = useTaxLatencyStore((s) => s.candidates)
  const addItem = useTaxLatencyStore((s) => s.addItem)
  const removeItem = useTaxLatencyStore((s) => s.removeItem)
  const updateItem = useTaxLatencyStore((s) => s.updateItem)
  const dismissCandidate = useTaxLatencyStore((s) => s.dismissCandidate)

  const netImpact = getNetTaxLatencyImpact(items)
  const hasItems = items.length > 0
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded || hasItems)
  const groupedCandidates = useMemo(() => groupTaxLatencyCandidates(candidates), [candidates])
  // Editor is collapsed by default in alwaysExpanded mode unless the user has nothing else to interact with.
  const [isEditorOpen, setIsEditorOpen] = useState(
    () => alwaysExpanded && !hasItems && candidates.length === 0
  )

  const conflictingLatencyItems = useMemo(() => {
    return findNavTaxLatencyConflicts({
      countryCode,
      items,
      navTaxLatencyPct,
      navAssets: {
        nav_real_estate_adjustment: navRealEstateAdjustment,
        nav_inventory_adjustment: navInventoryAdjustment,
        nav_hidden_reserves: navHiddenReserves,
        nav_other_revaluations: navOtherRevaluations,
      },
    })
  }, [
    countryCode,
    items,
    navTaxLatencyPct,
    navRealEstateAdjustment,
    navInventoryAdjustment,
    navHiddenReserves,
    navOtherRevaluations,
  ])

  const [draftType, setDraftType] = useState<TaxLatencyType>('passive')
  const [draftAccountCode, setDraftAccountCode] = useState('')
  const [draftAccountName, setDraftAccountName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftAmount, setDraftAmount] = useState('')
  const [draftRate, setDraftRate] = useState(String(effectiveDefaultRate))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftCandidateIds, setDraftCandidateIds] = useState<string[]>([])
  const [ledgerQuery, setLedgerQuery] = useState('')
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false)
  const fetchedLedgers = useFetchedLedgerAccounts('[TaxLatencySection]')
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  // One-shot intent flag so the candidate-driven editor-open flow focuses the
  // input AFTER React commits the editor (otherwise the focus runs while the
  // ref is still null — observable both in JSDOM tests and as a missed focus
  // when StrictMode delays the commit). The manual toggle button on the
  // section header opens the editor without setting this flag, so it stays
  // ergonomic for that case.
  const focusAmountInputOnNextOpenRef = useRef(false)

  const availableLedgers = useMemo(() => {
    const base = fetchedLedgers.length > 0 ? fetchedLedgers : DEFAULT_LEDGER_ACCOUNTS
    return applyGrootboekCountryOverrides(base, countryCode)
  }, [countryCode, fetchedLedgers])

  const selectedLedger = useMemo(
    () => availableLedgers.find((ledger) => ledger.code === draftAccountCode) ?? null,
    [availableLedgers, draftAccountCode]
  )

  const filteredLedgers = useMemo(() => {
    const query = ledgerQuery.trim()
    if (!query) return availableLedgers.slice(0, 12)

    return availableLedgers
      .map((ledger) => {
        const codeMatch = fuzzyMatch(String(ledger.code ?? ''), query)
        const nameMatch = fuzzyMatch(String(ledger.name ?? ''), query)
        const categoryMatch = fuzzyMatch(String(ledger.category ?? ''), query)
        const bestScore = Math.max(codeMatch.score, nameMatch.score, categoryMatch.score)
        return {
          ledger,
          matches: codeMatch.matches || nameMatch.matches || categoryMatch.matches,
          score: bestScore,
        }
      })
      .filter((entry) => entry.matches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.ledger)
  }, [availableLedgers, ledgerQuery])

  const {
    canSubmitAmount,
    parsedAmount,
    parsedRate,
    preview: draftPreview,
  } = buildTaxLatencyDraftMetrics({
    amountInput: draftAmount,
    rateInput: draftRate,
    type: draftType,
  })

  const canSubmit = draftAccountCode.length > 0 && canSubmitAmount

  const resetDraft = useCallback(() => {
    setDraftType('passive')
    setDraftAccountCode('')
    setDraftAccountName('')
    setDraftDescription('')
    setDraftAmount('')
    setDraftRate(String(effectiveDefaultRate))
    setEditingId(null)
    setDraftCandidateIds([])
    setLedgerQuery('')
    setShowLedgerDropdown(false)
    setIsEditorOpen(false)
  }, [effectiveDefaultRate])

  const handleSubmit = useCallback(() => {
    const existingAccountName = editingId
      ? items.find((item) => item.id === editingId)?.accountName
      : undefined
    const payload = buildTaxLatencyDraftPayload({
      accountCode: draftAccountCode,
      accountName: draftAccountName,
      amountInput: draftAmount,
      description: draftDescription,
      existingAccountName,
      rateInput: draftRate,
      selectedLedgerName: selectedLedger?.name,
      type: draftType,
    })

    if (!payload) return

    if (editingId) {
      updateItem(editingId, payload)
    } else {
      addItem({
        id: generateTaxLatencyId(),
        ...payload,
      })
    }
    if (draftCandidateIds.length > 0) {
      for (const candidateId of draftCandidateIds) {
        dismissCandidate(candidateId)
      }
    }
    resetDraft()
  }, [
    addItem,
    draftAccountCode,
    draftAccountName,
    draftAmount,
    draftCandidateIds,
    draftDescription,
    draftRate,
    draftType,
    dismissCandidate,
    editingId,
    items,
    resetDraft,
    selectedLedger?.name,
    updateItem,
  ])

  const handleEdit = useCallback((item: TaxLatencyItem) => {
    setDraftType(item.type)
    setDraftAccountCode(item.accountCode || '')
    setDraftAccountName(item.accountName || '')
    setLedgerQuery(getLedgerDisplayLabel(item.accountCode, item.accountName))
    setShowLedgerDropdown(false)
    setDraftDescription(item.description)
    setDraftAmount(String(item.temporaryDifference))
    setDraftRate(String(item.taxRate))
    setEditingId(item.id)
    setDraftCandidateIds([])
    setIsExpanded(true)
    setIsEditorOpen(true)
  }, [])

  const handleCancelEdit = useCallback(() => {
    resetDraft()
  }, [resetDraft])

  const handleRemove = useCallback(
    (id: string) => {
      if (editingId === id) resetDraft()
      removeItem(id)
    },
    [editingId, resetDraft, removeItem]
  )

  const handleUseCandidate = useCallback(
    (group: GroupedTaxLatencyCandidate) => {
      const candidate = group.candidate
      setDraftType(candidate.type)
      setDraftAccountCode(candidate.accountCode)
      setDraftAccountName(candidate.accountName)
      setLedgerQuery(getLedgerDisplayLabel(candidate.accountCode, candidate.accountName))
      setShowLedgerDropdown(false)
      setDraftDescription(candidate.description)
      setDraftAmount(
        candidate.temporaryDifference != null && candidate.temporaryDifference > 0
          ? String(candidate.temporaryDifference)
          : ''
      )
      setDraftRate(String(candidate.taxRate))
      setEditingId(null)
      setDraftCandidateIds(group.candidateIds)
      setIsExpanded(true)

      if (
        candidate.autoApply &&
        candidate.temporaryDifference &&
        candidate.temporaryDifference > 0
      ) {
        addItem({
          id: generateTaxLatencyId(),
          type: candidate.type,
          accountCode: candidate.accountCode,
          accountName: candidate.accountName,
          description: candidate.description,
          temporaryDifference: Math.abs(candidate.temporaryDifference),
          taxRate: candidate.taxRate,
        })
        for (const candidateId of group.candidateIds) {
          dismissCandidate(candidateId)
        }
        resetDraft()
        return
      }

      focusAmountInputOnNextOpenRef.current = true
      setIsEditorOpen(true)
    },
    [addItem, dismissCandidate, resetDraft]
  )

  // Focus + scroll the amount input after the editor commit. Keyed on
  // isEditorOpen so the ref is guaranteed to be attached; gated by the
  // one-shot intent ref so manual toggles of the editor don't steal focus.
  useEffect(() => {
    if (!isEditorOpen || !focusAmountInputOnNextOpenRef.current) return
    focusAmountInputOnNextOpenRef.current = false
    const input = amountInputRef.current
    if (!input) return
    scrollElementIntoManualLayout(input, { behavior: 'smooth', block: 'center' })
    input.focus({ preventScroll: true })
  }, [isEditorOpen])

  const handleDismissCandidateGroup = useCallback(
    (candidateIds: string[]) => {
      for (const candidateId of candidateIds) {
        dismissCandidate(candidateId)
      }
    },
    [dismissCandidate]
  )

  const handleSelectLedger = useCallback((ledger: LedgerAccount) => {
    setDraftAccountCode(ledger.code)
    setDraftAccountName(ledger.name)
    setLedgerQuery(getLedgerDisplayLabel(ledger.code, ledger.name))
    setShowLedgerDropdown(false)
  }, [])

  useEffect(() => {
    if (alwaysExpanded || hasItems || candidates.length > 0) {
      setIsExpanded(true)
    }
  }, [alwaysExpanded, candidates.length, hasItems])

  const inputForm = (
    <TaxLatencyEditorForm
      amountInputRef={amountInputRef}
      canSubmit={canSubmit}
      currencyLocale={currencyLocale}
      defaultRateSource={defaultRateSource}
      draftAmount={draftAmount}
      draftDescription={draftDescription}
      draftPreview={draftPreview}
      draftRate={draftRate}
      draftType={draftType}
      editingId={editingId}
      effectiveDefaultRate={effectiveDefaultRate}
      filteredLedgers={filteredLedgers}
      ledgerQuery={ledgerQuery}
      parsedAmount={parsedAmount}
      parsedRate={parsedRate}
      selectedLedger={selectedLedger}
      showLedgerDropdown={showLedgerDropdown}
      t={t}
      onCancelEdit={handleCancelEdit}
      onSelectLedger={handleSelectLedger}
      onSubmit={handleSubmit}
      setDraftAccountCode={setDraftAccountCode}
      setDraftAccountName={setDraftAccountName}
      setDraftAmount={setDraftAmount}
      setDraftDescription={setDraftDescription}
      setDraftRate={setDraftRate}
      setDraftType={setDraftType}
      setLedgerQuery={setLedgerQuery}
      setShowLedgerDropdown={setShowLedgerDropdown}
    />
  )

  const itemsList = (
    <TaxLatencyItemsList
      currencyLocale={currencyLocale}
      items={items}
      netImpact={netImpact}
      onEdit={handleEdit}
      onRemove={handleRemove}
      t={t}
    />
  )

  const candidateCards =
    groupedCandidates.length > 0 ? (
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>{t('suggestedCandidatesTitle')}</span>
        </div>
        {groupedCandidates.map((group) => (
          <TaxLatencyCandidateCard
            key={group.id}
            group={group}
            currencyLocale={currencyLocale}
            onUse={handleUseCandidate}
            onDismiss={handleDismissCandidateGroup}
            t={t}
          />
        ))}
      </div>
    ) : null

  const conflictBanner = (
    <TaxLatencyConflictBanner
      conflictingLatencyItems={conflictingLatencyItems}
      navTaxLatencyPct={navTaxLatencyPct}
      t={t}
    />
  )

  if (alwaysExpanded) {
    const editorToggle = (
      <button
        type="button"
        onClick={() => setIsEditorOpen((open) => !open)}
        aria-expanded={isEditorOpen}
        aria-controls="tax-latency-editor-panel"
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
          isEditorOpen
            ? 'border-primary/30 bg-primary/[0.04]'
            : 'border-foreground/[0.08] bg-foreground/[0.02] hover:bg-foreground/[0.04]'
        )}
      >
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {editingId ? t('editorToggleEditingTitle') : t('editorToggleTitle')}
          </span>
          <span className="mt-0.5 block text-xs text-foreground/50">
            {t('editorToggleSubtitle')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isEditorOpen && !editingId && (
            <span className="inline-flex items-center gap-1 rounded-md border border-foreground/[0.08] bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/70">
              <Plus className="w-3 h-3" />
              {t('addCta')}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-foreground/40 transition-transform',
              isEditorOpen && 'rotate-180'
            )}
          />
        </div>
      </button>
    )

    return (
      <div className="pt-2 space-y-3">
        {conflictBanner}
        {candidateCards}
        {itemsList}
        {editorToggle}
        <AnimatePresence initial={false}>
          {isEditorOpen && (
            <motion.div
              id="tax-latency-editor-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              {inputForm}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div>
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

          {(hasItems || groupedCandidates.length > 0) && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums bg-foreground/[0.06] text-foreground/50">
              {items.length + groupedCandidates.length}
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
              netImpact > 0
                ? 'text-moss-600 dark:text-moss-400'
                : netImpact < 0
                  ? 'text-rust-600 dark:text-rust-400'
                  : 'text-foreground/50'
            )}
          >
            {netImpact > 0 ? '+' : ''}
            {formatCurrencyTaxLatency(netImpact, currencyLocale)}
          </span>
        )}
      </button>

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
              {conflictBanner}
              {candidateCards}
              {inputForm}
              {itemsList}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
