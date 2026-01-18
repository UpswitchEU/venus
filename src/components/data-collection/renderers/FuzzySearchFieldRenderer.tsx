/**
 * Fuzzy Search Field Renderer
 *
 * Single Responsibility: Render data fields with fuzzy search and selection
 * SOLID Principles: SRP, OCP, LSP, ISP, DIP
 */

import { Check, Search } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { FieldRendererProps } from '../../../types/data-collection'

export const FuzzySearchFieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  errors = [],
  disabled = false,
}) => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const _hasErrors = errors.length > 0
  const errorMessage = errors.find((e) => e.severity === 'error')?.message

  // Fuzzy search through options
  const searchResults = useMemo(() => {
    if (!query.trim() || !field.options) return []

    const queryLower = query.toLowerCase()
    const results: Array<{
      option: { value: string; label: string; description?: string }
      score: number
    }> = []

    for (const option of field.options) {
      const labelLower = option.label.toLowerCase()
      const valueLower = option.value.toLowerCase()

      let score = 0

      // Exact match
      if (labelLower === queryLower || valueLower === queryLower) {
        score = 100
      }
      // Starts with query
      else if (labelLower.startsWith(queryLower) || valueLower.startsWith(queryLower)) {
        score = 80
      }
      // Contains query
      else if (labelLower.includes(queryLower) || valueLower.includes(queryLower)) {
        score = 60
      }
      // Fuzzy character matching
      else {
        const queryChars = queryLower.split('')
        let matches = 0
        for (const char of queryChars) {
          if (labelLower.includes(char) || valueLower.includes(char)) {
            matches++
          }
        }
        score = (matches / queryChars.length) * 40
      }

      if (score > 20) {
        results.push({ option, score })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 8) // Limit results
  }, [query, field.options])

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue, 'fuzzy_search')
    setQuery('')
    setIsOpen(false)
  }

  // Get display label for current value
  const getDisplayLabel = () => {
    if (!value || !field.options) return ''
    const option = field.options.find((opt) => opt.value === value)
    return option ? option.label : value
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {field.description && <p className="text-xs text-zinc-400">{field.description}</p>}

      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={`Search ${field.label.toLowerCase()}...`}
            disabled={disabled}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {value && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              <span className="text-xs text-zinc-400 bg-zinc-700 px-2 py-1 rounded">
                {getDisplayLabel()}
              </span>
              <Check className="w-4 h-4 text-green-400" />
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {isOpen && query.trim() && searchResults.length > 0 && (
          <div className="absolute z-[10000] w-full mt-1 bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg max-h-64 overflow-y-auto" style={{ zIndex: 10000 }}>
            {searchResults.map(({ option }) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                disabled={disabled}
                className="w-full px-4 py-3 text-left hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none transition-colors border-b border-zinc-700/50 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">{option.label}</div>
                    {option.description && (
                      <div className="text-xs text-zinc-400 mt-1">{option.description}</div>
                    )}
                  </div>
                  {value === option.value && <Check className="w-4 h-4 text-primary-400" />}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {isOpen && query.trim() && searchResults.length === 0 && (
          <div className="absolute z-[10000] w-full mt-1 bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg p-4 text-center" style={{ zIndex: 10000 }}>
            <p className="text-zinc-400 text-sm">No matches found for "{query}"</p>
            <button
              onClick={() => handleSelect(query)}
              className="mt-2 px-3 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 transition-colors"
            >
              Use "{query}" anyway
            </button>
          </div>
        )}
      </div>

      {/* Popular/Recent options when no search */}
      {!query.trim() && field.options && field.options.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Popular options:</p>
          <div className="flex flex-wrap gap-2">
            {field.options.slice(0, 6).map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                disabled={disabled}
                className="px-3 py-1 bg-zinc-800/50 hover:bg-zinc-700/50 text-sm text-zinc-300 rounded-lg border border-zinc-600/50 hover:border-zinc-500/50 transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
    </div>
  )
}
