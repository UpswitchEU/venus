/**
 * MessageItem Component
 *
 * Single Responsibility: Render individual chat messages with all their variants
 * Extracted from StreamingChat.tsx to follow SRP
 *
 * @module components/chat/MessageItem
 */

import { motion } from 'framer-motion'
import { Bot, CheckCircle, Loader2 } from 'lucide-react'
import React, { useCallback } from 'react'
import { AI_CONFIG } from '../../config'
import { ConversationSummaryBlock } from '../../features/conversational/components/ConversationSummaryBlock'
import type { Message } from '../../types/message'
import { debugLogger } from '../../utils/debugLogger'
import { AIHelpCard } from '../AIHelpCard'
import { BusinessTypeConfirmationCard } from '../BusinessTypeConfirmationCard'
import { BusinessTypeSuggestionsList } from '../BusinessTypeSuggestionsList'
import { CompanyNameConfirmationCard } from '../CompanyNameConfirmationCard'
import { KBOSuggestionsList } from '../KBOSuggestionsList'
import { SuggestionChips } from '../SuggestionChips'
import {
  type BusinessTypeSuggestion,
  hasBusinessTypeSuggestions,
  parseBusinessTypeSuggestions,
} from '../utils/businessTypeParsing'
import { hasKBOSuggestions, type KBOSuggestion, parseKBOSuggestions } from '../utils/kboParsing'
import { ValuationReadyCTA } from '../ValuationReadyCTA'
import { ErrorMessage } from './ErrorMessage'

export interface MessageItemProps {
  message: Message
  onSuggestionSelect: (suggestion: string) => void
  onSuggestionDismiss: () => void
  onClarificationConfirm: (messageId: string) => void
  onClarificationReject: (messageId: string) => void
  onKBOSuggestionSelect: (selection: string) => void
  onBusinessTypeSuggestionSelect: (selection: string) => void
  onValuationStart?: () => void
  onRetry?: (messageId: string) => void | Promise<void>
  isTyping?: boolean
  isThinking?: boolean
  onContinueConversation?: () => void
  onViewReport?: () => void
  onNormalizeEbitda?: () => void
  onRecalculateValuation?: () => void
}

/**
 * MessageItem Component
 *
 * Renders individual chat messages with support for:
 * - User messages
 * - AI messages
 * - Special message types (AI Help, Valuation CTA, Confirmations)
 * - Suggestion lists (Business Type, KBO)
 * - Clarification buttons
 */
export const MessageItem = React.memo<MessageItemProps>(
  ({
    message,
    onSuggestionSelect,
    onSuggestionDismiss,
    onClarificationConfirm,
    onClarificationReject,
    onKBOSuggestionSelect,
    onBusinessTypeSuggestionSelect,
    onValuationStart,
    onRetry,
    isTyping = false,
    isThinking = false,
    onContinueConversation,
    onViewReport,
    onNormalizeEbitda,
    onRecalculateValuation,
  }) => {
    // Safe metadata access helpers
    const getMetadataValue = useCallback(
      <T,>(key: string, defaultValue?: T): T | undefined => {
        const metadata = message.metadata as Record<string, unknown> | undefined
        return (metadata?.[key] as T) ?? defaultValue
      },
      [message.metadata]
    )

    const getMetadataString = useCallback(
      (key: string, defaultValue = ''): string => {
        return getMetadataValue<string>(key, defaultValue) || defaultValue
      },
      [getMetadataValue]
    )

    const getMetadataNumber = (key: string, defaultValue?: number): number | undefined => {
      return getMetadataValue<number>(key, defaultValue)
    }

    // Check if this is an AI help message
    const isAIHelp = getMetadataValue<boolean>('is_ai_help') === true
    const aiResponse = getMetadataValue<Record<string, unknown>>('ai_response')

    // Check if this is a Valuation Ready CTA
    const isValuationReadyCTA = getMetadataString('input_type') === 'cta_button'
    const buttonText = getMetadataString('button_text', 'Create Valuation Report')

    // Strip any stray inline typing indicators that may be present in message content
    const displayContent = React.useMemo(() => {
      if (!message.content) return message.content
      return message.content
        .replace(/<span class="[^"]*animate-pulse[^"]*"><\/span>/g, '')
        .trimEnd()
    }, [message.content])

    // Detect business type suggestions in the message
    const businessTypeSuggestions = React.useMemo((): BusinessTypeSuggestion[] | null => {
      // First check for structured suggestions in metadata (preferred - more reliable)
      const structuredSuggestions = getMetadataValue<BusinessTypeSuggestion[]>(
        'business_type_suggestions'
      )
      if (
        structuredSuggestions &&
        Array.isArray(structuredSuggestions) &&
        structuredSuggestions.length > 0
      ) {
        return structuredSuggestions.map((s, idx) => {
          // ✅ FIX: Handle category as either string or object
          let categoryValue: string | undefined
          if (typeof s.category === 'string') {
            categoryValue = s.category
          } else if (s.category && typeof s.category === 'object') {
            categoryValue = (s.category as any)?.name || (s.category as any)?.title || undefined
          }
          
          return {
            number: s.number || idx + 1,
            id: s.id || String(s.number || idx + 1),
            title: s.title || '',
            description: s.description,
            industry: s.industry,
            category: categoryValue,
            icon: s.icon,
          }
        })
      }

      // Fallback: parse from clarification message text
      const clarificationMsg = getMetadataString('clarification_message')
      if (clarificationMsg && hasBusinessTypeSuggestions(clarificationMsg)) {
        return parseBusinessTypeSuggestions(clarificationMsg)
      }
      // Check message content directly (primary source)
      if (hasBusinessTypeSuggestions(message.content)) {
        return parseBusinessTypeSuggestions(message.content)
      }
      return null
    }, [message.content, message.metadata, getMetadataString, getMetadataValue])

    const hasBusinessTypeSuggestionsInMessage =
      businessTypeSuggestions !== null && businessTypeSuggestions.length > 0

    // Render business type suggestions element (extracted to fix TypeScript inference)
    const renderBusinessTypeSuggestions = useCallback(() => {
      if (!hasBusinessTypeSuggestionsInMessage || !businessTypeSuggestions) {
        return null as React.ReactNode
      }
      return (
        <div className="mt-3">
          <BusinessTypeSuggestionsList
            suggestions={businessTypeSuggestions}
            onSelect={onBusinessTypeSuggestionSelect}
          />
        </div>
      ) as React.ReactNode
    }, [
      hasBusinessTypeSuggestionsInMessage,
      businessTypeSuggestions,
      onBusinessTypeSuggestionSelect,
    ])

    // Detect KBO suggestions in the message
    const kboSuggestions = React.useMemo((): KBOSuggestion[] | null => {
      // First check for structured suggestions in metadata (preferred - more reliable)
      const structuredSuggestions =
        getMetadataValue<Array<{ company_name: string; registration_number?: string }>>(
          'kbo_suggestions'
        )
      if (
        structuredSuggestions &&
        Array.isArray(structuredSuggestions) &&
        structuredSuggestions.length > 0
      ) {
        return structuredSuggestions.map((s, idx) => ({
          number: idx + 1,
          companyName: s.company_name || '',
          registrationNumber: s.registration_number,
        }))
      }

      // Fallback: parse from clarification message text
      const clarificationMsg = getMetadataString('clarification_message')
      if (clarificationMsg && hasKBOSuggestions(clarificationMsg)) {
        return parseKBOSuggestions(clarificationMsg)
      }
      // Check message content directly (primary source)
      if (hasKBOSuggestions(message.content)) {
        return parseKBOSuggestions(message.content)
      }
      return null
    }, [message.content, message.metadata, getMetadataString, getMetadataValue])

    const hasKBOSuggestionsInMessage = kboSuggestions !== null && kboSuggestions.length > 0

    // Render AI Help Card if this is an AI help response
    if (isAIHelp && aiResponse) {
      const aiResponseData = aiResponse as Record<string, unknown>
      return (
        <AIHelpCard
          answer={getMetadataString('answer', aiResponseData.answer as string) || message.content}
          reasoning={getMetadataString('reasoning', aiResponseData.reasoning as string)}
          example={getMetadataString('example', aiResponseData.example as string)}
          nudge={getMetadataString('nudge', aiResponseData.nudge as string) || ''}
          timestamp={message.timestamp}
        />
      )
    }

    // Render Valuation Ready CTA if this is a CTA button
    if (isValuationReadyCTA) {
      return (
        <ValuationReadyCTA
          question={displayContent}
          buttonText={buttonText}
          onConfirm={() => {
            // Check if this is valuation confirmation - if so, trigger loading state immediately
            const isValuationConfirmation =
              getMetadataString('clarification_field') === 'valuation_confirmed'
            if (isValuationConfirmation && onValuationStart) {
              onValuationStart()
            }
            // Send "yes" to confirm the valuation
            onClarificationConfirm(message.id)
          }}
          timestamp={message.timestamp}
        />
      )
    }

    // Check if this is a business type confirmation
    const isBusinessTypeConfirmation =
      getMetadataValue<boolean>('is_business_type_confirmation') === true

    if (isBusinessTypeConfirmation) {
      // Safe access to metadata properties
      const industry =
        getMetadataString('industry_mapping') || getMetadataString('industry') || undefined

      return (
        <BusinessTypeConfirmationCard
          businessType={getMetadataString('business_type', '')}
          industry={industry}
          category={getMetadataString('category')}
          icon={getMetadataString('icon')}
          confidence={getMetadataNumber('confidence')}
          timestamp={message.timestamp}
        />
      )
    }

    // Check if this is a summary message (import summary from manual flow)
    const isSummaryMessage = getMetadataValue<boolean>('is_summary') === true
    const collectedData = getMetadataValue<Record<string, any>>('collected_data')

    if (isSummaryMessage && collectedData) {
      // Get sessionId from metadata or other sources
      const sessionId = getMetadataString('session_id') || undefined

      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] mr-auto w-full">
            <ConversationSummaryBlock
              sessionId={sessionId}
              collectedData={collectedData}
              onContinue={onContinueConversation}
              onViewReport={onViewReport}
              onNormalizeEbitda={onNormalizeEbitda}
              onRecalculateValuation={onRecalculateValuation}
            />
          </div>
        </div>
      )
    }

    // Check if this is a company name KBO confirmation
    const isCompanyNameConfirmation =
      getMetadataValue<boolean>('is_company_name_confirmation') === true

    if (isCompanyNameConfirmation) {
      // Safe access to metadata properties

      debugLogger.log('[MessageItem]', 'Rendering CompanyNameConfirmationCard', {
        companyName: getMetadataString('company_name') || message.content || '',
        registrationNumber: getMetadataString('registration_number'),
        legalForm: getMetadataString('legal_form'),
        hasMetadata: !!message.metadata,
        metadataKeys: message.metadata ? Object.keys(message.metadata) : [],
      })

      return (
        <CompanyNameConfirmationCard
          companyName={getMetadataString('company_name') || message.content || ''}
          registrationNumber={getMetadataString('registration_number')}
          legalForm={getMetadataString('legal_form')}
          foundingYear={getMetadataNumber('founding_year')}
          industryDescription={getMetadataString('industry_description')}
          confidence={getMetadataNumber('confidence')}
          timestamp={message.timestamp}
        />
      )
    }

    // Handle system error messages with retry functionality
    if (message.type === 'system' && message.metadata?.error_type) {
      const errorType = getMetadataString('error_type')
      const errorCode = getMetadataString('error_code')
      const errorDetails = getMetadataString('error_details')
      const isRetrying = getMetadataValue<boolean>('is_retrying') === true

      // Create error object for ErrorMessage component
      const errorObject = errorCode
        ? {
            code: errorCode,
            message: message.content.replace(/^Error:\s*/i, ''),
          }
        : undefined

      return (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex justify-start"
        >
          <div className="max-w-[85%] mr-auto">
            <ErrorMessage
              message={message.content.replace(/^Error:\s*/i, '')}
              error={errorObject}
              onRetry={onRetry ? () => onRetry(message.id) : undefined}
              isRetrying={isRetrying}
              details={errorDetails}
            />
          </div>
        </motion.div>
      )
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
      >
        <div className={`max-w-[85%] ${message.type === 'user' ? 'ml-auto' : 'mr-auto'}`}>
          {message.type === 'user' ? (
            // User message - simple structure without avatar
            <div className="flex flex-col gap-1 items-end">
              <div className="rounded-2xl rounded-tr-sm px-5 py-3.5 bg-primary-600 text-white shadow-md">
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">
                  {message.content}
                </div>
              </div>
              <div className="text-xs text-zinc-500 text-right pr-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ) : (
            // AI message - with bot avatar
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/10 shadow-sm mt-1">
                {/* Show loader when streaming, typing, or thinking, otherwise show bot icon */}
                {message.isStreaming || isTyping || isThinking ? (
                  <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
                ) : (
                  <Bot className="w-4 h-4 text-primary-400" />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="rounded-2xl rounded-tl-sm px-5 py-3.5 bg-white/5 text-white border border-white/10 shadow-sm backdrop-blur-sm">
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-100">
                    {displayContent}
                  </div>

                  {/* Suggestion chips - Show for AI messages with suggestions metadata */}
                  {(() => {
                    // Check for suggestions in metadata (backend sends as 'suggestions', frontend may store as 'options')
                    const suggestions =
                      getMetadataValue<unknown[]>('suggestions') ||
                      getMetadataValue<unknown[]>('options') ||
                      []
                    const suggestionType = getMetadataString('suggestion_type')

                    // Only show general suggestions (not business_type or kbo - those have their own components)
                    if (
                      suggestions.length > 0 &&
                      suggestionType !== 'business_type' &&
                      suggestionType !== 'kbo'
                    ) {
                      return (
                        <div className="mt-4">
                          <SuggestionChips
                            suggestions={(suggestions || []).map((s: unknown) => {
                              // Handle both string suggestions and object suggestions
                              if (typeof s === 'string') {
                                return { text: s, confidence: 0, reason: '' }
                              }
                              return {
                                text:
                                  (s as any)?.text ||
                                  (s as any)?.company_name ||
                                  (s as any)?.title ||
                                  String(s),
                                confidence: (s as any)?.confidence || 0,
                                reason: (s as any)?.reason || '',
                              }
                            })}
                            originalValue={getMetadataString('originalValue', '')}
                            onSelect={onSuggestionSelect}
                            onDismiss={onSuggestionDismiss}
                          />
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* Business Type Suggestions List */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {renderBusinessTypeSuggestions() as any}

                  {/* KBO Suggestions List */}
                  {/* Check if this message comes after "none" was clicked - hide suggestions if so */}
                  {(() => {
                    const isAfterNoneResponse =
                      message.content?.includes('No problem!') &&
                      message.content?.includes("What's your company name?")
                    return (
                      hasKBOSuggestionsInMessage &&
                      kboSuggestions &&
                      !isAfterNoneResponse && (
                        <div className="mt-3">
                          <KBOSuggestionsList
                            suggestions={kboSuggestions}
                            onSelect={onKBOSuggestionSelect}
                          />
                        </div>
                      )
                    )
                  })()}

                  {/* Generic Clarification confirmation buttons (only if not KBO/BusinessType suggestions) */}
                  {message.metadata?.needs_confirmation &&
                    !hasKBOSuggestionsInMessage &&
                    !hasBusinessTypeSuggestionsInMessage &&
                    message.metadata?.collected_field !== 'business_type' &&
                    message.metadata?.collected_field !== 'company_name' && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-col gap-2 mt-4 p-3 bg-white/5 rounded-xl border border-white/10"
                      >
                        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">
                          Confirm Details
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => onClarificationConfirm(message.id)}
                            className="flex-1 py-2.5 px-4 bg-primary-600/20 hover:bg-primary-600/30 border border-primary-500/30 hover:border-primary-500/50 text-primary-300 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Yes, that's correct
                          </button>
                          <button
                            onClick={() => onClarificationReject(message.id)}
                            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300 rounded-lg text-sm font-medium transition-all active:scale-[0.98]"
                          >
                            No, edit
                          </button>
                        </div>
                      </motion.div>
                    )}

                  {/* Help text */}
                  {AI_CONFIG.showHelpText && getMetadataString('help_text') && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-zinc-400 flex items-start gap-1.5">
                        <span className="mt-0.5">ℹ️</span>
                        <span className="leading-relaxed">{getMetadataString('help_text')}</span>
                      </p>
                    </div>
                  )}

                  {/* Valuation narrative */}
                  {AI_CONFIG.showNarratives && getMetadataString('valuation_narrative') && (
                    <div className="mt-3 p-3 bg-primary-600/10 rounded-xl border border-primary-600/20">
                      <h4 className="text-xs font-semibold text-primary-300 mb-1 uppercase tracking-wider">
                        Valuation Insight
                      </h4>
                      <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {getMetadataString('valuation_narrative')}
                      </div>
                    </div>
                  )}
                </div>
                {/* Timestamp for AI messages */}
                <div className="text-xs text-zinc-500 ml-1">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    )
  },
  (prevProps, nextProps) => {
    // Fast path: Only re-render if message content or key props changed
    // Optimized for streaming: Check content last since it changes frequently
    if (
      prevProps.message.id !== nextProps.message.id ||
      prevProps.message.type !== nextProps.message.type ||
      prevProps.message.isStreaming !== nextProps.message.isStreaming ||
      prevProps.message.isComplete !== nextProps.message.isComplete ||
      prevProps.isTyping !== nextProps.isTyping ||
      prevProps.isThinking !== nextProps.isThinking
    ) {
      return false // Re-render needed
    }

    // Check content only if IDs match (content changes frequently during streaming)
    if (prevProps.message.content !== nextProps.message.content) {
      return false // Re-render needed
    }

    // Check metadata (for suggestions, confirmations, etc.)
    const prevMeta = prevProps.message.metadata
    const nextMeta = nextProps.message.metadata
    if (prevMeta !== nextMeta) {
      // Only re-render if metadata keys that affect rendering changed
      const relevantKeys = [
        'input_type',
        'suggestions',
        'business_type_suggestions',
        'kbo_suggestions',
        'is_business_type_confirmation',
        'is_company_name_confirmation',
        'button_text',
        'is_ai_help',
      ]
      for (const key of relevantKeys) {
        if (prevMeta?.[key] !== nextMeta?.[key]) {
          return false // Re-render needed
        }
      }
    }

    // Callbacks should be stable, but verify
    if (
      prevProps.onSuggestionSelect !== nextProps.onSuggestionSelect ||
      prevProps.onSuggestionDismiss !== nextProps.onSuggestionDismiss ||
      prevProps.onClarificationConfirm !== nextProps.onClarificationConfirm ||
      prevProps.onClarificationReject !== nextProps.onClarificationReject ||
      prevProps.onKBOSuggestionSelect !== nextProps.onKBOSuggestionSelect ||
      prevProps.onBusinessTypeSuggestionSelect !== nextProps.onBusinessTypeSuggestionSelect ||
      prevProps.onValuationStart !== nextProps.onValuationStart ||
      prevProps.onRetry !== nextProps.onRetry
    ) {
      return false // Re-render needed
    }

    return true // No re-render needed
  }
)

// Display name for React DevTools
MessageItem.displayName = 'MessageItem'
