'use client'

import type { VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { Building2, Check, ChevronDown, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { looksLikeNaceCode, naceBusinessTypeService } from '@/services/naceBusinessTypeService'
import { cn, safeString } from '../../utils'
import { categoryEmojis, defaultBusinessTypes } from './BusinessTypeData'
import type { BusinessType } from './EntitySearchTypes'
import {
  dropdownVariants,
  floatingLabelVariants,
  searchContainerVariants,
  searchFieldVariants,
  searchGroupVariants,
} from './EntitySearchVariants'

/** Humanize slug for display when types not yet loaded (e.g. "restaurant" -> "Restaurant") */
function humanizeBusinessTypeSlug(slug: string): string {
  if (!slug?.trim()) return ''
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface BusinessTypeSearchInputProps extends VariantProps<typeof searchFieldVariants> {
  /** Floating label text */
  label?: string
  /** Current value (business type ID) */
  value: string
  /** Change handler */
  onChange: (value: string, businessType?: BusinessType) => void
  /** Container className */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Custom business types list */
  types?: BusinessType[]
  /** NACE-matched type ID to show first when dropdown opens (from KBO) */
  naceMatchedTypeId?: string
  /** Loading state (e.g. types API not yet loaded) - shows subtle pulse when value exists */
  loading?: boolean
  /** Error when loading types failed - shows retry UI in dropdown */
  loadError?: string | null
  /** Callback to retry loading types */
  onRetryLoad?: () => void
  /** Country code for NACE lookups and normalized activity code presentation */
  countryCode?: string
}

function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function fuzzySearchBusinessTypes(
  query: string,
  types: BusinessType[],
  prioritizedId?: string
): { types: BusinessType[]; isDidYouMean: boolean } {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    const sorted = [...types].sort((a, b) => {
      if (prioritizedId) {
        if (a.id === prioritizedId) return -1
        if (b.id === prioritizedId) return 1
      }
      return (b.popular ? 1 : 0) - (a.popular ? 1 : 0)
    })
    return { types: sorted.slice(0, 15), isDidYouMean: false }
  }

  const lower = trimmedQuery.toLowerCase()
  const norm = normalizeForSearch(trimmedQuery)
  const words = lower.split(/\s+/).filter((w) => w.length > 1)

  const scored = types.map((t) => {
    const nameLower = t.name.toLowerCase()
    const nameNorm = normalizeForSearch(t.name)
    const codeLower = t.code.toLowerCase()
    const descLower = (t.description || '').toLowerCase()
    const descNorm = normalizeForSearch(t.description || '')
    const cat =
      typeof t.category === 'string'
        ? t.category
        : ((t.category as Record<string, unknown>)?.name ??
          (t.category as Record<string, unknown>)?.title ??
          '')
    const catLower = String(cat).toLowerCase()
    const catNorm = normalizeForSearch(String(cat))

    let score = 0
    if (nameLower.startsWith(lower) || nameNorm.startsWith(norm)) score += 100
    if (nameLower.includes(lower) || nameNorm.includes(norm)) score += 50
    if (codeLower.includes(lower)) score += 40
    if (catLower.includes(lower) || catNorm.includes(norm)) score += 30
    if (descLower.includes(lower) || descNorm.includes(norm)) score += 20

    words.forEach((word) => {
      const wordNorm = normalizeForSearch(word)
      if (nameLower.includes(word) || nameNorm.includes(wordNorm)) score += 25
      if (descLower.includes(word) || descNorm.includes(wordNorm)) score += 15
    })

    if (lower.length >= 3) {
      const partialMatch = nameLower.slice(0, lower.length)
      if (partialMatch.startsWith(lower.slice(0, -1))) score += 35
      const partialNorm = nameNorm.slice(0, norm.length)
      if (partialNorm.startsWith(norm.slice(0, -1))) score += 35
    }

    return { type: t, score }
  })

  const filtered = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.type)
  const hasExactStart = types.some(
    (t) => t.name.toLowerCase().startsWith(lower) || normalizeForSearch(t.name).startsWith(norm)
  )

  return {
    types: filtered,
    isDidYouMean: !hasExactStart && filtered.length > 0 && lower.length >= 3,
  }
}

export const BusinessTypeSearchInput = React.forwardRef<
  HTMLInputElement,
  BusinessTypeSearchInputProps
>(
  (
    {
      label,
      value,
      onChange,
      size = 'md',
      className,
      disabled,
      types = defaultBusinessTypes,
      naceMatchedTypeId,
      loading = false,
      loadError = null,
      onRetryLoad,
      countryCode = 'BE',
    },
    ref
  ) => {
    const t = useTranslations('forms.fields')
    const tInt = useTranslations('integrationStep')
    const tCommon = useTranslations('common.states')
    const displayLabel = label ?? t('businessType')
    const effectiveCountryCode = (countryCode ?? 'BE').trim().toUpperCase().slice(0, 2)
    const [isFocused, setIsFocused] = React.useState(false)
    const [isOpen, setIsOpen] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [focusedIndex, setFocusedIndex] = React.useState(-1)
    const [dropdownRect, setDropdownRect] = React.useState<{
      top: number
      left: number
      width: number
    } | null>(null)
    const [naceSearchResult, setNaceSearchResult] = React.useState<BusinessType | null>(null)
    const [isLoadingNaceSearch, setIsLoadingNaceSearch] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const dropdownRef = React.useRef<HTMLDivElement>(null)

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const selectedType = React.useMemo(() => types.find((t) => t.id === value), [value, types])

    const displayFallback = React.useMemo(() => {
      if (selectedType || !value?.trim()) return null
      if (looksLikeNaceCode(value)) return null
      return humanizeBusinessTypeSlug(value.trim())
    }, [selectedType, value])

    const { types: filteredTypes, isDidYouMean } = React.useMemo(
      () => fuzzySearchBusinessTypes(search, types, naceMatchedTypeId),
      [search, types, naceMatchedTypeId]
    )
    const combinedFilteredTypes = React.useMemo(() => {
      if (!naceSearchResult) return filteredTypes
      return [naceSearchResult, ...filteredTypes.filter((type) => type.id !== naceSearchResult.id)]
    }, [filteredTypes, naceSearchResult])

    // Update dropdown position when open (for Portal)
    React.useLayoutEffect(() => {
      if (isOpen && containerRef.current) {
        const updateRect = () => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setDropdownRect({ top: rect.bottom + 8, left: rect.left, width: rect.width })
          }
        }
        updateRect()
        window.addEventListener('scroll', updateRect, true)
        window.addEventListener('resize', updateRect)
        return () => {
          window.removeEventListener('scroll', updateRect, true)
          window.removeEventListener('resize', updateRect)
        }
      } else {
        setDropdownRect(null)
      }
    }, [isOpen])

    // Close on outside click (Portal: check both container and dropdown)
    React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        const target = e.target as Node
        const inContainer = containerRef.current?.contains(target)
        const inDropdown = dropdownRef.current?.contains(target)
        if (!inContainer && !inDropdown) {
          setIsOpen(false)
          setSearch('')
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Focus input when opening
    React.useEffect(() => {
      if (isOpen && inputRef.current) {
        inputRef.current.focus()
      }
    }, [isOpen])

    React.useEffect(() => {
      const trimmedSearch = search.trim()
      if (!isOpen || !looksLikeNaceCode(trimmedSearch)) {
        setNaceSearchResult(null)
        setIsLoadingNaceSearch(false)
        return
      }

      const controller = new AbortController()
      setIsLoadingNaceSearch(true)

      naceBusinessTypeService
        .getBusinessTypeForNaceCode(trimmedSearch, controller.signal, effectiveCountryCode)
        .then((result) => {
          if (!controller.signal.aborted) {
            setNaceSearchResult(result)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setNaceSearchResult(null)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoadingNaceSearch(false)
          }
        })

      return () => controller.abort()
    }, [isOpen, search, effectiveCountryCode])

    const handleSelect = (type: BusinessType) => {
      onChange(type.id, type)
      setIsOpen(false)
      setSearch('')
      setFocusedIndex(-1)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setSearch('')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((prev) => Math.min(prev + 1, combinedFilteredTypes.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && focusedIndex >= 0 && combinedFilteredTypes[focusedIndex]) {
        e.preventDefault()
        handleSelect(combinedFilteredTypes[focusedIndex])
      }
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange('')
      setSearch('')
    }

    const hasValue = Boolean(selectedType) || Boolean(displayFallback)
    const isFloated = isFocused || hasValue || isOpen
    const state = disabled ? 'disabled' : isFocused || isOpen ? 'focus' : 'default'

    const Icon = selectedType?.icon || Building2

    return (
      <div ref={containerRef} className={cn(searchContainerVariants({ size }), className)}>
        <div
          className={cn(searchGroupVariants({ state, size }), 'cursor-pointer')}
          onClick={() => !disabled && setIsOpen(true)}
        >
          {/* Emoji or Icon */}
          <div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center',
              'w-8 h-8 rounded-lg',
              selectedType
                ? 'bg-primary/10'
                : isFocused || isOpen
                  ? 'bg-primary/5'
                  : 'bg-foreground/[0.04]'
            )}
          >
            {selectedType ? (
              <span className="text-lg" role="img" aria-label={selectedType.category}>
                {selectedType.emoji || categoryEmojis[selectedType.category] || '\u{1F3E2}'}
              </span>
            ) : (
              <Icon
                className={cn(
                  'w-4 h-4',
                  isFocused || isOpen ? 'text-primary' : 'text-foreground/50'
                )}
              />
            )}
          </div>

          {/* Display Value */}
          {!isOpen && (
            <div
              className={cn(
                searchFieldVariants({ size }),
                'flex items-center pointer-events-none',
                loading && displayFallback && 'animate-pulse'
              )}
            >
              {selectedType ? (
                <span className="truncate">{safeString(selectedType.name)}</span>
              ) : displayFallback ? (
                <span
                  className={cn('truncate', loading ? 'text-foreground/60' : 'text-foreground')}
                >
                  {displayFallback}
                </span>
              ) : (
                <span className="text-foreground/40"> </span>
              )}
            </div>
          )}

          {/* Search Input (visible when open) */}
          {isOpen && (
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder=" "
              className={cn(searchFieldVariants({ size }))}
            />
          )}

          {/* Floating Label */}
          <label className={cn(floatingLabelVariants({ state, floated: isFloated, size }))}>
            {displayLabel}
          </label>

          {/* Right Side */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
            {selectedType && (
              <>
                <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                  {selectedType.code}
                </span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
            {displayFallback && !selectedType && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                aria-label="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <ChevronDown
              className={cn(
                'w-4 h-4 text-foreground/40 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </div>

        {/* Dropdown - Portal to escape overflow (Clarity parity) */}
        {typeof document !== 'undefined' &&
          isOpen &&
          dropdownRect &&
          createPortal(
            <motion.div
              ref={dropdownRef}
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onMouseDown={(e) => e.preventDefault()}
              role="listbox"
              aria-label={displayLabel}
              aria-activedescendant={
                focusedIndex >= 0 && combinedFilteredTypes[focusedIndex]
                  ? `biztype-option-${combinedFilteredTypes[focusedIndex].id}`
                  : undefined
              }
              className={cn(
                'fixed z-[9999]',
                'bg-background border border-foreground/[0.10] rounded-xl shadow-xl',
                'overflow-hidden max-h-80 overflow-y-auto'
              )}
              style={{
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
              }}
            >
              {isDidYouMean && (
                <div className="px-3 py-2 border-b border-foreground/[0.06] bg-foreground/[0.02]">
                  <span className="text-xs font-medium text-foreground/50">
                    {tInt('didYouMean')}
                  </span>
                </div>
              )}

              {loadError && combinedFilteredTypes.length === 0 ? (
                <div className="px-4 py-4 text-sm">
                  <p className="text-destructive/80 mb-1">{tCommon('loadFailed')}</p>
                  <p className="text-foreground/40 text-xs mb-3">{loadError}</p>
                  {onRetryLoad && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRetryLoad()
                      }}
                      className="text-xs font-medium text-primary hover:text-primary/80"
                    >
                      {tInt('tryAgain')}
                    </button>
                  )}
                </div>
              ) : combinedFilteredTypes.length === 0 && !isLoadingNaceSearch ? (
                <div className="px-4 py-8 text-center text-sm text-foreground/50">
                  {tInt('noBusinessTypesFound')}
                </div>
              ) : (
                combinedFilteredTypes.slice(0, 10).map((type, index) => (
                  <button
                    key={type.id}
                    id={`biztype-option-${type.id}`}
                    type="button"
                    ref={
                      index === focusedIndex
                        ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
                        : undefined
                    }
                    onClick={() => handleSelect(type)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      'hover:bg-foreground/[0.04]',
                      focusedIndex === index && 'bg-foreground/[0.06]',
                      index !== Math.min(combinedFilteredTypes.length, 10) - 1 &&
                        'border-b border-foreground/[0.04]'
                    )}
                    role="option"
                    aria-selected={focusedIndex === index}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-base" role="img" aria-label={type.category}>
                        {type.emoji || categoryEmojis[type.category] || '\u{1F3E2}'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {safeString(type.name)}
                        </span>
                        <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded shrink-0">
                          {safeString(type.code)}
                        </span>
                      </div>
                      {safeString(type.description) && (
                        <p className="text-[11px] text-foreground/40 truncate">
                          {safeString(type.description)}
                        </p>
                      )}
                    </div>
                    {value === type.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))
              )}
              {isLoadingNaceSearch && combinedFilteredTypes.length === 0 && (
                <div className="px-4 py-3 text-xs text-foreground/50 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{tCommon('loading')}</span>
                </div>
              )}
            </motion.div>,
            document.body
          )}
      </div>
    )
  }
)
BusinessTypeSearchInput.displayName = 'BusinessTypeSearchInput'
