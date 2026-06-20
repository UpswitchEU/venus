'use client'

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trackNormalizationAdd } from '@/lib/analytics'
import { scrollElementIntoContainer } from '@/utils/scrollContainer'
import type { LedgerAccount } from '../../constants/grootboek'
import {
  calculateNormalizationAdjustment,
  getNormalizationAdjustmentGuard,
  parseNormalizationInputValue,
  parseNormalizationPromptAmount,
} from './UnifiedNormalizationEditorModel'
import {
  generateId,
  inferCategoryFromCode,
  parseCustomLedgerFromQuery,
} from './UnifiedNormalizationHelpers'
import type {
  NormalizationItem,
  NormalizationPresetOption,
  NormalizationType,
  SearchableLedgerAccount,
} from './UnifiedNormalizationTypes'
import { useUnifiedNormalizationLedgerOptions } from './useUnifiedNormalizationLedgerOptions'

type Translate = (key: string, values?: Record<string, string | number>) => string

interface UseUnifiedNormalizationDraftEditorParams {
  open: boolean
  currentYear: number
  initialSearchQuery: string
  initialYearFilter: number | null
  availableYears: number[]
  ledgerAccounts: LedgerAccount[]
  countryCode?: string | null
  normalizations: NormalizationItem[]
  onNormalizationsChange: (normalizations: NormalizationItem[]) => void
  onUploadClick?: () => void
  safeOriginalEBITDA: number
  translate: Translate
}

export function useUnifiedNormalizationDraftEditor({
  open,
  currentYear,
  initialSearchQuery,
  initialYearFilter,
  availableYears,
  ledgerAccounts,
  countryCode,
  normalizations,
  onNormalizationsChange,
  onUploadClick,
  safeOriginalEBITDA,
  translate,
}: UseUnifiedNormalizationDraftEditorParams) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null)
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false)
  const [dropdownSource, setDropdownSource] = useState<'search' | 'ledger'>('search')
  const [newType, setNewType] = useState<NormalizationType>('add')
  const [newValue, setNewValue] = useState('')
  const [newSelectedYears, setNewSelectedYears] = useState<number[]>([currentYear])
  const [newReason, setNewReason] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isEditorExpanded, setIsEditorExpanded] = useState(
    () => initialSearchQuery.trim().length > 0
  )
  const [yearFilter, setYearFilter] = useState<number | null>(initialYearFilter)
  const [dropdownAnchorRect, setDropdownAnchorRect] = useState<DOMRect | null>(null)

  const addFormRef = useRef<HTMLDivElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const ledgerButtonRef = useRef<HTMLButtonElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { availableLedgers, normalizationPresets, filteredLedgers, getLedgerDisplayName } =
    useUnifiedNormalizationLedgerOptions({
      ledgerAccounts,
      countryCode,
      searchQuery,
    })

  useEffect(() => {
    if (open) {
      setSearchQuery(initialSearchQuery)
      setYearFilter(initialYearFilter)
      setShowLedgerDropdown(false)
      setDropdownAnchorRect(null)
      setIsEditorExpanded(initialSearchQuery.trim().length > 0)
      return
    }

    setShowAddForm(false)
    setSearchQuery(initialSearchQuery)
    setSelectedLedger(null)
    setShowLedgerDropdown(false)
    setDropdownAnchorRect(null)
    setEditingId(null)
    setYearFilter(null)
    setNewSelectedYears([currentYear])
    setNewValue('')
    setNewType('add')
    setNewReason('')
    setIsEditorExpanded(false)
  }, [open, currentYear, initialSearchQuery, initialYearFilter])

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

  useEffect(() => {
    if (!showLedgerDropdown) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setShowLedgerDropdown(false)
        setDropdownSource('search')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showLedgerDropdown])

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

  useEffect(() => {
    if (showAddForm || editingId || initialSearchQuery.trim().length > 0) {
      setIsEditorExpanded(true)
    }
  }, [editingId, initialSearchQuery, showAddForm])

  const resetDraft = useCallback(() => {
    setSelectedLedger(null)
    setNewValue('')
    setNewReason('')
    setSearchQuery('')
    setNewSelectedYears([currentYear])
    setShowAddForm(false)
  }, [currentYear])

  const startEditing = useCallback(
    (item: NormalizationItem) => {
      setEditingId(item.id)
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
      setIsEditorExpanded(true)
      setShowAddForm(true)
      setShowLedgerDropdown(false)
    },
    [availableYears, getLedgerDisplayName]
  )

  const cancelEditing = useCallback(() => {
    setEditingId(null)
    resetDraft()
    setNewType('add')
  }, [resetDraft])

  const addNormalization = useCallback(() => {
    if (!selectedLedger || !newValue) return
    const code = String(selectedLedger.code ?? '').trim()
    const name = String(selectedLedger.name ?? '').trim()
    if (!code) return

    const numericValue = parseNormalizationInputValue(newValue)
    if (numericValue == null) return

    const safeEbitda = Number.isFinite(safeOriginalEBITDA) ? safeOriginalEBITDA : 0
    const adjustment = calculateNormalizationAdjustment({
      type: newType,
      numericValue,
      safeEbitda,
    })

    const adjustmentGuard = getNormalizationAdjustmentGuard({ adjustment, safeEbitda })
    if (adjustmentGuard?.kind === 'blocked') {
      import('sonner').then(({ toast }) =>
        toast.error(translate('blockedToast'), {
          description: translate('blockedToastDesc', { pct: adjustmentGuard.pct }),
        })
      )
      return
    }

    if (adjustmentGuard?.kind === 'warning') {
      import('sonner').then(({ toast }) =>
        toast.warning(translate('warnToastTitle'), {
          description: translate('warnToastDesc', { pct: adjustmentGuard.pct }),
        })
      )
    }

    if (editingId) {
      onNormalizationsChange(
        normalizations.map((normalization) =>
          normalization.id === editingId
            ? {
                ...normalization,
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
            : normalization
        )
      )
      setEditingId(null)
    } else {
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

    resetDraft()
  }, [
    selectedLedger,
    newValue,
    safeOriginalEBITDA,
    newType,
    editingId,
    newReason,
    newSelectedYears,
    availableYears.length,
    currentYear,
    resetDraft,
    normalizations,
    onNormalizationsChange,
    translate,
  ])

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file && onUploadClick) onUploadClick()
    },
    [onUploadClick]
  )

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

  const handlePromptSubmit = useCallback(
    (value: string) => {
      setIsEditorExpanded(true)
      setEditingId(null)

      const codeMatch = value.match(/\b(\d{3})\b/)
      if (codeMatch) {
        const code = codeMatch[1]
        const matchingLedger = availableLedgers.find((ledger) => ledger.code === code)
        if (matchingLedger) {
          setSelectedLedger(matchingLedger)
          setShowAddForm(true)

          const amount = parseNormalizationPromptAmount(value, { ledgerCode: code })
          if (amount) setNewValue(amount)
          return
        }
      }

      const lowerValue = value.toLowerCase()
      const matchingPreset = normalizationPresets.find(
        (preset) =>
          lowerValue.includes(preset.label.toLowerCase()) ||
          lowerValue.includes(preset.ledgerName.toLowerCase())
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

      setSearchQuery(value)
      setShowLedgerDropdown(true)
    },
    [availableLedgers, normalizationPresets]
  )

  return {
    addFormRef,
    inputContainerRef,
    searchInputRef,
    ledgerButtonRef,
    listContainerRef,
    fileInputRef,
    availableLedgers,
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
  }
}
