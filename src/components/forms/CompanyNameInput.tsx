/**
 * Company Name Input Component with KBO Search
 *
 * Enhanced input field that performs fuzzy KBO company name search
 * Shows suggestions and company preview card (LinkedIn pattern)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { registryService } from '../../services/registry/registryService'
import type { CompanySearchResult } from '../../services/registry/types'
import { debounce } from '../../utils/debounce'
import { generalLogger } from '../../utils/logger'
import CompanyPreviewCard from './CompanyPreviewCard'
import type { CustomInputFieldProps } from './CustomInputField'
import CustomInputField from './CustomInputField'

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
  const [exactMatch, setExactMatch] = useState<CompanySearchResult | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search function - memoized with useRef to persist across renders
  const performSearchRef = useRef<((query: string, country: string) => void) | null>(null)

  useEffect(() => {
    // Create debounced function once
    if (!performSearchRef.current) {
      performSearchRef.current = debounce(async (query: string, country: string) => {
        if (!query || query.trim().length < 3) {
          setSearchResults([])
          setExactMatch(null)
          setIsLoading(false)
          setShowSuggestions(false)
          return
        }

        // Only search for Belgium (KBO is Belgium-specific)
        if (country !== 'BE') {
          setSearchResults([])
          setExactMatch(null)
          setIsLoading(false)
          return
        }

        setIsLoading(true)
        try {
          const response = await registryService.searchCompanies(query.trim(), country, 200)

          if (response.success && response.results) {
            const results = response.results
            setSearchResults(results)

            // Check for exact match (for highlighting/display only)
            const match = results.find(
              (r) => r.company_name.toLowerCase() === query.trim().toLowerCase()
            )
            setExactMatch(match || null)

            // Show dropdown with results (including exact match)
            if (results.length > 0) {
              setShowSuggestions(true)
              generalLogger.debug('KBO suggestions ready - showing dropdown', {
                count: results.length,
                query,
                has_exact_match: !!match,
              })
            }
          } else {
            setSearchResults([])
            setExactMatch(null)
          }
        } catch (error) {
          generalLogger.warn('KBO search failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            query,
            country,
          })
          // Silently fail - don't block user input
          setSearchResults([])
          setExactMatch(null)
        } finally {
          setIsLoading(false)
        }
      }, 800) // Increased from 500ms to reduce rate limit errors
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
      setSearchResults([])
      setExactMatch(null)
      setShowSuggestions(false)
      setHighlightedIndex(-1)
    }
  }, [value, countryCode, performSearch, selectedCompany])

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
          className="w-5 h-5 text-primary-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>

        {/* Tooltip on hover - Kept dark for high contrast overlay */}
        <div className="absolute right-0 bottom-full mb-2 w-72 p-4 bg-gray-900 border border-gray-800 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 transform translate-y-2 group-hover:translate-y-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-primary-400 text-xs uppercase tracking-wider">
              {t('forms.kboLookup.verifiedCompany')}
            </span>
            {exactMatch.status === 'Active' && (
              <span className="px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded text-[10px] font-semibold">
                ACTIVE
              </span>
            )}
          </div>
          <div className="font-serif text-base mb-3 text-white">{exactMatch.company_name}</div>
          <div className="space-y-2 text-gray-400 border-t border-gray-800 pt-2">
            <div className="flex justify-between">
              <span>{t('forms.kboLookup.registration')}</span>
              <span className="font-mono text-gray-300">{exactMatch.registration_number}</span>
            </div>
            {exactMatch.legal_form && (
              <div className="flex justify-between">
                <span>{t('forms.kboLookup.type')}</span>
                <span className="text-gray-300">{exactMatch.legal_form}</span>
              </div>
            )}
            {exactMatch.address && (
              <div className="block mt-1">
                <span className="block mb-0.5">{t('forms.kboLookup.address')}</span>
                <span className="text-gray-300 leading-tight">{exactMatch.address}</span>
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
      <div className="w-4 h-4 border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin" />
    )
  }

  // Render suggestions dropdown
  const renderSuggestions = () => {
    if (!showSuggestions || searchResults.length === 0 || isLoading || selectedCompany) return null

    return (
      <div
        id="company-suggestions-list"
        role="listbox"
        className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200/75 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-[9999] max-h-72 overflow-y-auto transform transition-all duration-200 origin-top animate-in fade-in slide-in-from-top-2 ring-1 ring-black/5"
      >
        <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white/95 border-b border-gray-100 sticky top-0 backdrop-blur-md z-10 shadow-sm">
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
                    ? 'bg-primary-50 border-primary-500'
                    : 'border-transparent hover:bg-primary-50 hover:border-primary-200'
                } ${isExactMatch ? 'bg-primary-50/60 hover:bg-primary-100 border-primary-500' : ''}`}
                onClick={() => handleSelectCompany(company)}
                onMouseEnter={() => {
                  setHighlightedIndex(index)
                }}
              >
                <div
                  className={`font-medium text-base transition-colors ${isExactMatch ? 'text-primary-900' : 'text-gray-900'}`}
                >
                  {company.company_name}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  {company.registration_number && (
                    <span
                      className={`font-mono ${isExactMatch ? 'text-primary-700/70' : 'text-gray-400'}`}
                    >
                      {company.registration_number}
                    </span>
                  )}
                  {company.legal_form && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span className={`${isExactMatch ? 'text-primary-700/70' : 'text-gray-500'}`}>
                        {company.legal_form}
                      </span>
                    </>
                  )}
                </div>
                {company.address && (
                  <div
                    className={`text-xs mt-1 truncate ${isExactMatch ? 'text-primary-700/60' : 'text-gray-400'}`}
                  >
                    {company.address}
                  </div>
                )}
              </button>
            )
          })}
        </div>
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
          if (searchResults.length > 0 && !selectedCompany) {
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
