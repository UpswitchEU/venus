import { X } from 'lucide-react'
import React, { useState } from 'react'
import {
  type BusinessTypeCategoryLike,
  formatBusinessTypeCategory,
} from '../utils/businessTypeCategory'

export interface BusinessTypeSuggestion {
  number: number
  id: string
  title: string
  description?: string
  industry?: string
  category?: BusinessTypeCategoryLike
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
      <div className="text-xs text-muted-foreground mb-3">
        Select the business type that best describes your business:
      </div>

      {/* Suggestion Cards */}
      <div className="space-y-2">
        {suggestions.map((suggestion) => {
          const categoryLabel = formatBusinessTypeCategory(suggestion.category)

          return (
            <button
              key={suggestion.number}
              onClick={() => handleSelect(suggestion.number.toString())}
              className="w-full text-left group relative"
              aria-label={`Select ${suggestion.title}`}
            >
              <div className="flex items-start gap-3 p-3 bg-muted border border-foreground/20 rounded-lg hover:border-primary/30 hover:bg-muted/80 transition-all duration-200 cursor-pointer">
                {/* Number Badge */}
                <div className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                  {suggestion.number}
                </div>

                {/* Business Type Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg flex-shrink-0">{suggestion.icon || '🏢'}</span>
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {suggestion.title}
                    </span>
                  </div>
                  {suggestion.description && (
                    <div className="text-xs text-muted-foreground mt-1 ml-8">
                      {suggestion.description}
                    </div>
                  )}
                  {categoryLabel && (
                    <div className="text-xs text-muted-foreground mt-1 ml-8 font-medium">
                      {categoryLabel}
                    </div>
                  )}
                </div>

                {/* Hover Indicator */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-2 h-2 bg-primary rounded-full" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* None of these button */}
      <button
        onClick={() => handleSelect('none')}
        className="w-full mt-3 p-3 bg-muted border border-foreground/20 rounded-lg hover:border-foreground/30 hover:bg-muted/80 transition-all duration-200 text-center"
        aria-label="None of these business types match"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
          <span>None of these match - let me type it</span>
        </div>
      </button>
    </div>
  )
}
