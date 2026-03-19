'use client'

/**
 * Normalization Editor Modal
 *
 * Full-featured editor for creating and customizing EBITDA normalizations.
 * Features:
 * - Ledger account search (grootboek zoekbalk)
 * - Type selector (+€, -€, +%, -%, ABS)
 * - Year selection checkboxes (this year / all years)
 * - Source badges (Manual/Yuki/Exact Online)
 * - Per-normalization modularity
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Hash,
  Info,
  Minus,
  PenLine,
  Percent,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { Checkbox } from '@/design-system/components/Checkbox'
import { AuroraInput as Input } from '@/design-system/components/Input'
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import { DEFAULT_LEDGER_ACCOUNTS, type LedgerAccount } from '../../constants/grootboek'

// Types for normalization data
export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute'
export type NormalizationSource =
  | 'manual'
  | 'yuki'
  | 'exact'
  | 'odoo'
  | 'octopus'
  | 'accountable'
  | 'csv'
  | 'ai'
  | 'auto'

export type { LedgerAccount } from '../../constants/grootboek'

export interface Normalization {
  id: string
  ledgerCode: string
  ledgerName: string
  type: NormalizationType
  value: number
  calculatedAdjustment?: number
  applyThisYear: boolean
  applyAllYears: boolean
  source: NormalizationSource
  reason?: string
  year?: number
}

export interface NormalizationEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ledgerAccounts?: LedgerAccount[]
  existingNormalizations?: Normalization[]
  onSave: (normalizations: Normalization[]) => void
  currentYear?: number
  hasUploadedData?: boolean
  companyName?: string
}

const defaultLedgerAccounts = DEFAULT_LEDGER_ACCOUNTS

const typeOptions: {
  value: NormalizationType
  label: string
  icon: typeof Plus
  descriptionKey: string
}[] = [
  { value: 'add', label: '+€', icon: Plus, descriptionKey: 'typeAddAmount' },
  { value: 'subtract', label: '-€', icon: Minus, descriptionKey: 'typeSubtractAmount' },
  { value: 'add_percent', label: '+%', icon: Percent, descriptionKey: 'typeAddPercent' },
  { value: 'subtract_percent', label: '-%', icon: Percent, descriptionKey: 'typeSubtractPercent' },
  { value: 'absolute', label: 'ABS', icon: Hash, descriptionKey: 'typeSetTarget' },
]

const sourceOptions: { value: NormalizationSource; labelKey: string; color: string }[] = [
  { value: 'manual', labelKey: 'sources.manual', color: 'bg-foreground/10 text-foreground/70' },
  { value: 'yuki', labelKey: 'sources.yuki', color: 'bg-accent/10 text-accent' },
  { value: 'exact', labelKey: 'sources.exact', color: 'bg-info/10 text-info' },
  { value: 'odoo', labelKey: 'sources.odoo', color: 'bg-purple-500/10 text-purple-600' },
  { value: 'octopus', labelKey: 'sources.octopus', color: 'bg-blue-500/10 text-blue-600' },
  { value: 'accountable', labelKey: 'sources.accountable', color: 'bg-emerald-500/10 text-emerald-600' },
  { value: 'csv', labelKey: 'sources.csv', color: 'bg-warning/10 text-warning' },
  { value: 'ai', labelKey: 'aiSuggestion', color: 'bg-primary/10 text-primary' },
  { value: 'auto', labelKey: 'sources.auto', color: 'bg-success/10 text-success' },
]

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const generateId = () => Math.random().toString(36).substring(2, 11)

export function NormalizationEditor({
  open,
  onOpenChange,
  ledgerAccounts = [],
  existingNormalizations = [],
  onSave,
  currentYear = new Date().getFullYear(),
  hasUploadedData = false,
  companyName,
}: NormalizationEditorProps) {
  const nh = useTranslations('normalizationHub')
  const locale = useLocale() as 'nl' | 'en'
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const formatCurrency = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safe)
  }
  const tCommon = useTranslations('common.actions')
  const tLabels = useTranslations('common.labels')
  const [searchQuery, setSearchQuery] = useState('')
  const [normalizations, setNormalizations] = useState<Normalization[]>(existingNormalizations)
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null)
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false)

  // New normalization form state
  const [newType, setNewType] = useState<NormalizationType>('add')
  const [newValue, setNewValue] = useState('')
  const [newApplyThisYear, setNewApplyThisYear] = useState(true)
  const [newApplyAllYears, setNewApplyAllYears] = useState(false)
  const [newSource, setNewSource] = useState<NormalizationSource>('manual')
  const [newReason, setNewReason] = useState('')

  // Fetch grootboek codes from Titan API (same as UnifiedNormalizationModal)
  const [fetchedLedgers, setFetchedLedgers] = useState<LedgerAccount[]>([])
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
          codes.map((c: { code: string; name: string; category?: string }) => ({
            code: String(c.code ?? ''),
            name: String(c.name ?? ''),
            category: c.category ?? '',
          }))
        )
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [])

  // Available ledger accounts: prop > API fetch > hardcoded fallback
  const availableLedgers = useMemo(() => {
    if (ledgerAccounts.length > 0) return ledgerAccounts
    if (fetchedLedgers.length > 0) return fetchedLedgers
    return defaultLedgerAccounts
  }, [ledgerAccounts, fetchedLedgers])

  // Filter ledger accounts based on search
  const filteredLedgers = useMemo(() => {
    if (!searchQuery) return availableLedgers.slice(0, 10)
    const query = searchQuery.toLowerCase()
    return availableLedgers
      .filter(
        (account) =>
          (account.code && String(account.code).toLowerCase().includes(query)) ||
          (account.name && String(account.name).toLowerCase().includes(query))
      )
      .slice(0, 10)
  }, [searchQuery, availableLedgers])

  /** Parse search query into custom ledger code and name */
  const parseCustomLedgerFromQuery = useCallback((q: string) => {
    const trimmed = q.trim()
    const sep = trimmed.indexOf(' · ')
    if (sep >= 0) {
      const code = trimmed.slice(0, sep).trim()
      const name = trimmed.slice(sep + 3).trim()
      return { code: code || trimmed, name: name || code || trimmed }
    }
    const digitMatch = trimmed.match(/^(\d[\d.]*)/)
    const code = digitMatch ? digitMatch[1] : trimmed
    return { code, name: trimmed }
  }, [])

  // Calculate adjustment based on type and value
  const calculateAdjustment = useCallback(
    (type: NormalizationType, value: number, currentBalance?: number): number => {
      switch (type) {
        case 'add':
          return value
        case 'subtract':
          return -value
        case 'add_percent':
          return currentBalance ? (currentBalance * value) / 100 : 0
        case 'subtract_percent':
          return currentBalance ? -(currentBalance * value) / 100 : 0
        case 'absolute':
          return currentBalance ? value - currentBalance : value
        default:
          return 0
      }
    },
    []
  )

  // Add new normalization
  const handleAddNormalization = () => {
    if (!selectedLedger || !newValue) return

    const numericValue = parseFloat(newValue.replace(/[^0-9.-]/g, ''))
    if (isNaN(numericValue)) return

    const newNormalization: Normalization = {
      id: generateId(),
      ledgerCode: selectedLedger.code,
      ledgerName: selectedLedger.name,
      type: newType,
      value: numericValue,
      calculatedAdjustment: calculateAdjustment(newType, numericValue, selectedLedger.balance),
      applyThisYear: newApplyThisYear,
      applyAllYears: newApplyAllYears,
      source: newSource,
      reason: newReason || undefined,
      year: currentYear,
    }

    setNormalizations([...normalizations, newNormalization])

    // Reset form
    setSelectedLedger(null)
    setNewValue('')
    setNewReason('')
    setSearchQuery('')
  }

  // Remove normalization
  const handleRemoveNormalization = (id: string) => {
    setNormalizations(normalizations.filter((n) => n.id !== id))
  }

  // Save all normalizations
  const handleSave = () => {
    onSave(normalizations)
    onOpenChange(false)
  }

  // Calculate totals
  const totalAdjustment = useMemo(() => {
    return normalizations.reduce((sum, n) => {
      const adj = n.calculatedAdjustment != null ? n.calculatedAdjustment : n.value
      const safe = Number.isFinite(adj) ? adj : 0
      return sum + safe
    }, 0)
  }, [normalizations])

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <ModalTitle className="text-base">{nh('ebitdaNormalizations')}</ModalTitle>
              <p className="text-xs text-foreground/50 mt-0.5">
                {companyName || nh('businessEstimate')} · {currentYear}
              </p>
            </div>
          </div>
        </ModalHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Search & Add Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/60 uppercase tracking-wider">
              <Plus className="w-3.5 h-3.5" />
              {nh('addNormalization')}
            </div>

            {/* Ledger Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <Input
                  placeholder={nh('searchLedgerPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowLedgerDropdown(true)
                  }}
                  onFocus={() => setShowLedgerDropdown(true)}
                  className="pl-10 text-base"
                />
                {selectedLedger && (
                  <button
                    onClick={() => {
                      setSelectedLedger(null)
                      setSearchQuery('')
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-foreground/10"
                  >
                    <X className="w-3.5 h-3.5 text-foreground/40" />
                  </button>
                )}
              </div>

              {/* Ledger Dropdown */}
              <AnimatePresence>
                {showLedgerDropdown && !selectedLedger && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute z-50 w-full mt-1 py-1 bg-background border border-foreground/10 rounded-lg shadow-lg max-h-64 overflow-y-auto"
                  >
                    {filteredLedgers.length === 0 && !searchQuery.trim() ? (
                      <div className="px-4 py-3 text-sm text-foreground/50 text-center">
                        {hasUploadedData ? nh('noAccountsFound') : nh('uploadToSearchLedger')}
                      </div>
                    ) : (
                      <>
                      {filteredLedgers.map((account) => (
                        <button
                          key={account.code}
                          onClick={() => {
                            setSelectedLedger(account)
                            setSearchQuery(`${account.code} · ${account.name}`)
                            setShowLedgerDropdown(false)
                          }}
                          className="w-full px-4 py-2.5 text-left hover:bg-foreground/[0.04] flex items-center justify-between group transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-foreground/[0.06] text-foreground/60 group-hover:bg-primary/10 group-hover:text-primary">
                              {account.code}
                            </span>
                            <span className="text-sm text-foreground/80">{account.name}</span>
                          </div>
                          {account.balance !== undefined && (
                            <span className="text-xs font-mono text-foreground/40">
                              {formatCurrency(account.balance)}
                            </span>
                          )}
                        </button>
                      ))}
                      {searchQuery.trim() && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            const { code, name } = parseCustomLedgerFromQuery(searchQuery)
                            setSelectedLedger({ code, name })
                            setSearchQuery(`${code} · ${name}`)
                            setShowLedgerDropdown(false)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              const { code, name } = parseCustomLedgerFromQuery(searchQuery)
                              setSelectedLedger({ code, name })
                              setSearchQuery(`${code} · ${name}`)
                              setShowLedgerDropdown(false)
                            }
                          }}
                          className={cn(
                            'w-full px-4 py-2.5 text-left hover:bg-primary/5 flex items-center justify-between gap-3 transition-colors cursor-pointer',
                            filteredLedgers.length > 0 && 'border-t border-foreground/[0.06]'
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">+</span>
                            <span className="text-sm text-foreground/80 truncate">{nh('useCustomCode', { query: searchQuery.trim() })}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const { code, name } = parseCustomLedgerFromQuery(searchQuery)
                              setSelectedLedger({ code, name })
                              setSearchQuery(`${code} · ${name}`)
                              setShowLedgerDropdown(false)
                            }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                          >
                            {nh('actions.add')}
                          </button>
                        </div>
                      )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Selected Ledger Form */}
            <AnimatePresence>
              {selectedLedger && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.08]"
                >
                  {/* Type Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      {nh('typeAdjustment')}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {typeOptions.map((option) => (
                        <TooltipProvider key={option.value}>
                          <TooltipRoot>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setNewType(option.value)}
                                className={cn(
                                  'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                                  newType === option.value
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]'
                                )}
                              >
                                <option.icon className="w-3.5 h-3.5" />
                                {option.label}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{nh(option.descriptionKey)}</p>
                            </TooltipContent>
                          </TooltipRoot>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>

                  {/* Value Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      {newType.includes('percent')
                        ? 'Percentage'
                        : newType === 'absolute'
                          ? 'Doelwaarde'
                          : 'Bedrag'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">
                        {newType.includes('percent') ? '%' : '€'}
                      </span>
                      <Input
                        type="text"
                        placeholder={newType.includes('percent') ? '10' : '60.000'}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        className="pl-8 font-mono text-base"
                      />
                    </div>
                  </div>

                  {/* Year Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">Toepassen op</label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={newApplyThisYear}
                          onChange={(checked) => setNewApplyThisYear(checked)}
                        />
                        <span className="text-sm text-foreground/70 group-hover:text-foreground flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Dit jaar ({currentYear})
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={newApplyAllYears}
                          onChange={(checked) => setNewApplyAllYears(checked)}
                        />
                        <span className="text-sm text-foreground/70 group-hover:text-foreground flex items-center gap-1.5">
                          <CalendarRange className="w-3.5 h-3.5" />
                          Alle jaren
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Source Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">{nh('source')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {sourceOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setNewSource(option.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                            newSource === option.value
                              ? cn(
                                  option.color,
                                  'ring-2 ring-offset-2 ring-offset-background ring-primary/20'
                                )
                              : 'bg-foreground/[0.04] text-foreground/50 hover:bg-foreground/[0.08]'
                          )}
                        >
                          {nh(option.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reason (Optional) */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      {nh('explanation')}{' '}
                      <span className="text-foreground/30">({tLabels('optional')})</span>
                    </label>
                    <Input
                      placeholder={nh('reasonPlaceholder')}
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      className="text-base"
                    />
                  </div>

                  {/* Add Button */}
                  <Button
                    onClick={handleAddNormalization}
                    disabled={!newValue}
                    className="w-full gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {nh('addNormalization')}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Existing Normalizations List */}
          {normalizations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/60 uppercase tracking-wider">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  {nh('addedNormalizations', { count: normalizations.length })}
                </div>
                <div className={cn(
                  'text-sm font-mono font-semibold',
                  totalAdjustment > 0 ? 'text-success' : totalAdjustment < 0 ? 'text-secondary' : 'text-foreground/40'
                )}>
                  {totalAdjustment > 0 ? '+' : ''}
                  {formatCurrency(totalAdjustment)}
                </div>
              </div>

              <div className="space-y-2">
                {normalizations.map((normalization) => {
                  const sourceOption = sourceOptions.find((s) => s.value === normalization.source)
                  const typeOption = typeOptions.find((t) => t.value === normalization.type)

                  return (
                    <motion.div
                      key={normalization.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60">
                              {normalization.ledgerCode}
                            </span>
                            <span className="text-sm font-medium text-foreground/80 truncate">
                              {normalization.ledgerName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {/* Type Badge */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                              {typeOption?.label}
                              <span className="font-mono">
                                {normalization.type.includes('percent')
                                  ? `${normalization.value}%`
                                  : formatCurrency(normalization.value)}
                              </span>
                            </span>
                            {/* Source Badge */}
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-medium',
                                sourceOption?.color
                              )}
                            >
                              {sourceOption ? nh(sourceOption.labelKey) : ''}
                            </span>
                            {/* Year Badge */}
                            {normalization.applyAllYears ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                                <CalendarRange className="w-2.5 h-2.5" />
                                {nh('allYears')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                                <Calendar className="w-2.5 h-2.5" />
                                {normalization.year || currentYear}
                              </span>
                            )}
                          </div>
                          {normalization.reason && (
                            <p className="text-xs text-foreground/50 mt-1.5 truncate">
                              {normalization.reason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const itemAdj = normalization.calculatedAdjustment != null
                              ? normalization.calculatedAdjustment
                              : normalization.value
                            const safeItemAdj = Number.isFinite(itemAdj) ? itemAdj : 0
                            return (
                              <span
                                className={cn(
                                  'text-sm font-mono font-semibold',
                                  safeItemAdj > 0
                                    ? 'text-success'
                                    : safeItemAdj < 0
                                      ? 'text-secondary'
                                      : 'text-foreground/40'
                                )}
                              >
                                {safeItemAdj > 0 ? '+' : ''}
                                {formatCurrency(safeItemAdj)}
                              </span>
                            )
                          })()}
                          <button
                            onClick={() => handleRemoveNormalization(normalization.id)}
                            className="p-1.5 rounded-lg text-foreground/30 hover:text-secondary hover:bg-secondary/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {normalizations.length === 0 && !selectedLedger && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-foreground/[0.04] flex items-center justify-center mx-auto mb-3">
                <PenLine className="w-5 h-5 text-foreground/30" />
              </div>
              <p className="text-sm text-foreground/50 mb-1">{nh('noNormalizationsAdded')}</p>
              <p className="text-xs text-foreground/40">
                {hasUploadedData ? nh('searchLedgerEmpty') : nh('uploadOrAddManual')}
              </p>
            </div>
          )}
        </div>

        <ModalFooter className="border-t border-foreground/[0.06]">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm">
              {normalizations.length > 0 && (
                <span className="text-foreground/50">
                  {nh('totalImpact')}:{' '}
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      totalAdjustment > 0 ? 'text-success' : totalAdjustment < 0 ? 'text-secondary' : 'text-foreground/40'
                    )}
                  >
                    {totalAdjustment > 0 ? '+' : ''}
                    {formatCurrency(totalAdjustment)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {tCommon('cancel')}
              </Button>
              <Button onClick={handleSave} className="gap-1.5">
                <Check className="w-4 h-4" />
                {tCommon('save')} ({normalizations.length})
              </Button>
            </div>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default NormalizationEditor
