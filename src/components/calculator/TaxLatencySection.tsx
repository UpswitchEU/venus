'use client'

/**
 * Tax Latency Section
 *
 * Ledger-linked deferred tax rows for the EV-to-equity bridge.
 * Accountants can tie each latency to a balance-sheet account and review
 * imported ledger suggestions from Exact/Yuki before accepting them.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  HelpCircle,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyGrootboekCountryOverrides,
  DEFAULT_LEDGER_ACCOUNTS,
  type LedgerAccount,
} from '@/constants/grootboek'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { Badge } from '@/design-system/components/Badge'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import {
  calculateLatencyAmount,
  formatCurrencyTaxLatency,
  getNetTaxLatencyImpact,
  type TaxLatencyCandidate,
  type TaxLatencyItem,
  type TaxLatencyType,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function generateId(): string {
  return `tl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

function sanitizeNumericInput(value: string): string {
  return value.replace(/[^\d.,]/g, '')
}

function parseNumericInput(value: string): number {
  const raw = sanitizeNumericInput(value)
  if (raw === '') return 0
  const parsed = Number(raw.replace(',', '.'))
  return Number.isNaN(parsed) ? 0 : parsed
}

function getLedgerDisplayLabel(code?: string, name?: string): string {
  if (code && name) return `${code} · ${name}`
  return code || name || '—'
}

export interface GroupedTaxLatencyCandidate {
  id: string
  candidate: TaxLatencyCandidate
  candidateIds: string[]
  years: number[]
}

function normalizeGroupingValue(value?: string | number | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function groupTaxLatencyCandidates(
  candidates: TaxLatencyCandidate[]
): GroupedTaxLatencyCandidate[] {
  const groups = new Map<string, GroupedTaxLatencyCandidate>()

  for (const candidate of candidates) {
    const key = [
      normalizeGroupingValue(candidate.accountCode),
      normalizeGroupingValue(candidate.accountName),
      normalizeGroupingValue(candidate.type),
      normalizeGroupingValue(candidate.taxRate),
      normalizeGroupingValue(candidate.description),
    ].join('|')

    const existing = groups.get(key)
    if (existing) {
      existing.candidateIds.push(candidate.id)
      if (candidate.year != null && !existing.years.includes(candidate.year)) {
        existing.years.push(candidate.year)
        existing.years.sort((a, b) => a - b)
      }
      if (existing.candidate.temporaryDifference == null && candidate.temporaryDifference != null) {
        existing.candidate = candidate
      }
      continue
    }

    groups.set(key, {
      id: key,
      candidate,
      candidateIds: [candidate.id],
      years: candidate.year != null ? [candidate.year] : [],
    })
  }

  return Array.from(groups.values())
}

const fuzzyMatch = (text: string, query: string): { matches: boolean; score: number } => {
  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()

  if (!normalizedQuery) return { matches: true, score: 0 }
  if (normalizedText.includes(normalizedQuery)) {
    return { matches: true, score: normalizedQuery.length * 10 }
  }

  let textIndex = 0
  let queryIndex = 0
  let score = 0

  while (textIndex < normalizedText.length && queryIndex < normalizedQuery.length) {
    if (normalizedText[textIndex] === normalizedQuery[queryIndex]) {
      queryIndex += 1
      score += 1
    }
    textIndex += 1
  }

  return {
    matches: queryIndex === normalizedQuery.length,
    score,
  }
}

// ─────────────────────────────────────────
// READ-ONLY ITEM ROW
// ─────────────────────────────────────────

interface TaxLatencyRowProps {
  item: TaxLatencyItem
  currencyLocale: string
  onEdit: (item: TaxLatencyItem) => void
  onRemove: (id: string) => void
  t: ReturnType<typeof useTranslations<'taxLatency'>>
}

const TaxLatencyRow = forwardRef<HTMLDivElement, TaxLatencyRowProps>(function TaxLatencyRow(
  { item, currencyLocale, onEdit, onRemove, t },
  ref
) {
  const amount = calculateLatencyAmount(item)

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="group grid gap-3 px-3 py-3 rounded-lg border border-foreground/[0.08] bg-background/60 hover:border-foreground/[0.12] transition-colors sm:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_110px_70px_110px_72px]"
    >
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[120px] px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide',
          item.type === 'active'
            ? 'bg-moss-100 text-moss-700 dark:bg-moss-900/30 dark:text-moss-400'
            : 'bg-rust-100 text-rust-700 dark:bg-rust-900/30 dark:text-rust-400'
        )}
      >
        {item.type === 'active' ? t('typeActive') : t('typePassive')}
      </span>

      <span
        className={cn('min-w-0 text-sm text-foreground/80', LEDGER_LABEL_TEXT_CLASSES)}
        title={getLedgerDisplayLabel(item.accountCode, item.accountName)}
      >
        {getLedgerDisplayLabel(item.accountCode, item.accountName)}
      </span>

      <span
        className={cn('min-w-0 text-sm text-foreground/80', LEDGER_LABEL_TEXT_CLASSES)}
        title={
          typeof item.description === 'string' && item.description ? item.description : undefined
        }
      >
        {item.description || <span className="text-foreground/30 italic">—</span>}
      </span>

      <span className="text-xs font-mono tabular-nums text-foreground/60">
        {formatCurrencyTaxLatency(item.temporaryDifference, currencyLocale)}
      </span>

      <span className="text-xs font-mono tabular-nums text-foreground/50 w-12 text-right">
        {item.taxRate}%
      </span>

      <span
        className={cn(
          'text-xs font-bold tabular-nums whitespace-nowrap min-w-[80px] text-right',
          amount > 0
            ? 'text-moss-600 dark:text-moss-400'
            : amount < 0
              ? 'text-rust-600 dark:text-rust-400'
              : 'text-foreground/50'
        )}
      >
        {amount > 0 ? '+' : ''}
        {formatCurrencyTaxLatency(amount, currencyLocale)}
      </span>

      <div className="flex items-center gap-1 sm:justify-end lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="p-1.5 rounded-md text-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label={t('editItem')}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('editItem')}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="p-1.5 rounded-md text-foreground/30 hover:text-rust-600 hover:bg-rust-50 dark:hover:bg-rust-900/20 transition-colors"
                aria-label={t('removeItem')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('removeItem')}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      </div>
    </motion.div>
  )
})

interface TaxLatencyCandidateCardProps {
  group: GroupedTaxLatencyCandidate
  currencyLocale: string
  onUse: (group: GroupedTaxLatencyCandidate) => void
  onDismiss: (ids: string[]) => void
  t: ReturnType<typeof useTranslations<'taxLatency'>>
}

function TaxLatencyCandidateCard({
  group,
  currencyLocale,
  onUse,
  onDismiss,
  t,
}: TaxLatencyCandidateCardProps) {
  const candidate = group.candidate
  const firstYear = group.years[0]
  const lastYear = group.years[group.years.length - 1]
  const isConsecutive =
    group.years.length > 1 &&
    group.years.every((year, idx) => idx === 0 || year === group.years[idx - 1] + 1)
  const yearLabel =
    group.years.length === 1
      ? t('candidateYear', { year: firstYear })
      : group.years.length > 1
        ? isConsecutive
          ? t('candidateYearsRange', {
              start: firstYear,
              end: lastYear,
              count: group.years.length,
            })
          : t('candidateYearsList', {
              years: group.years.join(', '),
              count: group.years.length,
            })
        : null

  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 dark:bg-amber-950/10 dark:border-amber-800/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-foreground">{candidate.suggestedQuestion}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <Badge variant="neutral" size="sm">
              {candidate.accountCode}
            </Badge>
            <span>{candidate.accountName}</span>
            {yearLabel ? <span>{yearLabel}</span> : null}
          </div>
          <p className="text-xs text-foreground/55">{candidate.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/55">
            <span>{t('candidateRate', { rate: candidate.taxRate })}</span>
            {candidate.temporaryDifference ? (
              <span>
                {t('candidateSurplus', {
                  amount: formatCurrencyTaxLatency(candidate.temporaryDifference, currencyLocale),
                })}
              </span>
            ) : null}
          </div>
          {candidate.rationale ? (
            <p className="text-xs text-foreground/45">{candidate.rationale}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(group.candidateIds)}
          className="p-1 rounded-md text-foreground/30 hover:text-foreground/60 hover:bg-background/70 transition-colors"
          aria-label={t('dismissSuggestion')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-end mt-3">
        <button
          type="button"
          onClick={() => onUse(group)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {candidate.autoApply && candidate.temporaryDifference
            ? t('applyCandidate')
            : t('reviewCandidate')}
        </button>
      </div>
    </div>
  )
}

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
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const countryCode = useManualFormStore((s) => s.formData.country_code)
  // Pull the user-chosen NAV-schedule tax rate so newly added latency rows default to
  // the same percentage as the asset-based NAV bridge (e.g. 0% for participation
  // exemption, custom rate for non-BE jurisdictions). Without this, new rows always
  // defaulted to 25% even when the user explicitly set NAV % to something else.
  const navTaxLatencyPct = useManualFormStore(
    (s) => (s.formData as { nav_tax_latency_pct?: number }).nav_tax_latency_pct
  )
  const effectiveDefaultRate =
    typeof navTaxLatencyPct === 'number' && Number.isFinite(navTaxLatencyPct)
      ? Math.min(100, Math.max(0, navTaxLatencyPct))
      : defaultTaxRate
  const defaultRateSource: 'navSchedule' | 'fallback' =
    typeof navTaxLatencyPct === 'number' && Number.isFinite(navTaxLatencyPct)
      ? 'navSchedule'
      : 'fallback'

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

  // Conflict detection: NAV-% deduction (asset-based bridge) AND a BSA tax_latency
  // row (equity bridge) on overlapping asset classes will both deduct latent tax
  // from equity → double-count. Detect the most common case (real estate, MAR 22x)
  // and surface a non-blocking warning so the accountant can choose one channel.
  //
  // Scope: BE-only for now. Dutch RGS uses different prefixes (e.g. 0xx for fixed
  // assets, 3xx for inventory may overlap with BE 30 but means a different thing
  // in some sub-codes). Firing the BE rules on NL data would yield false positives
  // (e.g. a Dutch '30xxx' inventory account is not flagged with the same logic).
  // When NL/EU coverage lands, broaden this guard with country-specific matchers.
  const conflictingLatencyItems = useMemo(() => {
    // Require an EXPLICIT 'BE' before firing MAR-based heuristics. During
    // initial form hydration `countryCode` can be undefined; falling through
    // would render a BE-flavoured warning on a blank form. Once the form
    // wizard sets the country we re-evaluate.
    if (countryCode !== 'BE') return []

    const navPctActive =
      typeof navTaxLatencyPct === 'number' &&
      Number.isFinite(navTaxLatencyPct) &&
      navTaxLatencyPct > 0
    if (!navPctActive) return []

    const grossPositiveNav =
      Math.max(0, Number(navAssets.nav_real_estate_adjustment) || 0) +
      Math.max(0, Number(navAssets.nav_inventory_adjustment) || 0) +
      Math.max(0, Number(navAssets.nav_hidden_reserves) || 0) +
      Math.max(0, Number(navAssets.nav_other_revaluations) || 0)
    if (grossPositiveNav <= 0) return []

    return items.filter((item) => {
      if (item.type !== 'passive') return false
      const code = (item.accountCode || '').trim()
      // Belgian MAR 22x = property/buildings; if the user also entered a positive
      // real-estate revaluation in the NAV schedule, both channels apply latent tax.
      const realEstateOverlap =
        code.startsWith('22') && Number(navAssets.nav_real_estate_adjustment) > 0
      // MAR 3x = inventory revaluations.
      const inventoryOverlap =
        code.startsWith('3') && Number(navAssets.nav_inventory_adjustment) > 0
      return realEstateOverlap || inventoryOverlap
    })
  }, [
    countryCode,
    items,
    navTaxLatencyPct,
    navAssets.nav_real_estate_adjustment,
    navAssets.nav_inventory_adjustment,
    navAssets.nav_hidden_reserves,
    navAssets.nav_other_revaluations,
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
  const [fetchedLedgers, setFetchedLedgers] = useState<LedgerAccount[]>([])
  const amountInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    let cancelled = false

    fetch('/api/reference/grootboek', { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const codes = data.codes ?? data.data?.codes
        if (!Array.isArray(codes)) return
        setFetchedLedgers(
          codes.map((code: { code: string; name: string; category?: string }) => ({
            code: String(code.code ?? ''),
            name: String(code.name ?? ''),
            category: code.category ?? '',
          }))
        )
      })
      .catch((error) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
      })

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [])

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

  const parsedAmount = parseNumericInput(draftAmount)

  const parsedRate = Math.min(100, Math.max(0, parseNumericInput(draftRate)))

  const draftPreview =
    draftType === 'active'
      ? Math.abs(parsedAmount) * (parsedRate / 100)
      : -(Math.abs(parsedAmount) * (parsedRate / 100))

  const canSubmit = draftAccountCode.length > 0 && parsedAmount > 0

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
    if (!canSubmit) return

    if (editingId) {
      updateItem(editingId, {
        type: draftType,
        accountCode: draftAccountCode,
        accountName:
          selectedLedger?.name ||
          draftAccountName ||
          items.find((item) => item.id === editingId)?.accountName ||
          '',
        description: draftDescription,
        temporaryDifference: Math.abs(parsedAmount),
        taxRate: parsedRate,
      })
    } else {
      addItem({
        id: generateId(),
        type: draftType,
        accountCode: draftAccountCode,
        accountName: selectedLedger?.name || draftAccountName || '',
        description: draftDescription,
        temporaryDifference: Math.abs(parsedAmount),
        taxRate: parsedRate,
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
    canSubmit,
    draftAccountCode,
    draftAccountName,
    draftCandidateIds,
    draftDescription,
    draftType,
    dismissCandidate,
    editingId,
    items,
    parsedAmount,
    parsedRate,
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
          id: generateId(),
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

      setIsEditorOpen(true)

      const focusAmountInput = () => {
        const input = amountInputRef.current
        if (!input) return
        if (typeof input.scrollIntoView === 'function') {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        input.focus()
      }
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(focusAmountInput)
      } else {
        window.setTimeout(focusAmountInput, 0)
      }
    },
    [addItem, dismissCandidate, resetDraft]
  )

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
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        editingId
          ? 'border-primary/30 bg-primary/[0.02]'
          : 'border-foreground/[0.08] bg-foreground/[0.02]'
      )}
    >
      {/* Form heading when editing */}
      {editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" />
            {t('editItem')}
          </span>
          <button
            type="button"
            onClick={handleCancelEdit}
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
                        onClick={() => handleSelectLedger(ledger)}
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
              if (e.key === 'Enter') handleSubmit()
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
                if (e.key === 'Enter') handleSubmit()
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

        {/* Tax Rate */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <label className="block text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
              {t('taxRate')}
            </label>
            {/* Surface where the default came from so accountants understand why a new
                row defaults to e.g. 0% (participation exemption) vs the BE 25% fallback. */}
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
                if (e.key === 'Enter') handleSubmit()
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
            onClick={handleSubmit}
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

  const itemsList = (
    <div className="space-y-1.5 mt-4">
      {hasItems && (
        <div className="hidden sm:grid sm:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_110px_70px_110px_72px] items-center gap-3 px-3 h-8 text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
          <span className="min-w-[120px] flex-shrink-0">{t('type')}</span>
          <span className="min-w-0">{t('account')}</span>
          <span className="flex-1 min-w-0">{t('description')}</span>
          <span className="flex-shrink-0">{t('grossSurplusValue')}</span>
          <span className="w-12 text-right flex-shrink-0">{t('taxRate')}</span>
          <span className="min-w-[80px] text-right flex-shrink-0">{t('latencyAmount')}</span>
          <span className="w-[72px] flex-shrink-0" />
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <TaxLatencyRow
            key={item.id}
            item={item}
            currencyLocale={currencyLocale}
            onEdit={handleEdit}
            onRemove={handleRemove}
            t={t}
          />
        ))}
      </AnimatePresence>

      {!hasItems && (
        <div className="py-12 text-center">
          <p className="text-sm text-foreground/50 mb-1">{t('noItems')}</p>
          <p className="text-xs text-foreground/35">{t('noItemsDesc')}</p>
        </div>
      )}

      {hasItems && (
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-foreground/[0.06]">
          <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">
            {t('netImpact')}
          </span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
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
        </div>
      )}
    </div>
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

  // Non-blocking warning shown when an itemised passive latency overlaps with a
  // positive NAV-schedule revaluation that is already being taxed via
  // `nav_tax_latency_pct`. Both channels would otherwise reduce equity for the
  // same latent gain (double-count in the EV→Equity bridge).
  const conflictBanner =
    conflictingLatencyItems.length > 0 ? (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/15 dark:border-amber-700/40 p-3 mb-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1 min-w-0">
            <p className="font-semibold">{t('navConflictTitle')}</p>
            <p className="text-amber-900/80 dark:text-amber-200/80">
              {t('navConflictBodyPrefix', { rate: navTaxLatencyPct ?? 0 })}
              <span className="font-medium">
                {conflictingLatencyItems
                  .map((item) => item.accountCode || item.description)
                  .filter(Boolean)
                  .join(', ')}
              </span>
              {t('navConflictBodySuffix')}
            </p>
          </div>
        </div>
      </div>
    ) : null

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
