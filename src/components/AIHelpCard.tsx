/**
 * AI Help Card Component
 *
 * Displays AI-powered contextual help when users ask questions during the conversation flow.
 * Styled distinctly from regular questions to clearly indicate it's AI assistance.
 */

import { motion } from 'framer-motion'
import React from 'react'

export interface AIHelpCardProps {
  answer: string
  reasoning?: string
  example?: string
  nudge: string
  timestamp?: Date
}

export const AIHelpCard: React.FC<AIHelpCardProps> = ({
  answer,
  reasoning,
  example,
  nudge,
  timestamp,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex flex-col items-start gap-2 max-w-[88%]"
    >
      {/* No avatar — conversational bubble (Cursor / Lovable / Ilara). */}
      <div className="rounded-2xl rounded-tl-md px-5 py-4 bg-foreground/[0.03] border border-foreground/[0.08]">
        <div className="space-y-3">
          <div className="text-[15px] leading-relaxed text-foreground">{answer}</div>

          {reasoning && (
            <div className="text-sm text-foreground/70 leading-relaxed">
              <span className="font-medium text-foreground">Why it matters: </span>
              {reasoning}
            </div>
          )}

          {example && (
            <div className="text-sm text-foreground/70 leading-relaxed">
              <span className="font-medium text-foreground">Example: </span>
              {example}
            </div>
          )}

          <div className="text-sm text-foreground/70 leading-relaxed pt-2 mt-2 border-t border-foreground/[0.08]">
            {nudge}
          </div>
        </div>
      </div>

      {timestamp && (
        <div className="text-xs text-foreground/40 ml-2">
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </motion.div>
  )
}

export default AIHelpCard
