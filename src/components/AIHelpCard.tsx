/**
 * AI Help Card Component
 *
 * Displays AI-powered contextual help when users ask questions during the conversation flow.
 * Styled distinctly from regular questions to clearly indicate it's AI assistance.
 */

import { motion } from 'framer-motion'
import { ArrowRight, Bot, Lightbulb, TrendingUp } from 'lucide-react'
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
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] mr-auto">
        <div className="flex items-start gap-3">
          {/* AI Avatar - Distinct from regular bot */}
          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-accent-500/20 to-accent-600/20 rounded-full flex items-center justify-center border border-accent-400/30 shadow-lg shadow-accent-500/20 mt-1">
            <Bot className="w-4 h-4 text-accent-300" />
          </div>

          <div className="flex flex-col gap-1">
            {/* Main AI Help Card */}
            <div className="rounded-2xl rounded-tl-sm px-5 py-4 bg-gradient-to-br from-accent-900/20 via-accent-800/10 to-accent-900/20 border border-accent-400/20 shadow-lg backdrop-blur-sm">
              {/* Header Badge */}
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-accent-400/20">
                <Lightbulb className="w-4 h-4 text-accent-300" />
                <span className="text-xs font-semibold text-accent-300 uppercase tracking-wider">
                  AI Assistant
                </span>
              </div>

              {/* Answer */}
              <div className="space-y-3">
                <div className="text-[15px] leading-relaxed text-zinc-100">{answer}</div>

                {/* Reasoning */}
                {reasoning && (
                  <div className="flex items-start gap-2 p-3 bg-accent-500/10 rounded-lg border border-accent-400/20">
                    <TrendingUp className="w-4 h-4 text-accent-300 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-accent-200 leading-relaxed">
                      <span className="font-medium text-accent-300">Why it matters: </span>
                      {reasoning}
                    </div>
                  </div>
                )}

                {/* Example */}
                {example && (
                  <div className="p-3 bg-accent-500/10 rounded-lg border border-accent-400/20">
                    <div className="text-xs font-medium text-accent-300 mb-1.5 uppercase tracking-wider">
                      Example:
                    </div>
                    <div className="text-sm text-accent-100 leading-relaxed">{example}</div>
                  </div>
                )}

                {/* Nudge */}
                <div className="flex items-start gap-2 pt-3 mt-3 border-t border-accent-400/20">
                  <ArrowRight className="w-4 h-4 text-accent-300 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-accent-200 leading-relaxed">{nudge}</div>
                </div>
              </div>
            </div>

            {/* Timestamp */}
            {timestamp && (
              <div className="text-xs text-zinc-500 ml-1 flex items-center gap-1">
                <span className="text-accent-400">●</span>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default AIHelpCard
