/**
 * Company Name Input Component with Registry Search
 *
 * Enhanced input field that performs fuzzy company name search
 * against KBO (Belgium) or KVK (Netherlands) registries.
 * Shows suggestions and company preview card (LinkedIn pattern)
 */

import { useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { registryService } from '../../services/registry/registryService'
import type { CompanySearchResult } from '../../services/registry/types'
import { debounce } from '../../utils/debounce'
import { generalLogger } from '../../utils/logger'
import CompanyPreviewCard from './CompanyPreviewCard'
import type { CustomInputFieldProps } from './CustomInputField'
import CustomInputField from './CustomInputField'

type CountryCode = 'BE' | 'NL'

const FINANCIAL_TERMS: Record<CountryCode, { registrationNumberShort: string }> = {
  BE: { registrationNumberShort: 'KBO' },
  NL: { registrationNumberShort: 'KVK' },
}

function getRegistryLabel(countryCode: string): string {
  const code = countryCode?.toUpperCase() === 'NL' ? 'NL' : 'BE'
  return FINANCIAL_TERMS[code].registrationNumberShort
}

export interface CompanyNameInputProps
  extends Omit<CustomInputFieldProps, 'onChange' | 'rightIcon'> {
  value: string
  onChange: (value: string) => void
  countryCode?: string
  selectedCompany?: CompanySearchResult | null // Controlled from parent
  onCompanyChange?: (company: CompanySearchResult | null) => void // Selection change notification
  onClearCompany?: () => void // User wants to change company
  isVerifying?: boolean // Show verifying state in preview
}

export const CompanyNameInput: React.FC<CompanyNameInputProps> = ({
  value,
  onChange,
  countryCode = 'BE',
  selectedCompany = null,
  onCompanyChange,
  onClearCompany,
  isVerifying = false,
  ...inputProps
}) => {
  const t = useTranslations()
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0)
  const [exactMatch, setExactMatch] = useState<CompanySearchResult | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const lastSearchEmptyRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Debounced search function - memoized with useRef to persist across renders
  const performSearchRef = useRef<((query: string, country: string) => void) | null>(null)

  useEffect(() => {
    // Create debounced function once
    if (!performSearchRef.current) {
      performSearchRef.current = debounce(async (query: string, country: string) => {
        if (!query || query.trim().length < 2) {
          lastSearchEmptyRef.current = false
          setSearchResults([])
          setExactMatch(null)
          setSearchError(null)
          setIsLoading(false)
          setShowSuggestions(false)
          return
        }

        setIsLoading(true)
        setSearchError(null)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        const controller = new AbortController()
        abortControllerRef.current = controller
        try {
          const response = await registryService.searchCompanies(
            query.trim(),
            country,
            200,
            controller.signal
          )

          // Guard: ignore stale response if request was aborted (rapid typing)
          if (controller.signal.aborted) return

          if (response.success && response.results) {
            const results = response.results
            lastSearchEmptyRef.current = results.length === 0
            setSearchResults(results)
            setSearchError(null)

            // Check for exact match (for highlighting/display only)
            const match = results.find(
              (r) => r.company_name.toLowerCase() === query.trim().toLowerCase()
            )
            setExactMatch(match || null)

            // Show dropdown for results or empty (so we can show "Search on KBO" link)
            setShowSuggestions(true)
            if (results.length > 0) {
              generalLogger.debug('KBO suggestions ready - showing dropdown', {
                count: results.length,
                query,
                has_exact_match: !!match,
              })
            }
          } else {
            lastSearchEmptyRef.current = false
            setSearchResults([])
            setExactMatch(null)
            setSearchError(response.error || 'Search temporarily unavailable')
            setShowSuggestions(true)
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
          lastSearchEmptyRef.current = false
          generalLogger.warn('KBO search failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            query,
            country,
          })
          setSearchResults([])
          setExactMatch(null)
          setSearchError(
            error instanceof Error ? error.message : t('forms.kboLookup.searchUnavailable')
          )
          setShowSuggestions(true)
        } finally {
          const wasReplaced = abortControllerRef.current !== controller
          if (!controller.signal.aborted) {
            abortControllerRef.current = null
          }
          if (!wasReplaced) setIsLoading(false)
        }
      }, 450)
    }
  }, [])

  const performSearch = useCallback((query: string, country: string) => {
    performSearchRef.current?.(query, country)
  }, [])

  // Trigger search when value changes
  useEffect(() => {
    if (value) {
      // Don't search if company is already selected (prevents redundant API calls)
      if (
        selectedCompany &&
        value.toLowerCase().trim() === selectedCompany.company_name.toLowerCase().trim()
      ) {
        generalLogger.debug('[CompanyNameInput] Skipping search - company already selected', {
          company_name: selectedCompany.company_name,
        })
        return
      }
      performSearch(value, countryCode)
    } else {
      abortControllerRef.current?.abort()
      lastSearchEmptyRef.current = false
      setSearchResults([])
      setExactMatch(null)
      setSearchError(null)
      setShowSuggestions(false)
      setHighlightedIndex(-1)
    }
  }, [value, countryCode, performSearch, selectedCompany, retryTrigger])

  // Reset highlighted index when search results change
  useEffect(() => {
    if (searchResults.length > 0) {
      setHighlightedIndex(-1)
    }
  }, [searchResults])

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    setShowSuggestions(true)
    setExactMatch(null) // Clear exact match until search completes

    // ALWAYS clear selected company when user types (even if it matches)
    // This ensures clean slate for new search
    if (selectedCompany) {
      onCompanyChange?.(null) // Notify parent that selection is cleared
      generalLogger.debug('[CompanyNameInput] Clearing selection - user is typing', {
        previous: selectedCompany.company_name,
        new_value: newValue,
      })
    }

    setHighlightedIndex(-1) // Reset highlight when typing
  }

  // Handle company selection
  const handleSelectCompany = useCallback(
    (company: CompanySearchResult) => {
      onChange(company.company_name)
      setExactMatch(company)
      setShowSuggestions(false)
      setHighlightedIndex(-1)
      onCompanyChange?.(company) // Only notify parent, don't save

      generalLogger.info('[CompanyNameInput] Company selected', {
        company_name: company.company_name,
        registration_number: company.registration_number,
      })
    },
    [onChange, onCompanyChange]
  )

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Handle Enter key
      if (e.key === 'Enter') {
        e.preventDefault()

        // If dropdown is showing and item is highlighted, select it
        if (showSuggestions && highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleSelectCompany(searchResults[highlightedIndex])
          return
        }

        // If there's an exact match, select it
        if (exactMatch && !selectedCompany) {
          handleSelectCompany(exactMatch)
          return
        }

        // Otherwise, just close dropdown
        setShowSuggestions(false)
        return
      }

      if (!showSuggestions || searchResults.length === 0) {
        if (e.key === 'ArrowDown' && searchResults.length > 0) {
          setShowSuggestions(true)
          setHighlightedIndex(0)
          e.preventDefault()
        }
        return
      }

      const totalItems = searchResults.length

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems)
          break
        case 'Escape':
          e.preventDefault()
          setShowSuggestions(false)
          setHighlightedIndex(-1)
          inputRef.current?.blur()
          break
      }
    },
    [
      showSuggestions,
      searchResults,
      highlightedIndex,
      exactMatch,
      selectedCompany,
      handleSelectCompany,
    ]
  )

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Render checkmark icon
  const renderCheckmark = () => {
    if (!exactMatch) return null

    return (
      <div className="relative group">
        <svg
          className="w-5 h-5 text-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>

        {/* Tooltip on hover - Aurora styled */}
        <div
          className="absolute right-0 bottom-full mb-2 w-72 p-4 bg-background border border-foreground/[0.08] text-foreground text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-[10000] transform translate-y-2 group-hover:translate-y-0"
          style={{ zIndex: 10000 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-primary text-xs uppercase tracking-wider">
              {t('forms.kboLookup.verifiedCompany')}
            </span>
            {exactMatch.status === 'Active' && (
              <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded text-[10px] font-semibold">
                ACTIVE
              </span>
            )}
          </div>
          <div className="font-serif text-base mb-3 text-foreground">{exactMatch.company_name}</div>
          <div className="space-y-2 text-foreground/50 border-t border-foreground/[0.08] pt-2">
            <div className="flex justify-between">
              <span>{t('forms.kboLookup.registration')}</span>
              <span className="font-mono text-foreground/70">{exactMatch.registration_number}</span>
            </div>
            {exactMatch.legal_form && (
              <div className="flex justify-between">
                <span>{t('forms.kboLookup.type')}</span>
                <span className="text-foreground/70">{exactMatch.legal_form}</span>
              </div>
            )}
            {exactMatch.address && (
              <div className="block mt-1">
                <span className="block mb-0.5">{t('forms.kboLookup.address')}</span>
                <span className="text-foreground/70 leading-tight">{exactMatch.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render loading spinner
  const renderLoadingSpinner = () => {
    if (!isLoading) return null

    return (
      <div className="w-4 h-4 border-2 border-foreground/20 border-t-primary rounded-full animate-spin" />
    )
  }

  // Render suggestions dropdown
  const renderSuggestions = () => {
    if (!showSuggestions || isLoading || selectedCompany) return null
    if (
      searchResults.length === 0 &&
      !searchError &&
      (!value || value.trim().length < 2)
    )
      return null

    const registrySearchUrl = countryCode === 'NL'
      ? `https://www.kvk.nl/zoeken/?source=all&q=${encodeURIComponent(value?.trim() || '')}`
      : `https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?zoekwoord=${encodeURIComponent(value?.trim() || '')}`
    const registryLabel = getRegistryLabel(countryCode)

    return (
      <div
        id="company-suggestions-list"
        role="listbox"
        className="absolute top-full left-0 right-0 mt-2 bg-background border border-foreground/[0.10] rounded-xl shadow-2xl shadow-black/20 z-[9999] max-h-72 overflow-y-auto transform transition-all duration-200 origin-top"
      >
        {searchError ? (
          <div className="px-4 py-4 text-sm">
            <p className="text-destructive/80 mb-1">{t('forms.kboLookup.searchFailed')}</p>
            <p className="text-foreground/40 text-xs mb-3">{searchError}</p>
            <button
              type="button"
              onClick={() => {
                setSearchError(null)
                setIsLoading(true)
                setRetryTrigger((p) => p + 1)
              }}
              className="text-xs font-medium text-primary hover:text-primary/80"
            >
              {t('forms.kboLookup.retry')}
            </button>
            <div className="mt-3 pt-3 border-t border-foreground/[0.08]">
              <a
                href={registrySearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                {t('forms.kboLookup.searchOnRegistryDirectly')}
              </a>
            </div>
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <div className="px-4 py-2.5 text-xs font-semibold text-foreground/50 uppercase tracking-wider bg-background/95 border-b border-foreground/[0.05] sticky top-0 backdrop-blur-md z-10">
              {t('forms.kboLookup.didYouMean')}
            </div>
            <div className="py-1">
              {searchResults.map((company, index) => {
                const isExactMatch = exactMatch?.company_id === company.company_id
                const isHighlighted = highlightedIndex === index

                return (
                  <button
                    key={company.company_id || index}
                    type="button"
                    role="option"
                    aria-selected={isExactMatch}
                    className={`w-full text-left px-4 py-3 transition-all duration-150 group relative border-l-2 ${
                      isHighlighted
                        ? 'bg-primary/10 border-primary'
                        : 'border-transparent hover:bg-foreground/[0.04] hover:border-primary/30'
                    } ${isExactMatch ? 'bg-primary/10 hover:bg-primary/15 border-primary' : ''}`}
                    onClick={() => handleSelectCompany(company)}
                    onMouseEnter={() => {
                      setHighlightedIndex(index)
                    }}
                  >
                    <div
                      className={`font-medium text-base transition-colors ${isExactMatch ? 'text-primary' : 'text-foreground'}`}
                    >
                      {company.company_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {company.registration_number && (
                        <span
                          className={`font-mono ${isExactMatch ? 'text-primary/70' : 'text-foreground/40'}`}
                        >
                          {company.registration_number}
                        </span>
                      )}
                      {company.legal_form && (
                        <>
                          <span className="text-foreground/20">•</span>
                          <span
                            className={`${isExactMatch ? 'text-primary/70' : 'text-foreground/50'}`}
                          >
                            {company.legal_form}
                          </span>
                        </>
                      )}
                    </div>
                    {company.address && (
                      <div
                        className={`text-xs mt-1 truncate ${isExactMatch ? 'text-primary/60' : 'text-foreground/40'}`}
                      >
                        {company.address}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div className="px-4 py-4 text-sm">
            <p className="text-foreground/60 text-xs mb-3">
              {t('forms.kboLookup.noResultsHint')}
            </p>
            <a
              href={registrySearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary hover:text-primary/80"
            >
              {t('forms.kboLookup.searchOnRegistryDirectly')}
            </a>
          </div>
        )}
      </div>
    )
  }

  // Determine right icon (loading spinner or checkmark)
  const rightIcon = isLoading ? renderLoadingSpinner() : renderCheckmark()

  // Read-only when company is selected
  const isReadOnly = !!selectedCompany

  return (
    <div ref={containerRef} className="relative">
      <CustomInputField
        {...inputProps}
        value={value}
        onChange={handleChange}
        disabled={isReadOnly || inputProps.disabled}
        aria-expanded={showSuggestions}
        aria-haspopup="listbox"
        aria-controls="company-suggestions-list"
        aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
        onKeyDown={(e) => {
          handleKeyDown(e)
          inputProps.onKeyDown?.(e)
        }}
        onFocus={() => {
          // Restore dropdown when we have results, error, or completed empty search
          const hasSearchState =
            searchResults.length > 0 ||
            searchError ||
            (lastSearchEmptyRef.current &&
              value?.trim().length >= 2 &&
              !isLoading &&
              !selectedCompany)
          if (hasSearchState) {
            setShowSuggestions(true)
          }
          inputProps.onFocus?.({} as React.FocusEvent<HTMLInputElement>)
        }}
        onBlur={(e) => {
          // Delay closing suggestions to allow click events to register
          setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) {
              setShowSuggestions(false)
              setHighlightedIndex(-1)
            }
          }, 200)
          inputProps.onBlur?.(e)
        }}
        rightIcon={rightIcon}
        inputRef={inputRef}
      />
      {renderSuggestions()}

      {/* Show preview card when company selected */}
      {selectedCompany && (
        <CompanyPreviewCard
          company={selectedCompany}
          onClear={() => {
            onClearCompany?.()
            inputRef.current?.focus()
          }}
          isVerifying={isVerifying}
        />
      )}
    </div>
  )
}

export default CompanyNameInput
