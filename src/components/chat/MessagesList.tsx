/**
 * MessagesList Component
 *
 * Single Responsibility: Render list of chat messages
 * Extracted from StreamingChat.tsx to follow SRP
 *
 * @module components/chat/MessagesList
 */

import { AnimatePresence } from 'framer-motion'
import React from 'react'
import type { Message } from '../../types/message'
import { TypingIndicator } from '../TypingIndicator'
import { MessageItem } from './MessageItem'

export interface MessagesListProps {
  messages: Message[]
  isTyping: boolean
  isThinking: boolean
  isInitializing: boolean
  onSuggestionSelect: (suggestion: string) => void
  onSuggestionDismiss: () => void
  onClarificationConfirm: (messageId: string) => void
  onClarificationReject: (messageId: string) => void
  onKBOSuggestionSelect: (selection: string) => void
  onBusinessTypeSuggestionSelect: (selection: string) => void
  onValuationStart?: () => void
  onRetry?: (messageId: string) => void | Promise<void>
  calculateOption?: any
  valuationPreview?: any
  onCalculate?: () => void | Promise<void>
  isCalculating?: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  onContinueConversation?: () => void
  onViewReport?: () => void
  onNormalizeEbitda?: () => void
  onRecalculateValuation?: () => void
}

/**
 * MessagesList Component
 *
 * Renders:
 * - List of messages
 * - Typing indicator
 * - Calculate button (if applicable)
 * - Valuation preview (if applicable)
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders when messages haven't changed
 */
export const MessagesList: React.FC<MessagesListProps> = React.memo(
  ({
    messages,
    isTyping,
    isThinking,
    isInitializing,
    onSuggestionSelect,
    onSuggestionDismiss,
    onClarificationConfirm,
    onClarificationReject,
    onKBOSuggestionSelect,
    onBusinessTypeSuggestionSelect,
    onValuationStart,
    onRetry,
    calculateOption,
    valuationPreview,
    onCalculate,
    isCalculating = false,
    messagesEndRef,
    onContinueConversation,
    onViewReport,
    onNormalizeEbitda,
    onRecalculateValuation,
  }) => {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Messages */}
        <AnimatePresence initial={false} mode="popLayout">
          {messages
            .filter((message) => {
              // CRITICAL FIX: Filter out empty messages to prevent empty bubbles
              // BUT: Allow messages with special metadata (e.g., confirmation cards, summary)
              // that intentionally have empty content but should still be displayed
              if (message.metadata?.is_business_type_confirmation === true) {
                return true // Always show business type confirmation cards even with empty content
              }
              if (message.metadata?.is_company_name_confirmation === true) {
                return true // Always show company name confirmation cards even with empty content
              }
              if (message.metadata?.is_summary === true) {
                return true // Always show summary block even with empty content
              }
              // Only show messages that have actual content (not just whitespace)
              return message.content && message.content.trim().length > 0
            })
            .map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onSuggestionSelect={onSuggestionSelect}
                onSuggestionDismiss={onSuggestionDismiss}
                onClarificationConfirm={onClarificationConfirm}
                onClarificationReject={onClarificationReject}
                onKBOSuggestionSelect={onKBOSuggestionSelect}
                onBusinessTypeSuggestionSelect={onBusinessTypeSuggestionSelect}
                onValuationStart={onValuationStart}
                onRetry={onRetry}
                isTyping={isTyping}
                isThinking={isThinking}
                onContinueConversation={onContinueConversation}
                onViewReport={onViewReport}
                onNormalizeEbitda={onNormalizeEbitda}
                onRecalculateValuation={onRecalculateValuation}
              />
            ))}
        </AnimatePresence>

        {/* Typing Indicator - Show during initialization or when typing */}
        <AnimatePresence>
          {(isTyping || (isInitializing && messages.length === 0)) && (
            <div className="flex justify-start" key="typing-indicator">
              <TypingIndicator />
            </div>
          )}
        </AnimatePresence>

        {/* Calculate Now Button */}
        {calculateOption && onCalculate && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                onCalculate()
              }}
              disabled={isCalculating}
              className="px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl hover:shadow-primary-500/30"
            >
              {isCalculating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Calculating...</span>
                </>
              ) : (
                <>
                  <span>Calculate Valuation</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}

        {/* Valuation Preview */}
        {valuationPreview && (
          <div className="bg-primary-600/10 p-4 rounded-lg border border-primary-600/30">
            <h3 className="font-semibold text-primary-300 mb-2">Valuation Preview</h3>
            <div className="text-2xl font-bold text-primary-200">
              ${valuationPreview.value?.toLocaleString()}
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Fast path: Quick checks first
    if (
      prevProps.messages.length !== nextProps.messages.length ||
      prevProps.isTyping !== nextProps.isTyping ||
      prevProps.isThinking !== nextProps.isThinking ||
      prevProps.isInitializing !== nextProps.isInitializing ||
      prevProps.calculateOption !== nextProps.calculateOption ||
      prevProps.valuationPreview !== nextProps.valuationPreview
    ) {
      return false // Re-render needed
    }

    // Only check message IDs if length matches (optimized: check last message first for streaming)
    const lastIdx = prevProps.messages.length - 1
    if (lastIdx >= 0) {
      const prevLast = prevProps.messages[lastIdx]
      const nextLast = nextProps.messages[lastIdx]
      if (prevLast?.id !== nextLast?.id || prevLast?.content !== nextLast?.content) {
        return false // Re-render needed
      }
    }

    // Check callbacks (should be stable, but verify)
    if (
      prevProps.onRetry !== nextProps.onRetry ||
      prevProps.onSuggestionSelect !== nextProps.onSuggestionSelect ||
      prevProps.onSuggestionDismiss !== nextProps.onSuggestionDismiss ||
      prevProps.onClarificationConfirm !== nextProps.onClarificationConfirm ||
      prevProps.onClarificationReject !== nextProps.onClarificationReject ||
      prevProps.onKBOSuggestionSelect !== nextProps.onKBOSuggestionSelect ||
      prevProps.onBusinessTypeSuggestionSelect !== nextProps.onBusinessTypeSuggestionSelect ||
      prevProps.onValuationStart !== nextProps.onValuationStart
    ) {
      return false // Re-render needed
    }

    return true // No re-render needed
  }
)

MessagesList.displayName = 'MessagesList'
