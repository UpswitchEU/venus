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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, ModalContent } from '@/design-system/components/Modal'
import { trackNormalizationAdd, trackNormalizationEdit } from '@/lib/analytics'
import type { LedgerAccount } from '../../constants/grootboek'
import { getNetTaxLatencyImpact, useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { scrollElementIntoContainer } from '@/utils/scrollContainer'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { generalLogger } from '../../utils/logger'
import {
  findAcceptedAutoNormalizationCapBreaches,
  getNormalizationAmountForBase,
  getReportedEbitdaBaseline,
  summarizeAcceptedNormalizations,
  summarizeNormalizationsForAnchorYear,
} from '../../utils/normalizationMath'
import { TaxLatencySection } from './TaxLatencySection'
import { UnifiedNormalizationBulkActionsBar } from './UnifiedNormalizationBulkActionsBar'
import type { CrossYearPendingNormalizationGroup } from './UnifiedNormalizationCrossYearSuggestions'
import { UnifiedNormalizationEditorToggle } from './UnifiedNormalizationEditorToggle'
import type { NormalizationViewMode } from './UnifiedNormalizationEditorToolbar'
import {
  generateId,
  inferCategoryFromCode,
  parseCustomLedgerFromQuery,
} from './UnifiedNormalizationHelpers'
import { UnifiedNormalizationModalFooter } from './UnifiedNormalizationModalFooter'
import {
  type NormalizationPrimaryTab,
  UnifiedNormalizationModalHeader,
} from './UnifiedNormalizationModalHeader'
import { UnifiedNormalizationPromptEditor } from './UnifiedNormalizationPromptEditor'
import type {
  NormalizationItem,
  NormalizationPresetOption,
  NormalizationSource,
  NormalizationStatus,
  NormalizationType,
  SearchableLedgerAccount,
  UnifiedNormalizationModalProps,
} from './UnifiedNormalizationTypes'
import { UnifiedNormalizationViewContent } from './UnifiedNormalizationViewContent'
import {
  type AutoNormalizationCapBreach,
  AutoNormalizationCapWarning,
  TaxLatencyReviewWarning,
} from './UnifiedNormalizationWarnings'
import { useUnifiedNormalizationLedgerOptions } from './useUnifiedNormalizationLedgerOptions'

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

interface FallbackFormData {
  yearlyFinancials?: Array<{ ebitda?: unknown }>
  current_year_data?: { ebitda?: unknown }
  ebitda?: unknown
}

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
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
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

  // Year filter: null = all years
  const [yearFilter, setYearFilter] = useState<number | null>(null)

  // Note: We use searchQuery for both adding new normalizations AND filtering existing ones

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isEditorExpanded, setIsEditorExpanded] = useState(
    () => initialSearchQuery.trim().length > 0
  )

  // Full state reset when modal opens/closes to prevent stale UI between sessions
  useEffect(() => {
    if (open) {
      setPrimaryTab('ebitda')
      setSelectedIds(new Set())
      setShowLedgerDropdown(false)
      setSearchQuery(initialSearchQuery)
      setYearFilter(initialYearFilter)
      setIsEditorExpanded(initialSearchQuery.trim().length > 0)
    } else {
      setShowAddForm(false)
      setSearchQuery(initialSearchQuery)
      setSelectedLedger(null)
      setShowLedgerDropdown(false)
      setDropdownAnchorRect(null)
      setEditingId(null)
      setYearFilter(null)
      setCollapsedYears(new Set())
      setNewSelectedYears([currentYear])
      setNewValue('')
      setNewType('add')
      setNewReason('')
      setIsEditorExpanded(false)
    }
  }, [open, currentYear, initialSearchQuery, initialYearFilter])

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null)
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false)
  /** 'search' = dropdown anchored to search input; 'ledger' = anchored to ledger pill (Wijzig) */
  const [dropdownSource, setDropdownSource] = useState<'search' | 'ledger'>('search')

  // New normalization form state
  const [newType, setNewType] = useState<NormalizationType>('add')
  const [newValue, setNewValue] = useState('')
  const [newSelectedYears, setNewSelectedYears] = useState<number[]>([currentYear])
  const [newReason, setNewReason] = useState('')

  // Ref for add form to scroll into view
  const addFormRef = useRef<HTMLDivElement>(null)

  // Ref for input container to position dropdown via portal
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const ledgerButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownAnchorRect, setDropdownAnchorRect] = useState<DOMRect | null>(null)

  // Update dropdown anchor rect when dropdown should show
  useEffect(() => {
    if (!showLedgerDropdown) {
      setDropdownAnchorRect(null)
      return
    }
    if (dropdownSource === 'ledger' && ledgerButtonRef.current) {
      setDropdownAnchorRect(ledgerButtonRef.current.getBoundingClientRect())
    } else if (inputContainerRef.current) {
      setDropdownAnchorRect(inputContainerRef.current.getBoundingClientRect())
    }
  }, [showLedgerDropdown, dropdownSource])

  // Escape key closes dropdown without clearing selection
  useEffect(() => {
    if (!showLedgerDropdown) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowLedgerDropdown(false)
        setDropdownSource('search')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showLedgerDropdown])

  // Year grouping: collapsed state for each year
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set())

  // Scroll add form into view when it appears (inside modal scroll container).
  useEffect(() => {
    if (!showAddForm || !addFormRef.current) return
    const timer = setTimeout(() => {
      const form = addFormRef.current
      const container = listContainerRef.current
      if (!form || !container) return
      scrollElementIntoContainer(form, container, { behavior: 'smooth', block: 'start' })
    }, 50)
    return () => clearTimeout(timer)
  }, [showAddForm])

  // Derive available years from user-entered financial data, falling back to 4-year range
  const availableYears = useMemo(() => {
    const base = Number.isFinite(currentYear) ? currentYear : getCurrentFilingYear()
    if (financialYears && financialYears.length > 0) {
      const valid = financialYears.filter((y) => Number.isFinite(y)) as number[]
      return valid.length > 0
        ? [...valid].sort((a, b) => b - a)
        : [base, base - 1, base - 2, base - 3]
    }
    return [base, base - 1, base - 2, base - 3]
  }, [currentYear, financialYears])

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

  // Fetch grootboek codes from Titan API, fall back to hardcoded defaults
  const [fetchedLedgers, setFetchedLedgers] = useState<LedgerAccount[]>([])
  useEffect(() => {
    const ac = new AbortController()
    let cancelled = false
    fetch('/api/reference/grootboek', { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        // Support both { codes } and { data: { codes } } response formats
        const codes = data.codes ?? data.data?.codes
        if (!Array.isArray(codes)) return
        setFetchedLedgers(
          codes.map((c: { code: string; name: string; category: string }) => ({
            code: String(c.code ?? ''),
            name: String(c.name ?? ''),
            category: c.category ?? '',
          }))
        )
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
        generalLogger.debug('[UnifiedNormalizationModal] Grootboek fetch failed, using defaults', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [])

  const { availableLedgers, normalizationPresets, filteredLedgers, getLedgerDisplayName } =
    useUnifiedNormalizationLedgerOptions({
      ledgerAccounts: ledgerAccounts.length > 0 ? ledgerAccounts : fetchedLedgers,
      countryCode,
      searchQuery,
    })

  // Keep explicit 0 EBITDA values instead of falling through to unrelated fallback sources.
  const safeOriginalEBITDA = (() => {
    const fallbackFormData = fallbackFormDataRef?.current as FallbackFormData | null | undefined

    return getReportedEbitdaBaseline({
      year: currentYear,
      originalEBITDAByYear,
      fallbackCandidates: [
        originalEBITDA,
        fallbackFormData?.yearlyFinancials?.[0]?.ebitda,
        fallbackFormData?.current_year_data?.ebitda,
        fallbackFormData?.ebitda,
      ],
    })
  })()

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

  const persistedTaxLatencyCandidateCount = (() => {
    const formData = fallbackFormDataRef?.current as Record<string, unknown> | null | undefined
    if (!formData || typeof formData !== 'object') return 0
    const businessContext =
      formData.business_context && typeof formData.business_context === 'object'
        ? (formData.business_context as Record<string, unknown>)
        : null
    const fromBusinessContext =
      businessContext?._imported_ledger_analysis &&
      typeof businessContext._imported_ledger_analysis === 'object'
        ? ((businessContext._imported_ledger_analysis as Record<string, unknown>)
            .tax_latency_candidates ?? null)
        : null
    const fromTopLevel =
      formData._imported_ledger_analysis && typeof formData._imported_ledger_analysis === 'object'
        ? ((formData._imported_ledger_analysis as Record<string, unknown>).tax_latency_candidates ??
          null)
        : null
    const candidates = Array.isArray(fromBusinessContext)
      ? fromBusinessContext
      : Array.isArray(fromTopLevel)
        ? fromTopLevel
        : []
    return candidates.length
  })()

  const requiresTaxLatencyReview =
    taxLatencyCount === 0 && (taxLatencyCandidateCount > 0 || persistedTaxLatencyCandidateCount > 0)
  const isDutch = String(locale).toLowerCase().startsWith('nl')

  // Auto-detected suggestions (pending + zero adjustment) that fire identically
  // across ≥2 years are noise when expanded into per-year rows — the same "rent
  // is high" flag appearing in 2021..2025 reads as five rows of nothing. Lift
  // them into a single consolidated card and exclude them from the per-year
  // grouping below. Accepted items keep year-specific rows because their
  // adjustments differ per year (different revenue / line totals).
  const crossYearPendingGroups = useMemo(() => {
    const buckets = new Map<string, CrossYearPendingNormalizationGroup>()
    for (const n of filteredNormalizations) {
      if (n.status !== 'pending') continue
      if (Number.isFinite(n.adjustment) && Math.abs(n.adjustment) > 0) continue
      const key = `${(n.ledgerCode || '').trim().toLowerCase()}|${(n.reason || '').trim().toLowerCase()}|${n.source}`
      const existing = buckets.get(key)
      const year = Number.isFinite(n.year) ? n.year : null
      if (existing) {
        existing.ids.push(n.id)
        if (year != null && !existing.years.includes(year)) existing.years.push(year)
      } else {
        buckets.set(key, {
          sample: n,
          ids: [n.id],
          years: year != null ? [year] : [],
        })
      }
    }
    return Array.from(buckets.values())
      .filter((bucket) => bucket.years.length >= 2)
      .map((bucket) => ({
        ...bucket,
        years: bucket.years.sort((a, b) => b - a),
      }))
  }, [filteredNormalizations])

  const crossYearPendingIds = useMemo(
    () => new Set(crossYearPendingGroups.flatMap((bucket) => bucket.ids)),
    [crossYearPendingGroups]
  )

  // Group normalizations by year for collapsible sections.
  // Cross-year pending duplicates are surfaced separately above the year cards.
  const groupedByYear = useMemo(() => {
    const groups = new Map<number, NormalizationItem[]>()

    filteredNormalizations.forEach((n) => {
      if (crossYearPendingIds.has(n.id)) return
      const years = n.applyAllYears
        ? availableYears
        : n.applyYears && n.applyYears.length > 0
          ? n.applyYears
          : Number.isFinite(n.year)
            ? [n.year]
            : []

      for (const y of years) {
        if (!Number.isFinite(y)) continue
        if (!groups.has(y)) groups.set(y, [])
        groups.get(y)?.push(n)
      }
    })

    // Sort years descending
    return Array.from(groups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, items]) => ({ year, items }))
  }, [filteredNormalizations, availableYears, crossYearPendingIds])

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

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (showAddForm || editingId || initialSearchQuery.trim().length > 0) {
      setIsEditorExpanded(true)
    }
  }, [editingId, initialSearchQuery, showAddForm])

  // Virtualization ref
  const listContainerRef = useRef<HTMLDivElement>(null)

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

  // Actions
  const updateStatus = useCallback(
    (id: string, status: NormalizationStatus) => {
      onNormalizationsChange(normalizations.map((n) => (n.id === id ? { ...n, status } : n)))
    },
    [normalizations, onNormalizationsChange]
  )

  const bulkUpdateStatus = useCallback(
    (status: NormalizationStatus) => {
      onNormalizationsChange(
        normalizations.map((n) => (selectedIds.has(n.id) ? { ...n, status } : n))
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
    onNormalizationsChange(normalizations.filter((n) => !selectedIds.has(n.id)))
    setSelectedIds(new Set())
  }, [normalizations, onNormalizationsChange, selectedIds, nh])

  const startEditing = useCallback(
    (item: NormalizationItem) => {
      // Set editing ID to track which item we're editing
      setEditingId(item.id)

      // Populate the top form with the item's data
      setSelectedLedger({
        code: item.ledgerCode,
        name: getLedgerDisplayName(item.ledgerCode, item.ledgerName),
      })
      setSearchQuery(
        `${item.ledgerCode} · ${getLedgerDisplayName(item.ledgerCode, item.ledgerName)}`
      )
      setNewType(item.type)
      setNewValue(Math.abs(item.value).toString())
      setNewReason(item.reason || '')
      setNewSelectedYears(
        item.applyYears || (item.applyAllYears ? [...availableYears] : [item.year])
      )

      // Show the form
      setIsEditorExpanded(true)
      setShowAddForm(true)
      setShowLedgerDropdown(false)
    },
    [availableYears, getLedgerDisplayName]
  )

  const cancelEditing = useCallback(() => {
    setEditingId(null)
    // Also reset the form
    setShowAddForm(false)
    setSelectedLedger(null)
    setSearchQuery('')
    setNewValue('')
    setNewType('add')
    setNewReason('')
    setNewSelectedYears([currentYear])
  }, [currentYear])

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

  const addNormalization = useCallback(() => {
    if (!selectedLedger || !newValue) return
    const code = String(selectedLedger.code ?? '').trim()
    const name = String(selectedLedger.name ?? '').trim()
    if (!code) return

    const numericValue = parseFloat(newValue.replace(/[^0-9.-]/g, ''))
    if (!Number.isFinite(numericValue)) return

    const safeEbitda = Number.isFinite(safeOriginalEBITDA) ? safeOriginalEBITDA : 0

    // ── Validation: warn/block extreme adjustments ──
    const absValue = Math.abs(numericValue)
    if (safeEbitda > 0) {
      const pctOfEbitda = (absValue / safeEbitda) * 100

      // Block if adjustment exceeds 200% of EBITDA (likely a data entry error)
      if (pctOfEbitda > 200) {
        import('sonner').then(({ toast }) =>
          toast.error(nh('blockedToast'), {
            description: nh('blockedToastDesc', { pct: pctOfEbitda.toFixed(0) }),
          })
        )
        return
      }

      // Warn if adjustment exceeds 30% of EBITDA
      if (pctOfEbitda > 30) {
        import('sonner').then(({ toast }) =>
          toast.warning(nh('warnToastTitle'), {
            description: nh('warnToastDesc', { pct: pctOfEbitda.toFixed(0) }),
          })
        )
      }
    }

    // Calculate adjustment based on type
    let adjustment = numericValue
    if (newType === 'add_percent') {
      adjustment = (safeEbitda * numericValue) / 100
    } else if (newType === 'subtract_percent') {
      adjustment = -((safeEbitda * numericValue) / 100)
    } else if (newType === 'subtract') {
      adjustment = -numericValue
    } else if (newType === 'absolute') {
      adjustment = numericValue - safeEbitda
    }
    if (!Number.isFinite(adjustment)) adjustment = 0

    // If editing an existing item, update it instead of creating new
    if (editingId) {
      onNormalizationsChange(
        normalizations.map((n) =>
          n.id === editingId
            ? {
                ...n,
                ledgerCode: code,
                ledgerName: name || code,
                category: inferCategoryFromCode(code),
                type: newType,
                value: numericValue,
                adjustment,
                reason: newReason || undefined,
                applyAllYears: newSelectedYears.length === availableYears.length,
                applyYears: newSelectedYears,
              }
            : n
        )
      )
      setEditingId(null)
    } else {
      // Create new normalization
      const newItem: NormalizationItem = {
        id: generateId(),
        ledgerCode: code,
        ledgerName: name || code,
        category: inferCategoryFromCode(code),
        type: newType,
        value: numericValue,
        adjustment,
        reason: newReason || undefined,
        source: 'manual',
        status: 'accepted',
        applyAllYears: newSelectedYears.length === availableYears.length,
        applyYears: newSelectedYears,
        year: currentYear,
      }

      trackNormalizationAdd('manual')
      onNormalizationsChange([newItem, ...normalizations])
    }

    // Reset form
    setSelectedLedger(null)
    setNewValue('')
    setNewReason('')
    setSearchQuery('')
    setNewSelectedYears([currentYear])
    setShowAddForm(false)
  }, [
    selectedLedger,
    newValue,
    newType,
    newReason,
    newSelectedYears,
    availableYears.length,
    currentYear,
    normalizations,
    onNormalizationsChange,
    editingId,
    safeOriginalEBITDA,
    nh,
  ])

  // File input ref for CSV upload
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onUploadClick) {
      onUploadClick()
    }
  }

  const openSelectedLedgerPicker = useCallback(() => {
    if (!selectedLedger) return
    setSearchQuery(`${selectedLedger.code} · ${selectedLedger.name}`)
    setDropdownSource('ledger')
    setShowLedgerDropdown(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true })
    })
  }, [selectedLedger])

  const handleSearchQueryChange = useCallback(
    (newQuery: string) => {
      setSearchQuery(newQuery)
      setDropdownSource('search')
      setShowLedgerDropdown(Boolean(newQuery.trim()))

      if (selectedLedger && newQuery !== `${selectedLedger.code} · ${selectedLedger.name}`) {
        setSelectedLedger(null)
        if (!editingId) {
          setNewValue('')
          setNewReason('')
        }
      }
    },
    [editingId, selectedLedger]
  )

  const closeLedgerDropdown = useCallback(() => {
    setShowLedgerDropdown(false)
    setDropdownSource('search')
  }, [])

  const selectLedgerAccount = useCallback((account: SearchableLedgerAccount) => {
    setSelectedLedger(account)
    setSearchQuery(`${account.code} · ${account.name}`)
    setNewValue('')
    setShowLedgerDropdown(false)
    setShowAddForm(true)
  }, [])

  const selectCustomLedger = useCallback((query: string) => {
    const { code, name } = parseCustomLedgerFromQuery(query)
    setSelectedLedger({ code, name })
    setSearchQuery(`${code} · ${name}`)
    setNewValue('')
    setShowLedgerDropdown(false)
    setShowAddForm(true)
  }, [])

  const selectPreset = useCallback((preset: NormalizationPresetOption) => {
    setIsEditorExpanded(true)
    setEditingId(null)
    setSelectedLedger({
      code: preset.ledgerCode,
      name: preset.ledgerName,
    })
    setSearchQuery(`${preset.ledgerCode} · ${preset.ledgerName}`)
    setNewType(preset.defaultType)
    setNewValue('')
    setNewReason(preset.description)
    setShowAddForm(true)
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Handle AI prompt submission - parse for ledger code/name and values
  const handlePromptSubmit = useCallback(
    (value: string) => {
      setIsEditorExpanded(true)
      setEditingId(null)
      // Try to parse the input for ledger codes (3-digit numbers)
      const codeMatch = value.match(/\b(\d{3})\b/)
      // Try to parse for amounts (€60.000 or 60000 or 60k)
      const amountMatch = value.match(/€?\s*(\d{1,3}(?:[.,]\d{3})*|\d+)(?:k)?/i)

      if (codeMatch) {
        const code = codeMatch[1]
        const matchingLedger = availableLedgers.find((l) => l.code === code)
        if (matchingLedger) {
          setSelectedLedger(matchingLedger)
          setShowAddForm(true)

          if (amountMatch) {
            let amount = amountMatch[1].replace(/[.,]/g, '')
            if (value.toLowerCase().includes('k')) {
              amount = String(parseInt(amount) * 1000)
            }
            setNewValue(amount)
          }
          return
        }
      }

      // Fallback: try to match preset by name
      const lowerValue = value.toLowerCase()
      const matchingPreset = normalizationPresets.find(
        (p) =>
          lowerValue.includes(p.label.toLowerCase()) ||
          lowerValue.includes(p.ledgerName.toLowerCase())
      )

      if (matchingPreset) {
        setSelectedLedger({
          code: matchingPreset.ledgerCode,
          name: matchingPreset.ledgerName,
        })
        setNewType(matchingPreset.defaultType)
        setNewValue('')
        setNewReason(matchingPreset.description)
        setShowAddForm(true)
        return
      }

      // If no match, show dropdown with search
      setSearchQuery(value)
      setShowLedgerDropdown(true)
    },
    [availableLedgers, normalizationPresets.find]
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
