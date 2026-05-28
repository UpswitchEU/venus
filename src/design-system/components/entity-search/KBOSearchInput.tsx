'use client'

import type { VariantProps } from 'class-variance-authority'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Check, Loader2, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { scrollElementIntoContainer } from '@/utils/scrollContainer'
import { REGISTRY_SEARCH_CLIENT_TIMEOUT_MS } from '@/services/registry/types'
import { getFinancialTerm } from '@/utils/locale/financial-terms'
import { cn, safeString } from '../../utils'
import type { KBOCompany } from './EntitySearchTypes'
import {
  dropdownVariants,
  floatingLabelVariants,
  searchContainerVariants,
  searchFieldVariants,
  searchGroupVariants,
} from './EntitySearchVariants'

export interface KBOSearchInputProps extends VariantProps<typeof searchFieldVariants> {
  /** Floating label text */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** Current search value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Company selection handler */
  onCompanySelect: (company: KBOCompany) => void
  /** Currently selected company */
  selectedCompany: KBOCompany | null
  /** Clear selection handler */
  onClear: () => void
  /** Custom search function (signal for request cancellation on rapid typing) */
  searchFn?: (query: string, signal?: AbortSignal) => Promise<KBOCompany[]> | KBOCompany[]
  /** Minimum query length to trigger search */
  minQueryLength?: number
  /** Debounce delay in ms */
  debounceMs?: number
  /** Container className */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Country code for registry-aware labels and external search links */
  countryCode?: string
  /** Optional helper below the field (e.g. NL manual-entry when registry API is off) */
  description?: string
  /** Optional empty-state message (overrides default noResultsHint) */
  noResultsHint?: string
}

function defaultKBOSearch(_query: string, _signal?: AbortSignal): KBOCompany[] {
  return []
}

const REQUEST_TIMEOUT_MS = REGISTRY_SEARCH_CLIENT_TIMEOUT_MS

export const KBOSearchInput = React.forwardRef<HTMLInputElement, KBOSearchInputProps>(
  (
    {
      label,
      placeholder,
      value,
      onChange,
      onCompanySelect,
      selectedCompany,
      onClear,
      searchFn = defaultKBOSearch,
      minQueryLength = 2,
      debounceMs = 400,
      size = 'md',
      className,
      disabled,
      countryCode = 'BE',
      description,
      noResultsHint: noResultsHintOverride,
    },
    ref
  ) => {
    const t = useTranslations('integrationStep')
    const effectiveCountryCode = (countryCode ?? 'BE').trim().toUpperCase().slice(0, 2)
    const registrySearchUrl =
      effectiveCountryCode === 'NL'
        ? `https://www.kvk.nl/zoeken/?source=all&q=${encodeURIComponent(value.trim())}`
        : `https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?zoekwoord=${encodeURIComponent(value.trim())}`
    const inputId = React.useId()
    const displayLabel = label ?? t('companyNameOrKbo')
    const _displayPlaceholder = placeholder ?? t('searchPlaceholder')
    const [isFocused, setIsFocused] = React.useState(false)
    const [isSearching, setIsSearching] = React.useState(false)
    const [results, setResults] = React.useState<KBOCompany[]>([])
    const [searchError, setSearchError] = React.useState<string | null>(null)
    const [showDropdown, setShowDropdown] = React.useState(false)
    const [focusedIndex, setFocusedIndex] = React.useState(-1)
    const [dropdownRect, setDropdownRect] = React.useState<{
      top: number
      left: number
      width: number
    } | null>(null)
    const getActivityCodeShort = React.useCallback(
      (code?: string) =>
        getFinancialTerm('activityCode', code ?? countryCode)
          .replace(/-code$/i, '')
          .trim(),
      [countryCode]
    )
    const inputRef = React.useRef<HTMLInputElement>(null)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const dropdownRef = React.useRef<HTMLDivElement>(null)
    const abortControllerRef = React.useRef<AbortController | null>(null)
    const timedOutRef = React.useRef(false)
    const tRef = React.useRef(t)

    React.useEffect(() => {
      tRef.current = t
    }, [t])

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const trimmedValue = value.trim()
    const trimmedValueLength = trimmedValue.length
    const canSearch = !selectedCompany && trimmedValueLength >= minQueryLength
    const shouldShowDropdown =
      !disabled && !selectedCompany && isFocused && trimmedValueLength >= minQueryLength

    // Update dropdown position when open (for Portal)
    React.useLayoutEffect(() => {
      if (shouldShowDropdown && canSearch && containerRef.current) {
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
    }, [shouldShowDropdown, canSearch])

    const runSearch = React.useCallback(
      async (query: string) => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        const controller = new AbortController()
        abortControllerRef.current = controller
        timedOutRef.current = false

        const timeoutId = setTimeout(() => {
          timedOutRef.current = true
          controller.abort()
        }, REQUEST_TIMEOUT_MS)

        try {
          const found = await searchFn(query, controller.signal)
          clearTimeout(timeoutId)
          if (!controller.signal.aborted) {
            setResults(found)
            setShowDropdown(true)
            setSearchError(null)
          }
        } catch (err) {
          clearTimeout(timeoutId)
          if (err instanceof DOMException && err.name === 'AbortError' && !timedOutRef.current)
            return
          if (controller.signal.aborted && !timedOutRef.current) return

          setResults([])
          setSearchError(
            timedOutRef.current
              ? tRef.current('searchUnavailable')
              : err instanceof Error && err.message
                ? err.message
                : tRef.current('searchUnavailable')
          )
          setShowDropdown(true)
        } finally {
          setIsSearching(false)
        }
      },
      [searchFn]
    )

    // Debounced search with request cancellation; align with BFF/Titan budget
    React.useEffect(() => {
      if (selectedCompany) {
        setResults([])
        setShowDropdown(false)
        setSearchError(null)
        return
      }

      if (trimmedValueLength < minQueryLength) {
        setResults([])
        setSearchError(null)
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      setSearchError(null)
      setShowDropdown(true)

      const timeout = setTimeout(async () => {
        await runSearch(trimmedValue)
      }, debounceMs)

      return () => {
        clearTimeout(timeout)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
      }
    }, [trimmedValue, trimmedValueLength, selectedCompany, minQueryLength, debounceMs, runSearch])
    // Close on outside click (Portal: check both container and dropdown)
    React.useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        const target = e.target as Node
        const inContainer = containerRef.current?.contains(target)
        const inDropdown = dropdownRef.current?.contains(target)
        if (!inContainer && !inDropdown) {
          setShowDropdown(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    React.useEffect(() => {
      if (focusedIndex < 0 || !dropdownRef.current) return
      const company = results[focusedIndex]
      if (!company) return
      const focusedEl = dropdownRef.current.querySelector(`#kbo-option-${company.id}`)
      if (focusedEl instanceof HTMLElement) {
        scrollElementIntoContainer(focusedEl, dropdownRef.current, {
          block: 'nearest',
          behavior: 'auto',
        })
      }
    }, [focusedIndex, results])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!showDropdown) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((prev) => Math.min(prev + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (focusedIndex >= 0 && results[focusedIndex]) {
            handleSelect(results[focusedIndex])
          }
          break
        case 'Escape':
          setShowDropdown(false)
          break
      }
    }

    const handleSelect = (company: KBOCompany) => {
      onCompanySelect(company)
      onChange(safeString(company.name))
      setShowDropdown(false)
      setFocusedIndex(-1)
    }

    const handleClear = () => {
      onClear()
      onChange('')
      setResults([])
      inputRef.current?.focus()
    }

    const hasValue = Boolean(value) || Boolean(selectedCompany)
    const isFloated = isFocused || hasValue
    const state = disabled
      ? 'disabled'
      : selectedCompany
        ? 'success'
        : isFocused
          ? 'focus'
          : 'default'

    const showDidYouMean =
      results.length > 0 &&
      trimmedValueLength >= 3 &&
      !results.some((r) => r.name.toLowerCase().startsWith(trimmedValue.toLowerCase()))

    return (
      <div ref={containerRef} className={cn(searchContainerVariants({ size }), className)}>
        <div
          className={cn(searchGroupVariants({ state, size }))}
          onMouseDown={(e) => {
            // Make the whole control behave like a single clickable field
            // (important for "click label" and empty area clicks).
            if (disabled || selectedCompany) return
            const target = e.target as HTMLElement
            // Don't steal clicks from buttons.
            if (target.closest('button')) return
            // Prevent focus flicker caused by mousedown on wrapper.
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          {/* Search Icon */}
          <div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 z-10',
              state === 'success'
                ? 'text-primary'
                : isFocused
                  ? 'text-primary'
                  : 'text-foreground/50'
            )}
          >
            {selectedCompany ? (
              <Check className="w-5 h-5" />
            ) : isSearching ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </div>

          {/* Input Field */}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={selectedCompany ? safeString(selectedCompany.name) : value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              if (!selectedCompany) setShowDropdown(true)
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            disabled={disabled || !!selectedCompany}
            placeholder=" "
            className={cn(searchFieldVariants({ size }))}
          />

          {/* Floating Label */}
          <label
            htmlFor={inputId}
            className={cn(
              floatingLabelVariants({ state, floated: isFloated, size }),
              // Ensure label clicks focus input ("click label" UX).
              // This overrides the base pointer-events-none from the variant.
              'pointer-events-auto cursor-text'
            )}
          >
            {displayLabel}
          </label>

          {/* Right Side Icons */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
            {selectedCompany && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                aria-label={t('clear')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {!selectedCompany && value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                aria-label={t('clear')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Helper text to avoid "nothing happens" dead-end */}
        {!selectedCompany &&
          !disabled &&
          trimmedValueLength > 0 &&
          trimmedValueLength < minQueryLength && (
            <p className="mt-2 text-xs text-foreground/50">
              {t('minCharsHint', { count: minQueryLength })}
            </p>
          )}

        {description && !selectedCompany && !disabled && (
          <p className="mt-2 text-xs text-foreground/50">{description}</p>
        )}

        {/* Search Results Dropdown - Portal to escape overflow (Clarity parity) */}
        {typeof document !== 'undefined' &&
          !disabled &&
          !selectedCompany &&
          isFocused &&
          trimmedValueLength >= minQueryLength &&
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
                focusedIndex >= 0 && results[focusedIndex]
                  ? `kbo-option-${results[focusedIndex].id}`
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
              {showDidYouMean && (
                <div className="px-3 py-2 border-b border-foreground/[0.06] bg-foreground/[0.02]">
                  <span className="text-xs font-medium text-foreground/50">{t('didYouMean')}</span>
                </div>
              )}

              {isSearching ? (
                <div className="px-4 py-6 text-sm text-foreground/50 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('searching')}
                </div>
              ) : searchError ? (
                <div className="px-4 py-4 text-sm">
                  <p className="text-destructive/80 mb-1">{t('searchFailed')}</p>
                  <p className="text-foreground/40 text-xs mb-3">{searchError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchError(null)
                      setIsSearching(true)
                      void runSearch(trimmedValue)
                    }}
                    className="text-xs font-medium text-primary hover:text-primary/80"
                  >
                    {t('tryAgain')}
                  </button>
                  <div className="mt-3 pt-3 border-t border-foreground/[0.08]">
                    <a
                      href={registrySearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:text-primary/80"
                    >
                      {t('searchOnRegistryDirectly')}
                    </a>
                  </div>
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-4 text-sm text-foreground/50">
                  <p>{noResultsHintOverride ?? t('noResultsHint')}</p>
                  <a
                    href={registrySearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    {t('searchOnRegistryDirectly')}
                  </a>
                  {value.length >= 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSearching(true)
                        void runSearch(trimmedValue)
                      }}
                      className="mt-2 block text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {t('unexpectedResultRetry')}
                    </button>
                  )}
                </div>
              ) : (
                results.map((company, index) => (
                  <button
                    key={company.id}
                    id={`kbo-option-${company.id}`}
                    type="button"
                    onClick={() => handleSelect(company)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-3 text-left transition-colors',
                      'hover:bg-foreground/[0.04]',
                      focusedIndex === index && 'bg-foreground/[0.06]',
                      index !== results.length - 1 && 'border-b border-foreground/[0.04]'
                    )}
                    role="option"
                    aria-selected={focusedIndex === index}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {safeString(company.name)}
                        </span>
                        <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded shrink-0">
                          {safeString(company.legalForm)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/50 mt-0.5">
                        {safeString(company.kboNumber)} · {safeString(company.city)}
                      </p>
                      {safeString(company.naceDescription) && (
                        <p className="text-[11px] text-foreground/40 mt-0.5 truncate">
                          {safeString(company.naceDescription)}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </motion.div>,
            document.body
          )}

        {/* Selected Company Card */}
        <AnimatePresence>
          {selectedCompany && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {safeString(selectedCompany.name)}
                    </p>
                    <span className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                      {safeString(selectedCompany.legalForm)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/50 mt-0.5">
                    {safeString(selectedCompany.kboNumber)}
                  </p>
                  <p className="text-xs text-foreground/40 mt-0.5">
                    {safeString(selectedCompany.address)}, {safeString(selectedCompany.postalCode)}{' '}
                    {safeString(selectedCompany.city)}
                  </p>
                  {safeString(selectedCompany.naceDescription) && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                        {getActivityCodeShort(selectedCompany.countryCode)}{' '}
                        {safeString(selectedCompany.activityCode ?? selectedCompany.naceCode)}
                      </span>
                      <span className="text-[11px] text-foreground/50 truncate">
                        {safeString(selectedCompany.naceDescription)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)
KBOSearchInput.displayName = 'KBOSearchInput'
