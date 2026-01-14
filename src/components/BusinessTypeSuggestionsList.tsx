import { X } from 'lucide-react'
import React, { useState } from 'react'

export interface BusinessTypeSuggestion {
  number: number
  id: string
  title: string
  description?: string
  industry?: string
  category?: string
  icon?: string
}

interface BusinessTypeSuggestionsListProps {
  suggestions: BusinessTypeSuggestion[]
  onSelect: (selection: string) => void
}

export const BusinessTypeSuggestionsList = ({
  suggestions,
  onSelect,
}: BusinessTypeSuggestionsListProps): React.ReactElement | null => {
  const [isDismissed, setIsDismissed] = useState(false)

  const handleSelect = (selection: string) => {
    if (selection === 'none') {
      setIsDismissed(true) // Hide immediately
    }
    onSelect(selection)
  }

  // Early return if dismissed
  if (isDismissed) return null

  return (
    <div className="mt-4 space-y-2">
      <div className="text-xs text-zinc-400 mb-3">
        Select the business type that best describes your business:
      </div>

      {/* Suggestion Cards */}
      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.number}
            onClick={() => handleSelect(suggestion.number.toString())}
            className="w-full text-left group relative"
            aria-label={`Select ${suggestion.title}`}
          >
            <div className="flex items-start gap-3 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg hover:border-primary-500/50 hover:bg-zinc-800/70 transition-all duration-200 cursor-pointer">
              {/* Number Badge */}
              <div className="flex-shrink-0 w-8 h-8 bg-primary-600/20 text-primary-400 rounded-full flex items-center justify-center text-sm font-semibold">
                {suggestion.number}
              </div>

              {/* Business Type Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg flex-shrink-0">{suggestion.icon || '🏢'}</span>
                  <span className="font-semibold text-white group-hover:text-primary-300 transition-colors">
                    {suggestion.title}
                  </span>
                </div>
                {suggestion.description && (
                  <div className="text-xs text-zinc-400 mt-1 ml-8">{suggestion.description}</div>
                )}
                {suggestion.category && (
                  <div className="text-xs text-zinc-500 mt-1 ml-8 font-medium">
                    {/* ✅ FIX: Handle category as either string or object */}
                    {typeof suggestion.category === 'string'
                      ? suggestion.category
                      : (suggestion.category as any)?.name || (suggestion.category as any)?.title || ''}
                  </div>
                )}
              </div>

              {/* Hover Indicator */}
              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-2 h-2 bg-primary-500 rounded-full" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* None of these button */}
      <button
        onClick={() => handleSelect('none')}
        className="w-full mt-3 p-3 bg-zinc-800/30 border border-zinc-700/30 rounded-lg hover:border-zinc-600 hover:bg-zinc-800/50 transition-all duration-200 text-center"
        aria-label="None of these business types match"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-300 hover:text-white">
          <X className="w-4 h-4" />
          <span>None of these match - let me type it</span>
        </div>
      </button>
    </div>
  )
}
