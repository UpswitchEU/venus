/**
 * Suggestion Field Renderer
 *
 * Single Responsibility: Render data fields with clickable suggestion options
 * SOLID Principles: SRP, OCP, LSP, ISP, DIP
 */

import { Sparkles } from 'lucide-react'
import React from 'react'
import { FieldRendererProps, ParsedFieldValue } from '../../../types/data-collection'

export const SuggestionFieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  errors = [],
  disabled = false,
}) => {
  const _hasErrors = errors.length > 0
  const errorMessage = errors.find((e) => e.severity === 'error')?.message
  const suggestions = field.suggestions || []

  if (suggestions.length === 0) {
    // Fallback to manual input if no suggestions
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </label>
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value, 'suggestion')}
          placeholder={field.placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Sparkles className="w-4 h-4 text-primary-400" />
        <label className="text-sm font-medium text-white">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </label>
      </div>

      {field.description && <p className="text-xs text-zinc-400">{field.description}</p>}

      <div className="grid grid-cols-2 gap-2">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onChange(parseSuggestionValue(suggestion, field), 'suggestion')}
            disabled={disabled}
            className={`
              px-3 py-2 text-left rounded-lg border transition-all duration-200 text-sm
              ${
                value === parseSuggestionValue(suggestion, field)
                  ? 'bg-primary-600 border-primary-500 text-white shadow-lg'
                  : 'bg-zinc-800/50 border-zinc-600/50 text-zinc-300 hover:bg-zinc-700/50 hover:border-zinc-500/50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Custom input option */}
      <div className="relative">
        <input
          type="text"
          value={typeof value === 'string' && !suggestions.includes(value) ? value : ''}
          onChange={(e) => onChange(e.target.value, 'suggestion')}
          placeholder={`Or enter custom ${field.label.toLowerCase()}...`}
          disabled={disabled}
          className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-600/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 text-sm"
        />
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </div>
  )
}

function parseSuggestionValue(
  suggestion: string,
  field: import('../../../types/data-collection').DataField
): ParsedFieldValue {
  switch (field.type) {
    case 'number': {
      if (suggestion.includes('-')) {
        // Handle ranges like "1-5", "6-20"
        const parts = suggestion.split('-').map((s) => s.trim())
        const parsedParts = parts.map((s) => parseInt(s, 10))

        if (parts.length === 2 && parsedParts.every((n) => !isNaN(n))) {
          const [min, max] = parsedParts
          return Math.round((min + max) / 2)
        }
      }

      const num = parseInt(suggestion.replace(/\D/g, ''), 10)
      return isNaN(num) ? suggestion : num
    }

    case 'currency': {
      // Handle currency suggestions like "€100K - €500K"
      if (suggestion.includes('-')) {
        const parts = suggestion.split('-').map((s) => s.trim())
        if (parts.length === 2) {
          const min = parseCurrencyValue(parts[0])
          const max = parseCurrencyValue(parts[1])
          if (min !== null && max !== null) {
            return Math.round((min + max) / 2)
          }
        }
      }

      const parsed = parseCurrencyValue(suggestion)
      return parsed !== null ? parsed : suggestion
    }

    case 'boolean': {
      const lowerSuggestion = suggestion.toLowerCase().trim()
      if (lowerSuggestion === 'yes' || lowerSuggestion === 'true' || lowerSuggestion === '1')
        return true
      if (lowerSuggestion === 'no' || lowerSuggestion === 'false' || lowerSuggestion === '0')
        return false
      return suggestion // Return original if not a clear boolean
    }

    default:
      return suggestion
  }
}

function parseCurrencyValue(text: string): number | null {
  // Remove currency symbols and normalize
  const cleaned = text.replace(/[€£$]/g, '').trim()

  let multiplier = 1
  let finalCleaned = cleaned

  // Handle K/M suffixes
  if (cleaned.includes('K')) {
    multiplier = 1000
    finalCleaned = cleaned.replace('K', '')
  } else if (cleaned.includes('M')) {
    multiplier = 1000000
    finalCleaned = cleaned.replace('M', '')
  }

  // Remove commas and parse
  const num = parseFloat(finalCleaned.replace(/,/g, ''))
  if (isNaN(num)) return null

  return num * multiplier
}
