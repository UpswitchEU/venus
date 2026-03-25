import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CheckCircle, ListChecks, XCircle } from 'lucide-react'
import React from 'react'
import { springSnappy } from '@/design-system/components/motion'

interface Suggestion {
  text: string
  confidence: number
  reason: string
}

interface SuggestionChipsProps {
  suggestions: Suggestion[]
  originalValue: string
  onSelect: (suggestion: string) => void
  onDismiss: () => void
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  suggestions,
  originalValue,
  onSelect,
  onDismiss,
}) => {
  return (
    <div className="suggestion-chips-container my-4">
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5 mb-3"
      >
        <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_10px_hsl(var(--primary)/0.1)]">
          <ListChecks className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-[13px] font-medium text-muted-foreground tracking-wide">
          Did you mean one of these?
        </p>
      </motion.div>

      <div className="flex flex-wrap gap-2.5 ml-1">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={`suggestion-${index}`}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ ...springSnappy, delay: index * 0.05 }}
              onClick={() => onSelect(suggestion.text)}
              className="group relative flex items-center gap-2.5 px-4 py-2.5 bg-muted border border-foreground/5 rounded-xl hover:bg-foreground/10 hover:border-primary/30 active:scale-[0.98] transition-all duration-200 shadow-sm hover:shadow-lg backdrop-blur-sm"
            >
              {/* Suggestion Text */}
              <span className="text-[14px] font-medium text-foreground group-hover:text-foreground transition-colors">
                {suggestion.text}
              </span>

              {/* Confidence Indicator */}
              {suggestion.confidence > 0.9 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/10">
                  <CheckCircle className="w-3 h-3 text-primary" />
                </span>
              )}

              {/* Hover Arrow */}
              <ArrowRight className="w-3.5 h-3.5 text-primary opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />

              {/* Hover Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-background text-foreground text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-foreground/10 shadow-xl z-10">
                {suggestion.reason}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-background"></div>
              </div>
            </motion.button>
          ))}

          {/* Keep Original Button (hide if empty) */}
          {originalValue && originalValue.trim().length > 0 && (
            <motion.button
              key="keep-original"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...springSnappy, delay: suggestions.length * 0.05 }}
              onClick={onDismiss}
              className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-foreground/5 rounded-xl hover:bg-foreground/5 hover:border-foreground/10 active:scale-[0.98] transition-all duration-200 group"
            >
              <span className="text-[13px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                Keep "{originalValue}"
              </span>
              <XCircle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
