import { Building2, X } from 'lucide-react'
import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { KBOSuggestion } from './utils/kboParsing'

interface KBOSuggestionsListProps {
  suggestions: KBOSuggestion[]
  onSelect: (selection: string) => void
}

export const KBOSuggestionsList: React.FC<KBOSuggestionsListProps> = ({
  suggestions,
  onSelect,
}) => {
  const t = useTranslations('forms.kboLookup')
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
      <div className="text-xs text-muted-foreground mb-3">{t('selectCompanyFromList')}</div>

      {/* Suggestion Cards */}
      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.number}
            onClick={() => handleSelect(suggestion.number.toString())}
            className="w-full text-left group relative"
            aria-label={`Select ${suggestion.companyName}`}
          >
            <div className="flex items-start gap-3 p-3 bg-muted/50 border border-foreground/10 rounded-lg hover:border-primary/50 hover:bg-muted/70 transition-all duration-200 cursor-pointer">
              {/* Number Badge */}
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                {suggestion.number}
              </div>

              {/* Company Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {suggestion.companyName}
                  </span>
                </div>
                {suggestion.registrationNumber && (
                  <div className="text-xs text-muted-foreground mt-1 ml-6">
                    {suggestion.registrationNumber}
                  </div>
                )}
              </div>

              {/* Hover Indicator */}
              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-2 h-2 bg-primary rounded-full" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* None of these button */}
      <button
        onClick={() => handleSelect('none')}
        className="w-full mt-3 p-3 bg-muted/30 border border-foreground/10 rounded-lg hover:border-foreground/20 hover:bg-muted/50 transition-all duration-200 text-center"
        aria-label="None of these companies match"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
          <span>{t('noneOfTheseMatch')}</span>
        </div>
      </button>
    </div>
  )
}
