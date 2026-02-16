import React from 'react'

interface SuggestionPillsProps {
  suggestions: string[]
  onSelect: (suggestion: string) => void
  disabled?: boolean
}

export const SuggestionPills: React.FC<SuggestionPillsProps> = ({
  suggestions,
  onSelect,
  disabled = false,
}) => {
  if (suggestions.length === 0) return null

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="px-3 py-1.5 bg-muted/50 hover:bg-foreground/10 border border-foreground/10 hover:border-foreground/20 rounded-full text-xs text-muted-foreground hover:text-foreground transition-all duration-200 hover:shadow-md hover:shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
