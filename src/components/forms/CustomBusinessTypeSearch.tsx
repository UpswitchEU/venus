import { ChevronDown, Lightbulb, X } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { BusinessType } from '../../services/businessTypesApi'
import { businessTypeCategoryKey } from '../../utils/businessTypeCategory'

interface CustomBusinessTypeSearchProps {
  value?: string // business_type_id
  businessTypes: BusinessType[]
  onChange: (businessType: BusinessType) => void
  onSuggest?: (suggestion: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  loading?: boolean
  label?: string
  className?: string
  initialQuery?: string // Initial query text to display (e.g., from prefilledQuery)
}

export const CustomBusinessTypeSearch: React.FC<CustomBusinessTypeSearchProps> = ({
  value,
  businessTypes,
  onChange,
  onSuggest,
  placeholder = 'Search for your business type...',
  disabled = false,
  required = false,
  loading = false,
  label = 'Business Type',
  className = '',
  initialQuery,
}) => {
  const [query, setQuery] = useState(initialQuery || '')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<BusinessType | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const initialQuerySetRef = useRef(false) // Track if initialQuery has been set

  // Find selected business type when value changes
  useEffect(() => {
    if (value) {
      const found = businessTypes.find((bt) => bt.id === value)
      if (found) {
        setSelectedType(found)
        setQuery(found.title)
        initialQuerySetRef.current = true // Mark that we've set a value-based query
      }
    } else {
      setSelectedType(null)
      // Only set initialQuery if we haven't set it before and no value is selected
      if (!initialQuerySetRef.current && initialQuery && !query) {
        setQuery(initialQuery)
        initialQuerySetRef.current = true
      } else if (!initialQuery && !query) {
        setQuery('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, businessTypes, initialQuery, query]) // Only depend on value and businessTypes to prevent loops

  // Set initialQuery once when component mounts or when initialQuery first becomes available
  useEffect(() => {
    if (!initialQuerySetRef.current && initialQuery && !value && !query) {
      setQuery(initialQuery)
      initialQuerySetRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, query, value]) // Only run once on mount

  const filteredTypes = React.useMemo(() => {
    if (!query.trim()) {
      const popular = businessTypes.filter((bt) => bt.popular)
      const others = businessTypes.filter((bt) => !bt.popular)
      return [...popular, ...others]
    }

    const normalize = (s: string) =>
      s
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .replace(/[^\p{L}\p{N}]+/gu, '')
    const trimmedQuery = query.trim()
    const searchTerm = trimmedQuery.toLowerCase()
    const searchNorm = normalize(trimmedQuery)
    return businessTypes
      .filter(
        (bt) =>
          bt.title.toLowerCase().includes(searchTerm) ||
          normalize(bt.title).includes(searchNorm) ||
          bt.description?.toLowerCase().includes(searchTerm) ||
          normalize(bt.description || '').includes(searchNorm) ||
          bt.industryMapping?.toLowerCase().includes(searchTerm) ||
          normalize(bt.industryMapping || '').includes(searchNorm) ||
          bt.industry?.toLowerCase().includes(searchTerm) ||
          normalize(bt.industry || '').includes(searchNorm)
      )
      .sort((a, b) => {
        const aExact = a.title.toLowerCase() === searchTerm || normalize(a.title) === searchNorm
        const bExact = b.title.toLowerCase() === searchTerm || normalize(b.title) === searchNorm
        if (aExact && !bExact) return -1
        if (!aExact && bExact) return 1

        if (a.popular && !b.popular) return -1
        if (!a.popular && b.popular) return 1

        const aIdx = normalize(a.title).indexOf(searchNorm)
        const bIdx = normalize(b.title).indexOf(searchNorm)
        return aIdx - bIdx
      })
  }, [query, businessTypes])

  // Group filtered types by category
  const groupedTypes = React.useMemo(() => {
    const groups: { [key: string]: BusinessType[] } = {}

    filteredTypes.forEach((type) => {
      const categoryKey = businessTypeCategoryKey(type.category)

      if (!groups[categoryKey]) {
        groups[categoryKey] = []
      }
      groups[categoryKey].push(type)
    })

    return groups
  }, [filteredTypes])

  // Handle selection
  const handleSelect = useCallback(
    (type: BusinessType) => {
      setSelectedType(type)
      setQuery(type.title)
      setIsOpen(false)
      setHighlightedIndex(0)
      onChange(type)
    },
    [onChange]
  )

  // Handle clear
  const handleClear = useCallback(() => {
    setSelectedType(null)
    setQuery('')
    setIsOpen(false)
    setHighlightedIndex(0)
    inputRef.current?.focus()
  }, [])

  // Handle suggest
  const handleSuggest = useCallback(() => {
    if (onSuggest && query.trim()) {
      onSuggest(query.trim())
      setQuery('')
      setIsOpen(false)
    }
  }, [onSuggest, query])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          setIsOpen(true)
          return
        }
        return
      }

      const totalItems = filteredTypes.length

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
          e.preventDefault()
          if (filteredTypes[highlightedIndex]) {
            handleSelect(filteredTypes[highlightedIndex])
          }
          break
        case 'Escape':
          setIsOpen(false)
          setHighlightedIndex(0)
          break
      }
    },
    [isOpen, filteredTypes, highlightedIndex, handleSelect]
  )

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    setIsOpen(true)
    setHighlightedIndex(0)
  }, [])

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsOpen(true)
  }, [])

  // Handle blur
  const handleBlur = useCallback(() => {
    // Delay closing to allow for click events
    setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {/* Input Container - Aurora styled */}
      <div
        className={`relative border rounded-xl shadow-sm transition-all duration-200 ${
          disabled
            ? 'border-foreground/[0.05] bg-foreground/[0.02] opacity-60'
            : 'border-foreground/[0.10] bg-foreground/[0.04] hover:border-foreground/[0.20] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'
        }`}
      >
        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || ' '}
          disabled={disabled || loading}
          required={required}
          className="
            w-full h-16 px-4 pt-6 pb-2 text-base pr-20
            border-none rounded-xl 
            focus:outline-none focus:ring-0
            transition-all duration-200 ease-in-out
            disabled:cursor-not-allowed disabled:text-foreground/30
            bg-transparent text-foreground placeholder:text-transparent
          "
        />

        {/* Clear Button */}
        {selectedType && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-10 top-1/2 transform -translate-y-1/2 text-foreground/40 hover:text-foreground/70 transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Dropdown Indicator */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-foreground/50 z-10 pointer-events-none">
          <ChevronDown
            className={`h-5 w-5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Label - Fixed at top like AuroraInput */}
        <label
          className={`
          absolute left-4 top-2 text-xs font-medium pointer-events-none
          ${disabled ? 'text-foreground/30' : 'text-foreground/50'}
        `}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      </div>

      {/* Loading State */}
      {loading && <div className="mt-2 text-sm text-foreground/50">Loading business types...</div>}

      {/* Dropdown */}
      {isOpen && !loading && (
        <div
          ref={dropdownRef}
          className="absolute z-[10000] w-full mt-2 bg-background border border-foreground/[0.10] rounded-xl shadow-2xl shadow-black/20 max-h-96 overflow-y-auto transform transition-all duration-200 origin-top"
          style={{ zIndex: 10000 }}
        >
          {filteredTypes.length > 0 ? (
            <>
              {/* Popular types section (when no query) */}
              {!query && businessTypes.filter((bt) => bt.popular).length > 0 && (
                <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-2.5 text-xs font-semibold text-foreground/50 uppercase tracking-wider border-b border-foreground/[0.05] z-10">
                  Popular Types
                </div>
              )}

              {/* Grouped results */}
              {Object.entries(groupedTypes).map(([category, types]) => (
                <div key={category}>
                  {query && (
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-2.5 text-xs font-semibold text-foreground/50 uppercase tracking-wider border-b border-foreground/[0.05] z-10">
                      {category}
                    </div>
                  )}

                  {types.map((type) => {
                    const globalIndex = filteredTypes.findIndex((t) => t.id === type.id)
                    const isHighlighted = globalIndex !== -1 && globalIndex === highlightedIndex

                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => handleSelect(type)}
                        onMouseEnter={() => {
                          if (globalIndex !== -1) setHighlightedIndex(globalIndex)
                        }}
                        className={`w-full text-left px-4 py-3 transition-all duration-150 group ${
                          isHighlighted ? 'bg-primary/10' : 'hover:bg-foreground/[0.04]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl flex-shrink-0 transform transition-transform duration-200 group-hover:scale-110">
                            {type.icon || '🏢'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`font-medium text-base ${isHighlighted ? 'text-foreground' : 'text-foreground/80'}`}
                            >
                              {type.title}
                            </div>
                            <div
                              className={`text-sm mt-0.5 line-clamp-2 ${
                                isHighlighted ? 'text-foreground/70' : 'text-foreground/40'
                              }`}
                            >
                              {type.short_description || type.description}
                            </div>
                            {type.popular && (
                              <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-gold/20 text-gold border border-gold/30 rounded-full">
                                Popular
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          ) : (
            /* No results - show suggestion option */
            <div className="px-4 py-8 text-center">
              <p className="text-foreground/50 mb-4">No business types found for "{query}"</p>
              {onSuggest && query.trim() && (
                <button
                  type="button"
                  onClick={handleSuggest}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                  <Lightbulb className="w-4 h-4" />
                  Suggest "{query.trim()}" as a new type
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected type info */}
      {selectedType && !isOpen && (
        <div className="mt-2 relative overflow-hidden rounded-xl bg-primary/5 border border-primary/20 shadow-sm">
          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Icon badge */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm text-primary-foreground">
                <span className="text-xl">{selectedType.icon || '🏢'}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-foreground mb-1.5 leading-tight">
                  {selectedType.description}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-foreground/[0.06] border border-foreground/[0.08] text-foreground/70">
                    <svg
                      className="w-3 h-3 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                    <span className="font-medium text-foreground">
                      {selectedType.industry || selectedType.industryMapping}
                    </span>
                  </span>
                  {selectedType.category && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-foreground/[0.06] border border-foreground/[0.08] text-foreground/70">
                      <svg
                        className="w-3 h-3 text-primary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      <span className="font-medium text-foreground">
                        {businessTypeCategoryKey(selectedType.category, '')}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
