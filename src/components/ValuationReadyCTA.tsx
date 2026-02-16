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
          <div className="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/10 shadow-sm mt-1">
            <Bot className="w-4 h-4 text-primary-400" />
          </div>

          <div className="flex flex-col gap-1 flex-1">
            {/* Main CTA Card */}
            <div className="rounded-2xl rounded-tl-sm px-6 py-5 bg-white/5 text-white border border-white/10 shadow-sm backdrop-blur-sm">
              {/* Header Badge */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                <CheckCircle className="w-5 h-5 text-primary-400" />
                <span className="text-sm font-semibold text-primary-400 uppercase tracking-wider">
                  Ready for Valuation
                </span>
              </div>

              {/* Summary Message */}
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-100 mb-5">
                {question}
              </div>

              {/* CTA Button */}
              <button
                onClick={onConfirm}
                className="w-full py-4 px-6 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white rounded-xl font-semibold text-base shadow-lg hover:shadow-xl hover:shadow-primary-500/30 transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 group"
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
              <div className="mt-4 pt-4 border-t border-primary-400/10">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Estimated completion time: 2-3 minutes</span>
                  <span className="text-primary-400">● All data collected</span>
                </div>
              </div>
            </div>

            {/* Timestamp */}
            {timestamp && (
              <div className="text-xs text-zinc-500 ml-1 flex items-center gap-1">
                <span className="text-primary-400">●</span>
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
