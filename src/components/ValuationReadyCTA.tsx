/**
 * Valuation Ready CTA Component
 *
 * Displays a special call-to-action button when the user has provided enough data
 * to generate a valuation report.
 */

import { motion } from 'framer-motion'
import React from 'react'

export interface ValuationReadyCTAProps {
  question: string // The summary message
  buttonText?: string // Button label (default: "Create Valuation Report")
  onConfirm: () => void // Called when user clicks the button
  timestamp?: Date
}

export const ValuationReadyCTA: React.FC<ValuationReadyCTAProps> = ({
  question,
  buttonText = 'Create Valuation Report',
  onConfirm,
  timestamp,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex flex-col items-start gap-2 max-w-[88%]"
    >
      {/* No avatar — conversational bubble. CTA chip below carries the action. */}
      <div className="rounded-2xl rounded-tl-md px-5 py-4 bg-foreground/[0.03] border border-foreground/[0.08]">
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
          {question}
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {buttonText}
      </button>

      {timestamp && (
        <div className="text-xs text-foreground/40 ml-2">
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </motion.div>
  )
}

export default ValuationReadyCTA
