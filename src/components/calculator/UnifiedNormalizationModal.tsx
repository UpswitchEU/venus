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

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarRange,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  FileSpreadsheet,
  Hash,
  LayoutGrid,
  LayoutList,
  Minus,
  Minus as MinusSquare,
  PenLine,
  Percent,
  Plus,
  Search,
  Square,
  Table2,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { Checkbox } from '@/design-system/components/Checkbox'
import { AuroraInput as Input } from '@/design-system/components/Input'
import { Modal, ModalContent, ModalFooter, ModalTitle } from '@/design-system/components/Modal'
// Status filter tabs removed - feature not yet active; Year filter + View mode only
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import { trackNormalizationAdd, trackNormalizationEdit } from '@/lib/analytics'
import { coalesceFiniteNumber } from '@/lib/omniPreview'
import {
  formatCurrencyTaxLatency,
  getNetTaxLatencyImpact,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import {
  findAcceptedAutoNormalizationCapBreaches,
  getNormalizationAmountForBase,
  getReportedEbitdaBaseline,
  summarizeAcceptedNormalizations,
  summarizeNormalizationsForAnchorYear,
} from '../../utils/normalizationMath'
import { NormalizationBentoView, NormalizationTableView } from './NormalizationViews'
import { TaxLatencySection } from './TaxLatencySection'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute'
export type NormalizationSource =
  | 'manual'
  | 'yuki'
  | 'exact'
  | 'silverfin'
  | 'bizzcontrol'
  | 'odoo'
  | 'octopus'
  | 'accountable'
  | 'csv'
  | 'ai'
  | 'auto'
export type NormalizationStatus = 'pending' | 'accepted' | 'rejected'

import {
  applyGrootboekCountryOverrides,
  DEFAULT_LEDGER_ACCOUNTS,
  type LedgerAccount,
} from '../../constants/grootboek'
import { generalLogger } from '../../utils/logger'

export type { LedgerAccount } from '../../constants/grootboek'

export interface NormalizationItem {
  id: string
  ledgerCode: string
  ledgerName: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  /** Original backend 12-category value, preserved for lossless round-trip persistence. */
  backendCategory?: string
  type: NormalizationType
  value: number
  adjustment: number
  reason?: string
  source: NormalizationSource
  sourceRef?: string
  status: NormalizationStatus
  applyAllYears: boolean
  applyYears?: number[]
  year: number
  confidence?: 'high' | 'medium' | 'low'
  marketBenchmark?: number
}

/** Titan / ValuationIQ imported-ledger SDE rows use this ID prefix (stable across bulk + manual follow-up). */
export function isImportedLedgerNormalizationItem(item: Pick<NormalizationItem, 'id'>): boolean {
  return typeof item.id === 'string' && item.id.startsWith('imported_sde_')
}

export interface UnifiedNormalizationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyName: string
  currentYear?: number
  originalEBITDA: number
  /** Per-year reported EBITDA for accurate multi-year totals */
  originalEBITDAByYear?: Record<number, number>
  normalizations: NormalizationItem[]
  onNormalizationsChange: (normalizations: NormalizationItem[]) => void
  ledgerAccounts?: LedgerAccount[]
  countryCode?: string | null
  hasUploadedData?: boolean
  onUploadClick?: () => void
  initialSearchQuery?: string
  initialYearFilter?: number | null
  /** Financial years entered by the user (historical + optional forecasts; numeric years) */
  financialYears?: number[]
  /** Fallback form data ref (from ManualInputPanel) — read when originalEBITDA is 0. Modal renders after panel, so ref has latest. */
  fallbackFormDataRef?: React.MutableRefObject<Record<string, unknown> | null>
}

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

const categoryConfig: Record<NormalizationItem['category'], { icon: string; labelKey: string }> = {
  salary: { icon: '👤', labelKey: 'categories.salary' },
  rent: { icon: '🏢', labelKey: 'categories.rent' },
  vehicle: { icon: '🚗', labelKey: 'categories.vehicle' },
  'one-time': { icon: '⚡', labelKey: 'categories.oneTime' },
  personal: { icon: '🏠', labelKey: 'categories.personal' },
  depreciation: { icon: '📉', labelKey: 'categories.depreciation' },
  other: { icon: '📋', labelKey: 'categories.other' },
}

const sourceConfig: Record<NormalizationSource, { labelKey: string; color: string }> = {
  manual: { labelKey: 'sources.manual', color: 'bg-foreground/10 text-foreground/70' },
  yuki: { labelKey: 'sources.yuki', color: 'bg-accent/10 text-accent' },
  exact: { labelKey: 'sources.exact', color: 'bg-info/10 text-info' },
  silverfin: { labelKey: 'sources.silverfin', color: 'bg-indigo-500/10 text-indigo-600' },
  bizzcontrol: { labelKey: 'sources.bizzcontrol', color: 'bg-cyan-500/10 text-cyan-600' },
  odoo: { labelKey: 'sources.odoo', color: 'bg-purple-500/10 text-purple-600' },
  octopus: { labelKey: 'sources.octopus', color: 'bg-blue-500/10 text-blue-600' },
  accountable: { labelKey: 'sources.accountable', color: 'bg-emerald-500/10 text-emerald-600' },
  csv: { labelKey: 'sources.csv', color: 'bg-warning/10 text-warning' },
  ai: { labelKey: 'aiSuggestion', color: 'bg-primary/10 text-primary' },
  auto: { labelKey: 'sources.auto', color: 'bg-success/10 text-success' },
}

const typeOptions: {
  value: NormalizationType
  label: string
  icon: typeof Plus
  tooltipKey: string
}[] = [
  { value: 'add', label: '+€', icon: Plus, tooltipKey: 'typeAddAmount' },
  { value: 'subtract', label: '-€', icon: Minus, tooltipKey: 'typeSubtractAmount' },
  { value: 'add_percent', label: '+%', icon: Percent, tooltipKey: 'typeAddPercent' },
  { value: 'subtract_percent', label: '-%', icon: Percent, tooltipKey: 'typeSubtractPercent' },
  { value: 'absolute', label: 'ABS', icon: Hash, tooltipKey: 'typeSetTarget' },
]

const defaultLedgerAccounts = DEFAULT_LEDGER_ACCOUNTS

// Fuzzy search helper - matches characters in order but not necessarily adjacent
const fuzzyMatch = (
  text: string,
  query: string
): { matches: boolean; score: number; indices: number[] } => {
  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase().trim()

  if (!queryLower) return { matches: true, score: 0, indices: [] }

  // Exact match gets highest score
  if (textLower.includes(queryLower)) {
    const startIndex = textLower.indexOf(queryLower)
    return {
      matches: true,
      score: 100 - startIndex,
      indices: Array.from({ length: queryLower.length }, (_, i) => startIndex + i),
    }
  }

  // Fuzzy match: characters must appear in order
  let queryIndex = 0
  const indices: number[] = []

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      indices.push(i)
      queryIndex++
    }
  }

  if (queryIndex === queryLower.length) {
    // Score based on how compact the match is (closer characters = higher score)
    const spread = indices[indices.length - 1] - indices[0]
    const score = 50 - spread + (indices[0] === 0 ? 20 : 0)
    return { matches: true, score, indices }
  }

  return { matches: false, score: -1, indices: [] }
}

/** Parse search query into custom ledger code and name. Supports "760 · Name" or plain "760" / "760123" */
function parseCustomLedgerFromQuery(query: string): { code: string; name: string } {
  const trimmed = query.trim()
  const sep = trimmed.indexOf(' · ')
  if (sep >= 0) {
    const code = trimmed.slice(0, sep).trim()
    const name = trimmed.slice(sep + 3).trim()
    return { code: code || trimmed, name: name || code || trimmed }
  }
  // Extract leading digits as code if present
  const digitMatch = trimmed.match(/^(\d[\d.]*)/)
  const code = digitMatch ? digitMatch[1] : trimmed
  const name = trimmed
  return { code, name }
}

// Preset definitions with translation keys (resolved in component)
const PRESET_CONFIGS: Array<{
  id: string
  labelKey: string
  ledgerCode: string
  ledgerNameKey: string
  category: NormalizationItem['category']
  defaultType: NormalizationType
  defaultValue: number
  descriptionKey: string
  marketBenchmark?: string
}> = [
  {
    id: 'owner-salary',
    labelKey: 'presetLabels.ownerSalary',
    ledgerCode: '620',
    ledgerNameKey: 'presetLedgerNames.directorCompensation',
    category: 'salary',
    defaultType: 'add',
    defaultValue: 60000,
    descriptionKey: 'presetDescriptions.ownerSalary',
    marketBenchmark: '€55K - €75K',
  },
  {
    id: 'family-salary',
    labelKey: 'presetLabels.familySalary',
    ledgerCode: '620',
    ledgerNameKey: 'presetLedgerNames.familyCompensation',
    category: 'salary',
    defaultType: 'add',
    defaultValue: 35000,
    descriptionKey: 'presetDescriptions.familySalary',
    marketBenchmark: '€25K - €40K',
  },
  {
    id: 'rent-office',
    labelKey: 'presetLabels.rent',
    ledgerCode: '610',
    ledgerNameKey: 'presetLedgerNames.rent',
    category: 'rent',
    defaultType: 'add',
    defaultValue: 24000,
    descriptionKey: 'presetDescriptions.rent',
    marketBenchmark: '€150 - €250/m²',
  },
  {
    id: 'vehicle-costs',
    labelKey: 'presetLabels.vehicle',
    ledgerCode: '614',
    ledgerNameKey: 'presetLedgerNames.vehicle',
    category: 'vehicle',
    defaultType: 'add',
    defaultValue: 18000,
    descriptionKey: 'presetDescriptions.vehicle',
    marketBenchmark: '€12K - €24K/jaar',
  },
  {
    id: 'one-time-legal',
    labelKey: 'presetLabels.oneTimeLegal',
    ledgerCode: '647',
    ledgerNameKey: 'presetLedgerNames.oneTime',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 25000,
    descriptionKey: 'presetDescriptions.oneTimeLegal',
  },
  {
    id: 'one-time-advisory',
    labelKey: 'presetLabels.oneTimeAdvisory',
    ledgerCode: '613',
    ledgerNameKey: 'presetLedgerNames.fees',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 15000,
    descriptionKey: 'presetDescriptions.oneTimeAdvisory',
  },
  {
    id: 'restructuring',
    labelKey: 'presetLabels.restructuring',
    ledgerCode: '644',
    ledgerNameKey: 'presetLedgerNames.restructuring',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 50000,
    descriptionKey: 'presetDescriptions.restructuring',
  },
  {
    id: 'depreciation',
    labelKey: 'presetLabels.depreciation',
    ledgerCode: '632',
    ledgerNameKey: 'presetLedgerNames.depreciation',
    category: 'depreciation',
    defaultType: 'add',
    defaultValue: 20000,
    descriptionKey: 'presetDescriptions.depreciation',
  },
  {
    id: 'personal-expenses',
    labelKey: 'presetLabels.personalExpenses',
    ledgerCode: '649',
    ledgerNameKey: 'presetLedgerNames.personal',
    category: 'personal',
    defaultType: 'add',
    defaultValue: 12000,
    descriptionKey: 'presetDescriptions.personalExpenses',
  },
  {
    id: 'asset-sale',
    labelKey: 'presetLabels.assetSale',
    ledgerCode: '741',
    ledgerNameKey: 'presetLedgerNames.assetGains',
    category: 'one-time',
    defaultType: 'subtract',
    defaultValue: 30000,
    descriptionKey: 'presetDescriptions.assetSale',
  },
]

const generateId = () => Math.random().toString(36).substring(2, 11)

/** Infer normalization category from Belgian MAR grootboek code range */
export function inferCategoryFromCode(code: string): NormalizationItem['category'] {
  const num = parseInt(code, 10)
  if (!Number.isFinite(num)) return 'other'
  if (num >= 620 && num <= 629) return 'salary'
  if (num === 610) return 'rent'
  if (num === 614) return 'vehicle'
  if (num >= 630 && num <= 636) return 'depreciation'
  if (num === 649) return 'personal'
  if (num >= 640 && num <= 648) return 'one-time'
  if (num === 660) return 'depreciation'
  return 'other'
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
  const ca = useTranslations('chatAssistant')
  const tCommon = useTranslations('common.actions')
  const tTax = useTranslations('taxLatency')
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

  const [primaryTab, setPrimaryTab] = useState<'ebitda' | 'balans'>('ebitda')

  // View mode: bento (cards), compact (table rows), or financial (multi-year table)
  const [viewMode, setViewMode] = useState<'bento' | 'compact' | 'financial'>('compact')

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
  }, [showLedgerDropdown, dropdownSource, searchQuery])

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

  // Scroll add form into view when it appears
  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      // Small delay to allow animation to start
      setTimeout(() => {
        addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
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
  const yearsInData = useMemo(() => {
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

  // Available ledger accounts: prop > API fetch > hardcoded defaults; apply NL overrides when country is NL
  const availableLedgers = useMemo(() => {
    let base: LedgerAccount[]
    if (ledgerAccounts.length > 0) base = ledgerAccounts
    else if (fetchedLedgers.length > 0) base = fetchedLedgers
    else base = defaultLedgerAccounts
    return applyGrootboekCountryOverrides(base, countryCode)
  }, [ledgerAccounts, fetchedLedgers, countryCode])

  const getLedgerDisplayName = useCallback(
    (ledgerCode?: string, ledgerName?: string) => {
      const fallbackName = ledgerName || ledgerCode || ''
      const [resolved] = applyGrootboekCountryOverrides(
        [{ code: ledgerCode || '', name: fallbackName }],
        countryCode
      )
      return resolved?.name || fallbackName
    },
    [countryCode]
  )

  // Resolve presets against the canonical reference data so ledgerName
  // always matches the official Belgian MAR name for the code.
  const normalizationPresets = useMemo(
    () =>
      PRESET_CONFIGS.map((c) => {
        const refAccount = availableLedgers.find((l) => l.code === c.ledgerCode)
        return {
          id: c.id,
          label: nh(c.labelKey as any),
          icon: '',
          ledgerCode: c.ledgerCode,
          ledgerName: refAccount?.name ?? nh(c.ledgerNameKey as any),
          category: c.category,
          defaultType: c.defaultType,
          defaultValue: c.defaultValue,
          description: nh(c.descriptionKey as any),
          marketBenchmark: c.marketBenchmark,
        }
      }),
    [nh, availableLedgers]
  )

  // Filter ledger accounts based on search with fuzzy matching
  const filteredLedgers = useMemo(() => {
    const query = searchQuery.trim()

    if (!query) {
      // Show all accounts when no query, grouped by category
      return availableLedgers.slice(0, 12)
    }

    // Apply fuzzy search to both code and name (defensive String() for malformed API data)
    const results = availableLedgers
      .map((account) => {
        const codeMatch = fuzzyMatch(String(account.code ?? ''), query)
        const nameMatch = fuzzyMatch(String(account.name ?? ''), query)
        const categoryMatch = account.category
          ? fuzzyMatch(String(account.category ?? ''), query)
          : { matches: false, score: -1, indices: [] }

        // Take the best match
        const bestMatch = [codeMatch, nameMatch, categoryMatch].reduce((best, current) =>
          current.score > best.score ? current : best
        )

        return {
          account,
          matches: codeMatch.matches || nameMatch.matches || categoryMatch.matches,
          score: bestMatch.score,
          codeIndices: codeMatch.matches ? codeMatch.indices : [],
          nameIndices: nameMatch.matches ? nameMatch.indices : [],
        }
      })
      .filter((r) => r.matches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return results.map((r) => ({
      ...r.account,
      _codeIndices: r.codeIndices,
      _nameIndices: r.nameIndices,
    }))
  }, [searchQuery, availableLedgers])

  // Keep explicit 0 EBITDA values instead of falling through to unrelated fallback sources.
  const safeOriginalEBITDA = (() => {
    return getReportedEbitdaBaseline({
      year: currentYear,
      originalEBITDAByYear,
      fallbackCandidates: [
        originalEBITDA,
        (fallbackFormDataRef?.current as any)?.yearlyFinancials?.[0]?.ebitda,
        (fallbackFormDataRef?.current as any)?.current_year_data?.ebitda,
        (fallbackFormDataRef?.current as any)?.ebitda,
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

  const autoNormalizationCapBreaches = useMemo(
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
  const hasAutoNormalizationCapBreaches = autoNormalizationCapBreaches.length > 0
  const isDutch = String(locale).toLowerCase().startsWith('nl')

  // Auto-detected suggestions (pending + zero adjustment) that fire identically
  // across ≥2 years are noise when expanded into per-year rows — the same "rent
  // is high" flag appearing in 2021..2025 reads as five rows of nothing. Lift
  // them into a single consolidated card and exclude them from the per-year
  // grouping below. Accepted items keep year-specific rows because their
  // adjustments differ per year (different revenue / line totals).
  const crossYearPendingGroups = useMemo(() => {
    const buckets = new Map<string, { sample: NormalizationItem; ids: string[]; years: number[] }>()
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
        groups.get(y)!.push(n)
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
  }, [normalizations, onNormalizationsChange, selectedIds])

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
    [removeNormalization]
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
  ])

  // File input ref for CSV upload
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onUploadClick) {
      onUploadClick()
    }
  }

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
    [availableLedgers]
  )

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        className="sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] flex flex-col p-0"
        size="full"
        description={nh('modalTitle')}
      >
        {/* Header - Compact with EBITDA summary inline */}
        <div className="px-6 py-3 border-b border-foreground/[0.06] flex items-center justify-between pr-14">
          <div className="flex items-center gap-3">
            {/* Back: explicit affordance — the modal feels like a sub-page (92vh) so users
                instinctively reach for a left-arrow. The X close in the corner is too easy
                to miss, and the calculator's own back button sits behind the modal overlay. */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={tCommon('back')}
              title={tCommon('back')}
              className="p-2 -ml-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <div>
              <ModalTitle className="text-sm font-semibold">{nh('modalTitle')}</ModalTitle>
              <p className="text-xs text-foreground/50">{companyName}</p>
            </div>
          </div>

          {/* Inline Summary - adapts per tab, hidden on small screens */}
          {primaryTab === 'ebitda' ? (
            <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0">
              <div className="flex items-center gap-4 lg:gap-6">
                <div className="text-right">
                  <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">
                    {nh('original')}
                  </p>
                  <p className="text-sm font-mono font-medium text-foreground/50">
                    {formatCurrency(totals.original)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">
                    {nh('adjustment')}
                  </p>
                  <motion.p
                    key={totals.adjustment}
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      'text-sm font-mono font-semibold',
                      totals.adjustment > 0
                        ? 'text-success'
                        : totals.adjustment < 0
                          ? 'text-secondary'
                          : 'text-foreground/50'
                    )}
                  >
                    {totals.adjustment > 0 ? '+' : ''}
                    {formatCurrency(totals.adjustment)}
                  </motion.p>
                  {/* Pending hint: tells the user WHY Aanpassing is €0 when there are visible
                    pending rows. Don't fold pending into the accepted total — it would silently
                    inflate the EBITDA bridge against what the report actually computed. */}
                  {totals.pendingCount > 0 && totals.pendingAdjustment !== 0 && (
                    <p
                      className="text-[9px] font-mono font-medium text-warning/80 mt-0.5 tabular-nums"
                      title={nh('pendingHintTooltip', { count: totals.pendingCount })}
                    >
                      {nh('pendingHint', {
                        sign: totals.pendingAdjustment > 0 ? '+' : '',
                        amount: formatCurrency(totals.pendingAdjustment),
                      })}
                    </p>
                  )}
                </div>
                <div className="w-px h-8 bg-foreground/10" />
                <div className="text-right">
                  <p className="text-[9px] font-medium text-primary uppercase tracking-wider">
                    {nh('normalized')}
                  </p>
                  <motion.p
                    key={totals.normalized}
                    initial={{ opacity: 0.5, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="text-lg font-mono font-bold text-foreground tracking-tight"
                  >
                    {formatCurrency(totals.normalized)}
                  </motion.p>
                </div>
              </div>
              {yearFilter === null && (
                <p className="text-[9px] text-foreground/45 text-right max-w-[min(100%,26rem)] leading-snug">
                  {nh('anchorYearBridgeHint', { year: currentYear })}
                </p>
              )}
              {yearFilter !== null && (
                <p className="text-[9px] text-foreground/45 text-right">
                  {nh('filteredYearTotalsHint', { year: yearFilter })}
                </p>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-4 lg:gap-6">
              <div className="text-right">
                <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">
                  {nh('primaryTabTaxLatencies')}
                </p>
                <p className="text-sm font-mono font-medium text-foreground/50 tabular-nums">
                  {tTax('itemCount', { count: taxLatencyCount })}
                </p>
                {taxLatencyCandidateCount > 0 && (
                  <p
                    className="text-[9px] font-mono font-medium text-warning/80 mt-0.5 tabular-nums"
                    title={tTax('pendingCandidatesTooltip', {
                      count: taxLatencyCandidateCount,
                    })}
                  >
                    {tTax('pendingCandidatesHint', { count: taxLatencyCandidateCount })}
                  </p>
                )}
              </div>
              <div className="w-px h-8 bg-foreground/10" />
              <div className="text-right">
                <p className="text-[9px] font-medium text-primary uppercase tracking-wider">
                  {tTax('netImpact')}
                </p>
                <motion.p
                  key={taxLatencyNetImpact}
                  initial={{ opacity: 0.5, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className={cn(
                    'text-lg font-mono font-bold tracking-tight',
                    taxLatencyNetImpact > 0
                      ? 'text-success'
                      : taxLatencyNetImpact < 0
                        ? 'text-secondary'
                        : 'text-foreground/50'
                  )}
                >
                  {taxLatencyNetImpact > 0 ? '+' : ''}
                  {formatCurrencyTaxLatency(taxLatencyNetImpact, currencyLocale)}
                </motion.p>
              </div>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div
          className="px-6 py-2 border-b border-foreground/[0.06]"
          role="tablist"
          aria-label={`${nh('primaryTabEbitda')} / ${nh('primaryTabTaxLatencies')}`}
        >
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-background/80 border border-foreground/[0.06] w-fit">
            <button
              onClick={() => setPrimaryTab('ebitda')}
              role="tab"
              aria-selected={primaryTab === 'ebitda'}
              aria-controls="ebitda-tab-content"
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                primaryTab === 'ebitda'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
              )}
            >
              {nh('primaryTabEbitda')}
            </button>
            <button
              onClick={() => setPrimaryTab('balans')}
              role="tab"
              aria-selected={primaryTab === 'balans'}
              aria-controls="balans-tab-content"
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                primaryTab === 'balans'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
              )}
            >
              {nh('primaryTabTaxLatencies')}
              {taxLatencyCount > 0 && (
                <span
                  className={cn(
                    'ml-0.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-md text-[10px] font-bold tabular-nums',
                    primaryTab === 'balans'
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-foreground/[0.08] text-foreground/60'
                  )}
                >
                  {taxLatencyCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {(hasAutoNormalizationCapBreaches || requiresTaxLatencyReview) && (
          <div className="px-6 pt-3 space-y-2">
            {primaryTab === 'ebitda' && hasAutoNormalizationCapBreaches && (
              <div className="rounded-xl border border-warning/25 bg-warning/[0.04] p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {isDutch
                        ? 'Review vereist: auto-normalisaties overschrijden verdedigbaarheidslimiet'
                        : 'Review required: auto normalizations exceed defensibility cap'}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/70">
                      {isDutch
                        ? 'Deze jaren overschrijden 50% van de gerapporteerde EBITDA met auto-toegepaste addbacks. Onderbouw of corrigeer vóór externe deling.'
                        : 'These years exceed 50% of reported EBITDA via auto-applied addbacks. Substantiate or correct before external sharing.'}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {autoNormalizationCapBreaches.slice(0, 3).map((breach) => (
                        <li
                          key={breach.year}
                          className="text-xs font-mono text-foreground/75 tabular-nums"
                        >
                          {`${breach.year}: +${formatCurrency(breach.autoAddback)} (${breach.addbackPctOfEbitda.toFixed(1)}%) > ${formatCurrency(breach.capAmount)}`}
                        </li>
                      ))}
                      {autoNormalizationCapBreaches.length > 3 && (
                        <li className="text-xs text-foreground/60">
                          {isDutch
                            ? `+${autoNormalizationCapBreaches.length - 3} extra jaar/jaren met overschrijding`
                            : `+${autoNormalizationCapBreaches.length - 3} additional year(s) over cap`}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {primaryTab === 'balans' && requiresTaxLatencyReview && (
              <div className="rounded-xl border border-warning/25 bg-warning/[0.04] p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {isDutch
                        ? 'Review vereist: belastinglatenties ontbreken'
                        : 'Review required: tax latencies missing'}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/70">
                      {isDutch
                        ? 'Er zijn nog geen belastinglatenties toegepast terwijl er importsignalen beschikbaar zijn. Beoordeel en voeg de relevante regels toe voor een verdedigbare EV→Equity brug.'
                        : 'No tax latencies are applied yet while import signals are available. Review and add relevant rows for a defensible EV→Equity bridge.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 1: EBITDA Normalisaties */}
        {primaryTab === 'ebitda' && (
          <>
            <section className="px-6 pt-4 pb-2" role="region" aria-labelledby="section1-header">
              <button
                type="button"
                onClick={() => setIsEditorExpanded((expanded) => !expanded)}
                aria-expanded={isEditorExpanded}
                aria-controls="normalization-editor-panel"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04]"
              >
                <div className="min-w-0">
                  <h3 id="section1-header" className="text-sm font-semibold text-foreground">
                    {nh('editorToggleTitle')}
                  </h3>
                  <p className="mt-0.5 text-xs text-foreground/50">{nh('editorToggleSubtitle')}</p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-foreground/40 transition-transform',
                    isEditorExpanded && 'rotate-180'
                  )}
                />
              </button>
            </section>

            {/* Prompt Input Area - Compact */}
            <AnimatePresence initial={false}>
              {isEditorExpanded && (
                <motion.div
                  id="normalization-editor-panel"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className="overflow-hidden border-b border-foreground/[0.06]"
                >
                  <div ref={inputContainerRef} className="px-6 py-4 relative">
                    {/* Main Input Container - Enhanced glassmorphism with glow focus */}
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
                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileUpload}
                        className="hidden"
                      />

                      {/* Input Row */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Search className="w-4 h-4 text-foreground/40 flex-shrink-0" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder={
                            showAddForm
                              ? nh('searchOtherLedger')
                              : normalizations.length > 0
                                ? nh('searchOrAddNew')
                                : nh('typeCodeOrChoose')
                          }
                          value={searchQuery}
                          onChange={(e) => {
                            const newQuery = e.target.value
                            setSearchQuery(newQuery)
                            setDropdownSource('search')
                            // Only show dropdown when user types something
                            if (newQuery.trim()) {
                              setShowLedgerDropdown(true)
                            } else {
                              setShowLedgerDropdown(false)
                            }
                            // Clear selected ledger when typing (allows changing it in edit mode)
                            if (
                              selectedLedger &&
                              newQuery !== `${selectedLedger.code} · ${selectedLedger.name}`
                            ) {
                              setSelectedLedger(null)
                              // Don't clear values when editing - keep them for the new ledger selection
                              if (!editingId) {
                                setNewValue('')
                                setNewReason('')
                              }
                            }
                          }}
                          // Intentionally DO NOT open dropdown on focus (only on typing)
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchQuery.trim()) {
                              e.preventDefault()
                              handlePromptSubmit(searchQuery)
                            }
                          }}
                          className={cn(
                            'flex-1 bg-transparent border-none outline-none',
                            'focus:outline-none focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus:shadow-none focus:border-transparent',
                            'text-sm text-foreground placeholder:text-foreground/35',
                            'min-w-0'
                          )}
                        />

                        {/* Upload Button - only action needed */}
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => fileInputRef.current?.click()}
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

                      {/* Suggestion Pills Row - Hidden when add form is visible */}
                      <AnimatePresence>
                        {!showAddForm && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="px-4 pb-4 pt-2"
                          >
                            <div className="flex flex-wrap items-center gap-2.5">
                              {normalizationPresets.slice(0, 6).map((preset, index) => (
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
                                  onClick={() => {
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
                                  }}
                                  className={cn(
                                    'inline-flex items-center px-4 py-2.5 rounded-xl',
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

                      {/* Ledger dropdown - rendered via portal for proper z-index. Anchored to search input or ledger pill (Wijzig) */}
                      {showLedgerDropdown &&
                        searchQuery.trim().length > 0 &&
                        dropdownAnchorRect &&
                        createPortal(
                          // NOTE: pointer-events are carefully managed to avoid the backdrop intercepting item clicks.
                          <div className="fixed inset-0 z-[11000] pointer-events-none">
                            {/* Backdrop to close dropdown */}
                            <button
                              type="button"
                              aria-label={nh('closeLedgerDropdown')}
                              className="absolute inset-0 pointer-events-auto bg-transparent"
                              onClick={() => {
                                setShowLedgerDropdown(false)
                                setDropdownSource('search')
                              }}
                            />
                            {/* Dropdown content - clickable, dense two-line layout */}
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                              className="absolute z-[11001] pointer-events-auto py-1 bg-background border border-foreground/10 rounded-xl shadow-2xl max-h-[320px] overflow-y-auto"
                              style={{
                                top: dropdownAnchorRect.bottom + 4,
                                left: dropdownAnchorRect.left,
                                width: Math.max(dropdownAnchorRect.width, 320),
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="px-3 py-1.5 border-b border-foreground/[0.06] flex items-center justify-between sticky top-0 bg-background z-10">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
                                  {nh('ledgerAccounts')}
                                </span>
                                <span className="text-[10px] text-foreground/30 tabular-nums">
                                  {filteredLedgers.length > 0
                                    ? nh('foundCount', { count: filteredLedgers.length })
                                    : nh('customLedgerCode')}
                                </span>
                              </div>
                              <div className="py-0.5">
                                {filteredLedgers.map((account, index) => {
                                  // Type assertion for fuzzy match indices
                                  const codeIndices = (account as any)._codeIndices || []
                                  const nameIndices = (account as any)._nameIndices || []

                                  // Highlight matched characters in code
                                  const renderHighlightedCode = () => {
                                    if (codeIndices.length === 0) return account.code
                                    return account.code.split('').map((char, i) => (
                                      <span
                                        key={i}
                                        className={
                                          codeIndices.includes(i) ? 'text-primary font-bold' : ''
                                        }
                                      >
                                        {char}
                                      </span>
                                    ))
                                  }

                                  // Highlight matched characters in name
                                  const renderHighlightedName = () => {
                                    if (nameIndices.length === 0) return account.name
                                    return account.name.split('').map((char, i) => (
                                      <span
                                        key={i}
                                        className={
                                          nameIndices.includes(i)
                                            ? 'text-primary font-semibold'
                                            : ''
                                        }
                                      >
                                        {char}
                                      </span>
                                    ))
                                  }

                                  return (
                                    <motion.button
                                      key={account.code}
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      transition={{ delay: Math.min(index * 0.015, 0.15) }}
                                      onClick={() => {
                                        setSelectedLedger(account)
                                        setSearchQuery(`${account.code} · ${account.name}`)
                                        setNewValue('')
                                        setShowLedgerDropdown(false)
                                        setShowAddForm(true)
                                      }}
                                      className={cn(
                                        'w-full px-3 py-2 text-left hover:bg-primary/5 flex items-center gap-2.5 transition-colors group',
                                        'min-h-[48px]' // 48px touch target for mobile
                                      )}
                                    >
                                      {/* Code badge - compact */}
                                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold min-w-[3rem] text-center group-hover:bg-primary/15 transition-colors flex-shrink-0">
                                        {renderHighlightedCode()}
                                      </span>
                                      {/* Two-line content: name + category */}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground/90 truncate leading-tight">
                                          {renderHighlightedName()}
                                        </p>
                                        {account.category && (
                                          <p className="text-[10px] text-foreground/40 truncate leading-tight mt-0.5">
                                            {account.category}
                                          </p>
                                        )}
                                      </div>
                                    </motion.button>
                                  )
                                })}
                                {/* Always show custom option when user has typed - allows custom codes not in the list */}
                                {searchQuery.trim() && (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      const { code, name } = parseCustomLedgerFromQuery(searchQuery)
                                      setSelectedLedger({ code, name })
                                      setSearchQuery(`${code} · ${name}`)
                                      setNewValue('')
                                      setShowLedgerDropdown(false)
                                      setShowAddForm(true)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        const { code, name } =
                                          parseCustomLedgerFromQuery(searchQuery)
                                        setSelectedLedger({ code, name })
                                        setSearchQuery(`${code} · ${name}`)
                                        setNewValue('')
                                        setShowLedgerDropdown(false)
                                        setShowAddForm(true)
                                      }
                                    }}
                                    className={cn(
                                      'w-full px-3 py-3 text-left hover:bg-primary/5 flex items-center justify-between gap-2.5 transition-colors min-h-[52px] cursor-pointer',
                                      filteredLedgers.length > 0 &&
                                        'border-t border-foreground/[0.06]'
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold min-w-[3rem] text-center flex-shrink-0">
                                        +
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground/90 font-medium">
                                          {nh('useCustomCode', { query: searchQuery.trim() })}
                                        </p>
                                        <p className="text-[10px] text-foreground/40 mt-0.5">
                                          {nh('customLedgerCode')}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const { code, name } =
                                          parseCustomLedgerFromQuery(searchQuery)
                                        setSelectedLedger({ code, name })
                                        setSearchQuery(`${code} · ${name}`)
                                        setNewValue('')
                                        setShowLedgerDropdown(false)
                                        setShowAddForm(true)
                                      }}
                                      className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                                    >
                                      {nh('actions.add')}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          </div>,
                          document.body
                        )}
                    </motion.div>
                  </div>

                  {/* Toolbar: Year Filter + View Mode Toggle */}
                  <div className="px-6 py-3 border-t border-foreground/[0.06] bg-muted/30">
                    <div className="flex items-center justify-end gap-4">
                      <div className="flex items-center gap-3">
                        {/* Year Filter Pills - show all available financial years */}
                        {availableYears.length > 1 && (
                          <div className="flex items-center gap-1 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
                            <button
                              onClick={() => setYearFilter(null)}
                              className={cn(
                                'px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                                yearFilter === null
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
                              )}
                            >
                              {nh('all')}
                            </button>
                            {availableYears.slice(0, 4).map((year) => (
                              <button
                                key={year}
                                onClick={() => setYearFilter(yearFilter === year ? null : year)}
                                className={cn(
                                  'px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all tabular-nums',
                                  yearFilter === year
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
                                )}
                              >
                                {year}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* View Mode Toggle */}
                        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
                          <TooltipProvider>
                            <TooltipRoot>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setViewMode('compact')}
                                  className={cn(
                                    'p-1.5 rounded-lg transition-all',
                                    viewMode === 'compact'
                                      ? 'bg-primary text-primary-foreground shadow-sm'
                                      : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]'
                                  )}
                                >
                                  <LayoutList className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-[10px]">
                                {nh('viewCompact')}
                              </TooltipContent>
                            </TooltipRoot>
                          </TooltipProvider>
                          <TooltipProvider>
                            <TooltipRoot>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setViewMode('financial')}
                                  className={cn(
                                    'p-1.5 rounded-lg transition-all',
                                    viewMode === 'financial'
                                      ? 'bg-primary text-primary-foreground shadow-sm'
                                      : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]'
                                  )}
                                >
                                  <Table2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-[10px]">
                                {nh('viewFinancial')}
                              </TooltipContent>
                            </TooltipRoot>
                          </TooltipProvider>
                          <TooltipProvider>
                            <TooltipRoot>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setViewMode('bento')}
                                  className={cn(
                                    'p-1.5 rounded-lg transition-all',
                                    viewMode === 'bento'
                                      ? 'bg-primary text-primary-foreground shadow-sm'
                                      : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]'
                                  )}
                                >
                                  <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-[10px]">
                                {nh('viewBento')}
                              </TooltipContent>
                            </TooltipRoot>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bulk Actions Bar */}
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-6 pb-3"
                >
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground/70">
                        {nh('bulkSelected', { count: selectedIds.size })}
                      </span>
                      <button
                        onClick={deselectAll}
                        className="text-xs text-foreground/50 hover:text-foreground/70 underline"
                      >
                        {nh('bulkDeselect')}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => bulkUpdateStatus('rejected')}
                        className="text-xs h-8 px-3 text-secondary hover:text-secondary hover:bg-secondary/10"
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        {ca('reject')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => bulkUpdateStatus('accepted')}
                        className="text-xs h-8 px-3 text-success hover:text-success hover:bg-success/10"
                      >
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        {ca('accept')}
                      </Button>
                      <div className="w-px h-6 bg-foreground/10" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={bulkDelete}
                        className="text-xs h-8 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        {tCommon('remove')}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Content */}
            <div
              ref={listContainerRef}
              id="ebitda-tab-content"
              role="tabpanel"
              className="flex-1 overflow-y-auto px-6 pb-6"
            >
              <>
                {/* Inline Add Form - Appears FIRST when adding for immediate visibility */}
                <AnimatePresence>
                  {showAddForm && (
                    <motion.div
                      ref={addFormRef}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 rounded-xl bg-primary/[0.03] border border-primary/20 mb-4"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Plus className="w-4 h-4 text-primary" />
                          {nh('addNormalization')}
                        </span>
                        <button
                          onClick={cancelEditing}
                          className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/40 hover:text-foreground/60 transition-colors"
                          aria-label={nh('actions.cancel')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Selected Ledger Pill - Clickable to change */}
                      {selectedLedger && (
                        <div className="mb-4">
                          <label className="text-xs font-medium text-foreground/60 mb-1.5 block">
                            {nh('ledgerAccountLabel')}
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              ref={ledgerButtonRef}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                setSearchQuery(`${selectedLedger.code} · ${selectedLedger.name}`)
                                setDropdownSource('ledger')
                                setShowLedgerDropdown(true)
                                requestAnimationFrame(() => {
                                  searchInputRef.current?.focus()
                                })
                              }}
                              className="flex-1 flex items-center gap-3 p-2.5 rounded-lg bg-background/80 border border-foreground/[0.08] hover:border-primary/30 hover:bg-primary/[0.02] transition-all group text-left"
                              aria-label={nh('clickToChooseLedger')}
                            >
                              <span className="font-mono text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-bold group-hover:bg-primary/15 transition-colors">
                                {selectedLedger.code}
                              </span>
                              <span className="text-sm text-foreground flex-1 truncate">
                                {selectedLedger.name}
                              </span>
                              <span className="text-[10px] text-foreground/40 group-hover:text-primary transition-colors flex items-center gap-1">
                                <Edit3 className="w-3 h-3" />
                                {nh('changeLedgerButton')}
                              </span>
                            </button>
                          </div>
                          <p className="text-[10px] text-foreground/40 mt-1">
                            {nh('clickToChooseLedger')}
                          </p>
                        </div>
                      )}

                      {/* Inline form row */}
                      <div className="flex flex-wrap gap-3 items-end">
                        {/* Type Selector */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground/60">
                            {nh('type')}
                          </label>
                          <div className="flex gap-1">
                            {typeOptions.map((option) => (
                              <TooltipProvider key={option.value}>
                                <TooltipRoot>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => setNewType(option.value)}
                                      className={cn(
                                        'px-3 py-2 rounded-lg text-xs font-medium transition-all',
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
                        </div>

                        {/* Value Input with label */}
                        <div className="flex-1 min-w-[140px]">
                          <Input
                            label={newType.includes('percent') ? nh('percentage') : nh('amount')}
                            type="text"
                            placeholder={newType.includes('percent') ? '10' : '0'}
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            leftIcon={
                              <span className="text-foreground/40 text-sm font-medium">
                                {newType.includes('percent') ? '%' : '€'}
                              </span>
                            }
                            size="sm"
                            truncateLabel={false}
                          />
                        </div>

                        {/* Year Scope Selection - Individual year buttons */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground/60">
                            {nh('applyTo')}
                          </label>
                          <div className="flex items-center gap-1 p-1 rounded-lg bg-foreground/[0.03]">
                            {availableYears.map((year) => (
                              <button
                                key={year}
                                type="button"
                                onClick={() => {
                                  if (newSelectedYears.includes(year)) {
                                    if (newSelectedYears.length > 1) {
                                      setNewSelectedYears(
                                        newSelectedYears.filter((y) => y !== year)
                                      )
                                    }
                                  } else {
                                    setNewSelectedYears(
                                      [...newSelectedYears, year].sort((a, b) => b - a)
                                    )
                                  }
                                }}
                                className={cn(
                                  'px-2.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                                  newSelectedYears.includes(year)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]'
                                )}
                              >
                                {year}
                              </button>
                            ))}
                            <div className="w-px h-6 bg-foreground/10 mx-1" />
                            <button
                              type="button"
                              onClick={() => setNewSelectedYears([...availableYears])}
                              className={cn(
                                'px-2.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                                newSelectedYears.length === availableYears.length
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]'
                              )}
                            >
                              {nh('all')}
                            </button>
                          </div>
                        </div>

                        {/* Add Button */}
                        <Button
                          onClick={addNormalization}
                          disabled={!newValue || !selectedLedger}
                          size="sm"
                          className="gap-1.5 h-10 self-end"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {editingId ? tCommon('save') : tCommon('add')}
                        </Button>

                        {/* Cancel button when editing */}
                        {editingId && (
                          <Button
                            onClick={cancelEditing}
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-10 self-end"
                          >
                            <X className="w-3.5 h-3.5" />
                            {tCommon('cancel')}
                          </Button>
                        )}
                      </div>

                      {/* Percentage Preview: Original → Outcome */}
                      {(newType === 'add_percent' || newType === 'subtract_percent') &&
                        newValue && (
                          <div className="mt-4 p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
                            <div className="flex items-center gap-4">
                              <div>
                                <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5">
                                  {nh('originalEbitda')}
                                </p>
                                <p className="text-sm font-mono font-medium text-foreground/60">
                                  {formatCurrency(safeOriginalEBITDA)}
                                </p>
                              </div>
                              <div className="text-foreground/30">→</div>
                              <div>
                                <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5">
                                  {nh('adjustment')}
                                </p>
                                <p
                                  className={cn(
                                    'text-sm font-mono font-semibold',
                                    newType === 'add_percent' ? 'text-success' : 'text-secondary'
                                  )}
                                >
                                  {newType === 'add_percent' ? '+' : '-'}
                                  {formatCurrency(
                                    Math.abs(
                                      getNormalizationAmountForBase(
                                        {
                                          type: newType,
                                          value: coalesceFiniteNumber(
                                            newValue.replace(/[^0-9.-]/g, '')
                                          ),
                                          adjustment: 0,
                                        },
                                        safeOriginalEBITDA
                                      )
                                    )
                                  )}
                                </p>
                              </div>
                              <div className="text-foreground/30">→</div>
                              <div>
                                <p className="text-[9px] font-medium text-primary uppercase tracking-wider mb-0.5">
                                  {nh('outcome')}
                                </p>
                                <p className="text-sm font-mono font-bold text-foreground">
                                  {formatCurrency(
                                    safeOriginalEBITDA +
                                      getNormalizationAmountForBase(
                                        {
                                          type: newType,
                                          value: coalesceFiniteNumber(
                                            newValue.replace(/[^0-9.-]/g, '')
                                          ),
                                          adjustment: 0,
                                        },
                                        safeOriginalEBITDA
                                      )
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Reason Input with label */}
                      <div className="mt-4">
                        <Input
                          label={nh('explanation')}
                          placeholder={nh('explanationPlaceholder')}
                          value={newReason}
                          onChange={(e) => setNewReason(e.target.value)}
                          size="sm"
                          truncateLabel={false}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* View Mode Content */}
                {viewMode === 'financial' ? (
                  /* Professional Financial Table View */
                  <NormalizationTableView
                    items={filteredNormalizations}
                    years={availableYears}
                    originalEBITDA={safeOriginalEBITDA}
                    originalEBITDAByYear={originalEBITDAByYear}
                    onAccept={(id) => updateStatus(id, 'accepted')}
                    onReject={(id) => updateStatus(id, 'rejected')}
                    onRemove={removeWithConfirmation}
                    onRestore={(id) => updateStatus(id, 'pending')}
                    onEdit={(item) => startEditing(item)}
                  />
                ) : viewMode === 'bento' ? (
                  /* Premium Bento Grid View */
                  <NormalizationBentoView
                    items={filteredNormalizations}
                    years={availableYears}
                    originalEBITDA={safeOriginalEBITDA}
                    originalEBITDAByYear={originalEBITDAByYear}
                    onAccept={(id) => updateStatus(id, 'accepted')}
                    onReject={(id) => updateStatus(id, 'rejected')}
                    onRemove={removeWithConfirmation}
                    onRestore={(id) => updateStatus(id, 'pending')}
                    onEdit={(item) => startEditing(item)}
                  />
                ) : (
                  /* Compact Table View (Original) */
                  <>
                    {/* Table Header for compact mode - only show when not using year groups or when a year filter is active */}
                    {filteredNormalizations.length > 0 && yearFilter !== null && (
                      <div className="mb-1 min-w-0 overflow-x-auto">
                        <div className="min-w-[920px]">
                          <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-b border-foreground/[0.06]">
                            {/* Checkbox column */}
                            <div className="w-6 flex-shrink-0">
                              <button
                                onClick={() => (isAllSelected ? deselectAll() : selectAll())}
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
                            </div>
                            <div className="w-16 flex-shrink-0">{nh('table.code')}</div>
                            <div className="flex-1 min-w-0">{nh('table.grootboekrekening')}</div>
                            <div className="w-20 flex-shrink-0 text-center">{nh('table.jaar')}</div>
                            <div className="w-36 flex-shrink-0 text-center">{nh('table.bron')}</div>
                            <div className="w-32 flex-shrink-0 text-center">
                              {nh('table.status')}
                            </div>
                            <div className="w-28 flex-shrink-0 text-right">{nh('amount')}</div>
                            <div className="w-20 flex-shrink-0 text-right">
                              {nh('table.acties')}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cross-year pending suggestions consolidated to one card per
                  (code, reason). Collapses 5 noisy "rent flag fires every
                  year" rows into a single review affordance. */}
                    {crossYearPendingGroups.length > 0 && (
                      <div className="mb-3 rounded-xl border border-warning/20 bg-warning/[0.03] overflow-hidden">
                        <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-warning/80 border-b border-warning/15 bg-warning/[0.04]">
                          {nh('crossYearSuggestionsTitle', {
                            count: crossYearPendingGroups.length,
                          })}
                        </div>
                        <div className="divide-y divide-warning/10">
                          {crossYearPendingGroups.map((bucket) => {
                            const code = bucket.sample.ledgerCode
                            const ledgerLabel = getLedgerDisplayName(
                              bucket.sample.ledgerCode,
                              bucket.sample.ledgerName
                            )
                            const yearsLabel =
                              bucket.years.length > 1
                                ? `${bucket.years[bucket.years.length - 1]}–${bucket.years[0]} (${bucket.years.length})`
                                : String(bucket.years[0] ?? '')
                            return (
                              <div
                                key={bucket.ids.join(',')}
                                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.08] text-foreground/70">
                                      {code}
                                    </span>
                                    <span className="text-sm font-medium text-foreground break-words min-w-0">
                                      {ledgerLabel}
                                    </span>
                                    <span className="text-[11px] text-foreground/55">
                                      {yearsLabel}
                                    </span>
                                  </div>
                                  {bucket.sample.reason && (
                                    <p
                                      className="mt-1 text-xs text-foreground/55 line-clamp-4 break-words"
                                      title={bucket.sample.reason}
                                    >
                                      {bucket.sample.reason}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      for (const id of bucket.ids) updateStatus(id, 'rejected')
                                    }}
                                    className="h-7 px-2.5 rounded-md text-[11px] font-medium text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                                  >
                                    {nh('actions.reject')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditing(bucket.sample)}
                                    className="h-7 px-3 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                  >
                                    {nh('actions.review')}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Year-Grouped Collapsible Sections */}
                    {filteredNormalizations.length > 0 ? (
                      <div className="space-y-3">
                        {groupedByYear.map(({ year, items }) => {
                          const isCollapsed = collapsedYears.has(year)
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
                            <div
                              key={year}
                              className="rounded-xl border border-foreground/[0.06] overflow-hidden"
                            >
                              {/* Year Header - Collapsible */}
                              <button
                                onClick={() => toggleYearCollapse(year)}
                                className={cn(
                                  'w-full flex items-center justify-between px-4 py-3',
                                  'bg-foreground/[0.02] hover:bg-foreground/[0.04]',
                                  'transition-colors'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <motion.div
                                    animate={{ rotate: isCollapsed ? -90 : 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                  >
                                    <ChevronDown className="w-4 h-4 text-foreground/40" />
                                  </motion.div>
                                  <span className="text-sm font-semibold text-foreground tabular-nums">
                                    {year}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                                    {nh('itemCount', { count: items.length })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span
                                    className={cn(
                                      'text-sm font-mono font-semibold tabular-nums',
                                      yearTotal > 0
                                        ? 'text-success'
                                        : yearTotal < 0
                                          ? 'text-secondary'
                                          : 'text-foreground/40'
                                    )}
                                  >
                                    {yearTotal > 0 ? '+' : ''}
                                    {formatCurrency(yearTotal)}
                                  </span>
                                </div>
                              </button>

                              {/* Collapsible Content */}
                              <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                  >
                                    <div className="min-w-0 overflow-x-auto">
                                      <div className="min-w-[920px]">
                                        <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-t border-b border-foreground/[0.06] bg-foreground/[0.01]">
                                          <div className="w-6 flex-shrink-0" />
                                          <div className="w-16 flex-shrink-0">
                                            {nh('table.code')}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            {nh('table.grootboekrekening')}
                                          </div>
                                          <div className="w-36 flex-shrink-0 text-center">
                                            {nh('table.bron')}
                                          </div>
                                          <div className="w-32 flex-shrink-0 text-center">
                                            {nh('table.status')}
                                          </div>
                                          <div className="w-28 flex-shrink-0 text-right">
                                            {nh('amount')}
                                          </div>
                                          <div className="w-20 flex-shrink-0 text-right">
                                            {nh('table.acties')}
                                          </div>
                                        </div>

                                        <div>
                                          {items.map((item) => {
                                            const isSelected = selectedIds.has(item.id)

                                            return (
                                              <CompactTableRow
                                                key={item.id}
                                                item={item}
                                                isSelected={isSelected}
                                                getLedgerDisplayName={getLedgerDisplayName}
                                                onToggleSelect={() => toggleSelect(item.id)}
                                                onAccept={() => updateStatus(item.id, 'accepted')}
                                                onReject={() => updateStatus(item.id, 'rejected')}
                                                onRemove={() => removeWithConfirmation(item.id)}
                                                onRestore={() => updateStatus(item.id, 'pending')}
                                                onEdit={() => startEditing(item)}
                                                hideYear
                                                yearEbitda={yearEbitda}
                                              />
                                            )
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="py-20 text-center"
                      >
                        {/* Elegant floating illustration */}
                        <motion.div
                          className="relative w-24 h-24 mx-auto mb-8"
                          animate={{ y: [0, -6, 0] }}
                          transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        >
                          {/* Outer glow ring */}
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-sm" />
                          {/* Background circle */}
                          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/8 to-primary/4" />
                          {/* Inner icon container */}
                          <div className="absolute inset-3 rounded-full bg-background/90 backdrop-blur-sm border border-foreground/[0.08] shadow-sm flex items-center justify-center">
                            <PenLine className="w-8 h-8 text-foreground/30" />
                          </div>
                        </motion.div>

                        {/* Title */}
                        <p className="text-lg font-medium text-foreground/80 mb-2">
                          {nh('noNormalizationsYet')}
                        </p>

                        {/* Helpful subtext */}
                        <p className="text-sm text-foreground/45 max-w-sm mx-auto leading-relaxed">
                          {nh('useSearchOrQuickAdd')}
                        </p>
                      </motion.div>
                    )}
                  </>
                )}

                {/* Empty state for financial and bento views */}
                {(viewMode === 'financial' || viewMode === 'bento') &&
                  filteredNormalizations.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="py-20 text-center"
                    >
                      <motion.div
                        className="relative w-24 h-24 mx-auto mb-8"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-sm" />
                        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/8 to-primary/4" />
                        <div className="absolute inset-3 rounded-full bg-background/90 backdrop-blur-sm border border-foreground/[0.08] shadow-sm flex items-center justify-center">
                          <PenLine className="w-8 h-8 text-foreground/30" />
                        </div>
                      </motion.div>
                      <p className="text-lg font-medium text-foreground/80 mb-2">
                        {nh('noNormalizationsYet')}
                      </p>
                      <p className="text-sm text-foreground/45 max-w-sm mx-auto leading-relaxed">
                        {nh('useSearchOrQuickAdd')}
                      </p>
                    </motion.div>
                  )}
              </>
            </div>
          </>
        )}

        {/* Tab 2: Balans & Latenties */}
        {primaryTab === 'balans' && (
          <div
            id="balans-tab-content"
            role="tabpanel"
            aria-label={nh('section2Header')}
            className="flex-1 overflow-y-auto px-6 pt-2 pb-6"
          >
            <TaxLatencySection alwaysExpanded />
          </div>
        )}

        {/* Footer */}
        <ModalFooter className="border-t border-foreground/[0.06] px-6 py-4">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-foreground/50">
              {primaryTab === 'ebitda'
                ? nh('normalizationsCountOf', {
                    filtered: filteredNormalizations.length,
                    total: normalizations.length,
                  }) + (yearFilter ? ` · ${tCommon('filter')}: ${yearFilter}` : '')
                : taxLatencyCount > 0
                  ? `${nh('primaryTabTaxLatencies')} · ${tTax('itemCount', { count: taxLatencyCount })}`
                  : nh('primaryTabTaxLatencies')}
            </p>
            <Button onClick={() => onOpenChange(false)}>{tCommon('close')}</Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// ─────────────────────────────────────────
// COMPACT TABLE ROW COMPONENT
// ─────────────────────────────────────────

interface CompactTableRowProps {
  item: NormalizationItem
  isSelected: boolean
  getLedgerDisplayName: (ledgerCode?: string, ledgerName?: string) => string
  onToggleSelect: () => void
  onAccept: () => void
  onReject: () => void
  onRemove: () => void
  onRestore: () => void
  onEdit: () => void
  hideYear?: boolean
  /** Year-specific EBITDA for recalculating percentage/absolute adjustments */
  yearEbitda?: number
}

function CompactTableRow({
  item,
  isSelected,
  getLedgerDisplayName,
  onToggleSelect,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
  hideYear = false,
  yearEbitda,
}: CompactTableRowProps) {
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
  const ca = useTranslations('chatAssistant')
  const nh = useTranslations('normalizationHub')
  const tCommon = useTranslations('common.actions')
  const sourceBase = sourceConfig[item.source] || sourceConfig.manual
  const isImportedLedger = isImportedLedgerNormalizationItem(item)
  const source = isImportedLedger
    ? {
        labelKey: 'sources.importedLedger' as const,
        color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
      }
    : sourceBase
  const appliedStatusLabel = isImportedLedger ? nh('statusApplied') : nh('statusOk')

  // Recalculate adjustment for percentage/absolute types when year-specific EBITDA is available
  const displayAdjustment = useMemo(() => {
    const stored = Number.isFinite(item.adjustment) ? item.adjustment : 0
    const safeVal = Number.isFinite(item.value) ? item.value : 0
    if (yearEbitda == null) return stored
    // When yearEbitda is 0 or non-finite, recalculation would yield 0/NaN; use stored adjustment
    if (
      (!Number.isFinite(yearEbitda) || yearEbitda === 0) &&
      (item.type === 'add_percent' || item.type === 'subtract_percent' || item.type === 'absolute')
    ) {
      return stored
    }
    if (item.type === 'add_percent') return (yearEbitda * safeVal) / 100
    if (item.type === 'subtract_percent') return -((yearEbitda * safeVal) / 100)
    if (item.type === 'absolute') return safeVal - yearEbitda
    return stored
  }, [item.adjustment, item.type, item.value, yearEbitda])

  // Year display
  const yearDisplay = item.applyAllYears
    ? nh('all')
    : item.applyYears && item.applyYears.length > 0
      ? item.applyYears.length === 1
        ? item.applyYears[0].toString()
        : `${item.applyYears.length} ${nh('yearsShort')}`
      : item.year.toString()

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors group',
        'hover:bg-foreground/[0.02]',
        item.status === 'accepted' && 'bg-success/[0.02]',
        item.status === 'rejected' && 'bg-secondary/[0.02] opacity-60',
        isSelected && 'bg-primary/[0.05] hover:bg-primary/[0.08]'
      )}
    >
      {/* Checkbox */}
      <div className="w-6 flex-shrink-0 pt-0.5">
        <button
          onClick={onToggleSelect}
          className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-foreground/30 group-hover:text-foreground/50" />
          )}
        </button>
      </div>

      {/* Code */}
      <div className="w-16 flex-shrink-0 pt-0.5">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60">
          {item.ledgerCode}
        </span>
      </div>

      {/* Name + Reason — stack so long auto-suggestion copy stays readable */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm text-foreground/80 break-words line-clamp-3">
          {getLedgerDisplayName(item.ledgerCode, item.ledgerName)}
        </span>
        {item.reason ? (
          <span className="text-xs text-foreground/45 break-words line-clamp-4" title={item.reason}>
            {item.reason}
          </span>
        ) : null}
      </div>

      {/* Year - conditionally hidden when grouped by year */}
      {!hideYear && (
        <div className="w-20 flex-shrink-0 text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50 tabular-nums">
            <Calendar className="w-2.5 h-2.5" />
            {yearDisplay}
          </span>
        </div>
      )}

      {/* Source */}
      <div className="w-36 flex-shrink-0 text-center self-center">
        <span
          title={isImportedLedger ? nh('importedLedgerTooltip') : undefined}
          className={cn(
            'inline-flex max-w-full items-center justify-center whitespace-normal text-center leading-tight rounded-full px-2.5 py-1 text-[10px] font-medium',
            source.color
          )}
        >
          {nh(source.labelKey)}
        </span>
      </div>

      {/* Status */}
      <div className="w-32 flex-shrink-0 text-center self-center">
        {item.status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-medium text-warning">
            <Clock className="w-2.5 h-2.5" />
            {nh('statusPending')}
          </span>
        )}
        {item.status === 'accepted' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-medium text-success">
            <Check className="w-2.5 h-2.5" />
            {appliedStatusLabel}
          </span>
        )}
        {item.status === 'rejected' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-medium text-secondary">
            <X className="w-2.5 h-2.5" />
            {nh('no')}
          </span>
        )}
      </div>

      {/* Amount */}
      <div className="w-28 flex-shrink-0 text-right self-center">
        <span
          className={cn(
            'text-sm font-mono font-semibold tabular-nums',
            displayAdjustment > 0
              ? 'text-success'
              : displayAdjustment < 0
                ? 'text-secondary'
                : 'text-foreground/40'
          )}
        >
          {displayAdjustment > 0 ? '+' : ''}
          {formatCurrency(displayAdjustment)}
        </span>
      </div>

      {/* Actions - gap-2 for clearer separation between Edit and Delete (accountant UX) */}
      <div className="w-20 flex-shrink-0 flex items-center justify-end gap-2 self-center md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {item.status === 'pending' && (
          <>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('edit')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onReject}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{ca('reject')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onAccept}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-success hover:bg-success/10 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{ca('accept')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          </>
        )}

        {item.status === 'accepted' && (
          <>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('edit')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            {item.source === 'manual' && (
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onRemove}
                      className="p-1.5 rounded-md text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tCommon('delete')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            )}
          </>
        )}

        {item.status === 'rejected' && (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <button
                  onClick={onRestore}
                  className="p-1.5 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{nh('reassess')}</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

export default UnifiedNormalizationModal
