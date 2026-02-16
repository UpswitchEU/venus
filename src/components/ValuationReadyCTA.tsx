/**
 * Valuation Ready CTA Component
 *
 * Displays a special call-to-action button when the user has provided enough data
 * to generate a valuation report.
 */

import { motion } from 'framer-motion'
import { Bot, CheckCircle, TrendingUp } from 'lucide-react'
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
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] mr-auto">
        <div className="flex items-start gap-3">
          {/* Bot Avatar */}
          <div className="flex-shrink-0 w-8 h-8 bg-foreground/10 rounded-full flex items-center justify-center border border-foreground/10 shadow-sm mt-1">
            <Bot className="w-4 h-4 text-primary" />
          </div>

          <div className="flex flex-col gap-1 flex-1">
            {/* Main CTA Card */}
            <div className="rounded-2xl rounded-tl-sm px-6 py-5 bg-foreground/5 text-foreground border border-foreground/10 shadow-sm backdrop-blur-sm">
              {/* Header Badge */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-foreground/10">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-primary uppercase tracking-wider">
                  Ready for Valuation
                </span>
              </div>

              {/* Summary Message */}
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground mb-5">
                {question}
              </div>

              {/* CTA Button */}
              <button
                onClick={onConfirm}
                className="w-full py-4 px-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
              >
                <TrendingUp className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span>{buttonText}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="group-hover:translate-x-1 transition-transform"
                >
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>

              {/* Optional: Progress indicators */}
              <div className="mt-4 pt-4 border-t border-primary/10">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Estimated completion time: 2-3 minutes</span>
                  <span className="text-primary">● All data collected</span>
                </div>
              </div>
            </div>

            {/* Timestamp */}
            {timestamp && (
              <div className="text-xs text-muted-foreground ml-1 flex items-center gap-1">
                <span className="text-primary">●</span>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ValuationReadyCTA
