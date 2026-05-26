'use client'

/**
 * Chat Assistant Drawer
 *
 * Slide-in drawer for the AI co-pilot. Always available, contextual to current field.
 * Implements bi-directional sync: Chat commands update form fields, and vice versa.
 *
 * YC Advisor Pattern: "The Chat is the Navigator, not the Pilot"
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { springDefault } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import { trackAIAssistantMessage, trackAIAssistantOpen } from '@/lib/analytics'
import { AiConsentModal } from './AiConsentModal'
import {
  PendingFieldUpdatesCard,
  QualityWarningRail,
  StartupIssueRail,
} from './ChatAssistantAttentionRails'
import { ChatAssistantComposer } from './ChatAssistantComposer'
import type { ChatAssistantDrawerProps } from './ChatAssistantDrawer.types'
import {
  getChatAssistantMessageRenderKey,
  hasAssistantRenderableContent,
} from './ChatAssistantDrawer.utils'
import { EmptyState, MessageBubble } from './ChatAssistantMessageBubble'
import {
  type ParsedCommand,
  type ParsedValue,
  parseFinancialValues,
  parseNormalizationCommands,
} from './ChatAssistantParsing'
import { getContextualSuggestionKeys } from './ChatAssistantSuggestions'
import { useChatAssistantConsentFlow } from './useChatAssistantConsentFlow'

export type { ParsedCommand, ParsedValue } from './ChatAssistantParsing'
export { parseFinancialValues, parseNormalizationCommands } from './ChatAssistantParsing'
export type {
  AgentChoiceSelection,
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  BuyerReadyToolCard,
  ChatMessage,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  FieldContext,
  FieldUpdate,
  ImportReviewRequest,
  IntegrationConnectRequest,
  ListingCreateRequest,
  ListingPreview,
  MethodReadinessPreview,
  MultiSelectRequest,
  NormalisationSuggestion,
  OwnerProfileAnswerRequest,
  QualityWarning,
  ReportGenerationRequest,
  SecureCredentialRequest,
  SellabilityRunRequest,
  SingleSelectRequest,
  StartupAssistantIssue,
  SuggestionContext,
  ValuationRunRequest,
  ValuationSessionRequest,
} from './ChatAssistantTypes'

export function ChatAssistantDrawer({
  open,
  onOpenChange,
  messages,
  onSendMessage,
  isGenerating = false,
  companyName,
  fieldContext,
  hasReport = false,
  hasEbitda = false,
  pendingNormalizationsCount = 0,
  onApplyFieldUpdate,
  pendingUpdates = [],
  onAcceptUpdate,
  onRejectUpdate,
  qualityWarnings = [],
  startupIssues = [],
  onDismissQualityWarning,
  onResolveQualityWarning,
  onDismissStartupIssue,
  onResolveStartupIssue,
  onApplyStartupIssueQuickFix,
  onJumpToStartupIssue,
  onAcceptNormalisation,
  onRejectNormalisation,
  onApproveValuationRun,
  onRejectValuationRun,
  onApproveReportGeneration,
  onRejectReportGeneration,
  onApproveSellabilityRun,
  onRejectSellabilityRun,
  onApproveListingCreate,
  onRejectListingCreate,
  onApplyAgentChoice,
  showQuickNormalizations = false,
  onCommandPillClick,
  toolInProgress,
  onRetry,
  onNewConversation,
}: ChatAssistantDrawerProps) {
  const ca = useTranslations('chatAssistant')
  type ChatAssistantTranslationKey = Parameters<typeof ca>[0]
  type ChatAssistantTranslationValues = NonNullable<Parameters<typeof ca>[1]>
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const [input, setInput] = useState('')
  const {
    aiConsentError,
    aiConsentStatus,
    consentModalOpen,
    consentRetryMessageId,
    handleGrantConsent,
    handleOpenConsent,
    isGrantingConsent,
    setConsentModalOpen,
  } = useChatAssistantConsentFlow({
    locale,
    onRetry,
  })

  // Handler for command pill clicks - auto-fills and sends
  const handleCommandPillClick = useCallback(
    (command: string) => {
      if (onCommandPillClick) {
        onCommandPillClick(command)
      } else {
        // Fallback: set input and trigger submit
        setInput(command)
        // Use setTimeout to ensure state is updated before submitting
        setTimeout(() => {
          const commands = parseNormalizationCommands(command)
          onSendMessage(command, undefined, undefined, commands.length > 0 ? commands : undefined)
          setInput('')
        }, 0)
      }
    },
    [onCommandPillClick, onSendMessage]
  )

  const [attachments, setAttachments] = useState<File[]>([])
  const [detectedValues, setDetectedValues] = useState<ParsedValue[]>([])
  const [detectedCommands, setDetectedCommands] = useState<ParsedCommand[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const suggestionItems = getContextualSuggestionKeys({
    fieldContext,
    hasReport,
    hasEbitda,
    pendingNormalizationsCount,
  })
  const suggestions = suggestionItems.map((item) => {
    const key = item.key as ChatAssistantTranslationKey
    return item.params ? ca(key, item.params as ChatAssistantTranslationValues) : ca(key)
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Robust scroll lock when drawer is open (iOS Safari + Android)
  useScrollLock(open)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Suggestion-chip insertion (paste-and-wait): seeds the draft instead of
  // replacing it, appends a trailing space so the next keystroke is a fresh
  // word, and parks the caret at the end so the user keeps typing without
  // repositioning. Mirrors Mercury's AdvisorAIDockPanel.insertChipPrompt.
  //
  // flushSync commits the input update inside this click handler so the
  // focus() call stays in the user-initiated event chain (iOS Safari only
  // opens the soft keyboard for focus triggered from an interaction event)
  // and the caret reads the up-to-date value rather than racing the render.
  const insertSuggestion = useCallback((text: string) => {
    let nextValue = ''
    flushSync(() => {
      setInput((prev) => {
        const trimmed = prev.replace(/\s+$/, '')
        nextValue = trimmed.length > 0 ? `${trimmed} ${text} ` : `${text} `
        return nextValue
      })
    })
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(nextValue.length, nextValue.length)
  }, [])

  // Scroll to bottom on new messages and during streaming content updates
  const messageRenderKey = getChatAssistantMessageRenderKey(messages)
  useEffect(() => {
    void messageRenderKey
    if (!open) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageRenderKey, open])

  // Auto-resize textarea
  useEffect(() => {
    void input
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // Smart parsing - detect values and commands as user types
  useEffect(() => {
    if (input.length > 5) {
      // Parse normalization commands first (higher priority)
      const commands = parseNormalizationCommands(input)
      setDetectedCommands(commands)

      // Only parse values if no commands detected
      if (commands.length === 0) {
        const parsed = parseFinancialValues(input)
        setDetectedValues(parsed)
      } else {
        setDetectedValues([])
      }
    } else {
      setDetectedValues([])
      setDetectedCommands([])
    }
  }, [input])

  useEffect(() => {
    if (open) {
      trackAIAssistantOpen()
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open])

  // Global keyboard shortcuts: Escape to close, Cmd+Shift+L for new conversation
  useEffect(() => {
    if (!open) return
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'l') {
        e.preventDefault()
        onNewConversation?.()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, onOpenChange, onNewConversation])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!input.trim() && attachments.length === 0) return
      trackAIAssistantMessage()
      onSendMessage(
        input,
        attachments,
        detectedValues.length > 0 ? detectedValues : undefined,
        detectedCommands.length > 0 ? detectedCommands : undefined
      )
      setInput('')
      setAttachments([])
      setDetectedValues([])
      setDetectedCommands([])
    },
    [input, attachments, detectedValues, detectedCommands, onSendMessage]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) setAttachments((prev) => [...prev, ...Array.from(files)])
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Filter out truly empty streaming placeholders, but keep tool-card-only turns.
  const visibleMessages = messages.filter(hasAssistantRenderableContent)
  const isEmpty = visibleMessages.length === 0
  // Only show the loading skeleton when there's no assistant message actively receiving content
  const lastVisible = visibleMessages[visibleMessages.length - 1]
  const showLoadingSkeleton = isGenerating && (!lastVisible || lastVisible.role !== 'assistant')

  // Track focus state for premium glow effect
  const [isInputFocused, setIsInputFocused] = useState(false)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — softer, no blur (matches Cursor/Lovable). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springDefault}
            onClick={() => onOpenChange(false)}
            onTouchMove={(e) => e.preventDefault()}
            className="fixed inset-0 z-40 bg-black/30 touch-none overscroll-none"
          />

          {/* Drawer Panel — plain surface, no decorative border. */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={springDefault}
            className={cn(
              'fixed right-0 top-0 bottom-0 z-50',
              'w-full h-full p-0 flex flex-col',
              'sm:w-[440px] md:w-[480px] lg:w-[520px]',
              'bg-background',
              'pb-[env(safe-area-inset-bottom)]'
            )}
          >
            {/* Header — minimal: title + close. No CTAs.
                The normalisation modal stays reachable from the main form UI;
                if the assistant needs to surface "review normalisations" it
                does so via an insight, not via permanent header chrome. */}
            <div className="shrink-0 px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-foreground/80">{ca('title')}</h2>
                {fieldContext && (
                  <p className="text-xs text-foreground/45 truncate mt-0.5">
                    {fieldContext.label || ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors touch-manipulation"
                aria-label={ca('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <StartupIssueRail
              startupIssues={startupIssues}
              onDismissStartupIssue={onDismissStartupIssue}
              onResolveStartupIssue={onResolveStartupIssue}
              onApplyStartupIssueQuickFix={onApplyStartupIssueQuickFix}
              onJumpToStartupIssue={onJumpToStartupIssue}
            />
            <QualityWarningRail
              qualityWarnings={qualityWarnings}
              onDismissQualityWarning={onDismissQualityWarning}
              onResolveQualityWarning={onResolveQualityWarning}
            />
            <PendingFieldUpdatesCard
              pendingUpdates={pendingUpdates}
              currencyLocale={currencyLocale}
              onApplyFieldUpdate={onApplyFieldUpdate}
              onAcceptUpdate={onAcceptUpdate}
              onRejectUpdate={onRejectUpdate}
            />

            {/* Messages Area - Scrollable with momentum */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              role="log"
              aria-live="polite"
              aria-busy={isGenerating}
              aria-label={ca('title')}
            >
              {isEmpty ? (
                <EmptyState
                  onSuggestionClick={insertSuggestion}
                  companyName={companyName}
                  fieldContext={fieldContext}
                  suggestions={suggestions}
                />
              ) : (
                <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
                  <AnimatePresence>
                    {visibleMessages.map((message, idx) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isStreaming={
                          isGenerating &&
                          idx === visibleMessages.length - 1 &&
                          message.role === 'assistant'
                        }
                        onApplyUpdate={onApplyFieldUpdate}
                        onAcceptNormalisation={onAcceptNormalisation}
                        onRejectNormalisation={onRejectNormalisation}
                        onApproveValuationRun={onApproveValuationRun}
                        onRejectValuationRun={onRejectValuationRun}
                        onApproveReportGeneration={onApproveReportGeneration}
                        onRejectReportGeneration={onRejectReportGeneration}
                        onApproveSellabilityRun={onApproveSellabilityRun}
                        onRejectSellabilityRun={onRejectSellabilityRun}
                        onApproveListingCreate={onApproveListingCreate}
                        onRejectListingCreate={onRejectListingCreate}
                        onApplyAgentChoice={onApplyAgentChoice}
                        onCommandPillClick={handleCommandPillClick}
                        onOpenConsent={handleOpenConsent}
                        onRetry={onRetry}
                        onSendFollowUp={(content) =>
                          onSendMessage(content, undefined, undefined, undefined)
                        }
                      />
                    ))}
                  </AnimatePresence>

                  {showLoadingSkeleton && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2 px-1 py-2 text-foreground/55"
                    >
                      {/* Inline thinking indicator — no bubble, no skeleton bars.
                          Three dots + a one-word label, mirroring Cursor's "Thinking…". */}
                      {toolInProgress ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span className="text-xs">
                            {(() => {
                              const toolLabelKey =
                                `tools.${toolInProgress}` as ChatAssistantTranslationKey

                              return ca.has(toolLabelKey) ? ca(toolLabelKey) : ca('tools.default')
                            })()}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex gap-0.5 items-center">
                            <motion.span
                              className="w-1 h-1 rounded-full bg-foreground/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.1, repeat: Infinity }}
                            />
                            <motion.span
                              className="w-1 h-1 rounded-full bg-foreground/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.1, repeat: Infinity, delay: 0.18 }}
                            />
                            <motion.span
                              className="w-1 h-1 rounded-full bg-foreground/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.1, repeat: Infinity, delay: 0.36 }}
                            />
                          </span>
                          <span className="text-xs">{ca('typing')}</span>
                        </>
                      )}
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <ChatAssistantComposer
              attachments={attachments}
              currencyLocale={currencyLocale}
              detectedCommands={detectedCommands}
              detectedValues={detectedValues}
              fieldContext={fieldContext}
              input={input}
              isGenerating={isGenerating}
              isInputFocused={isInputFocused}
              suggestions={suggestions}
              textareaRef={textareaRef}
              onAttachClick={() => fileInputRef.current?.click()}
              onFocusChange={setIsInputFocused}
              onInputChange={setInput}
              onKeyDown={handleKeyDown}
              onRemoveAttachment={removeAttachment}
              onSubmit={() => handleSubmit()}
              onSuggestionClick={handleCommandPillClick}
            />
          </motion.div>

          <AiConsentModal
            open={consentModalOpen}
            error={aiConsentError}
            isSubmitting={isGrantingConsent}
            policyVersion={
              aiConsentStatus?.currentPolicyVersion ||
              visibleMessages.find((message) => message.id === consentRetryMessageId)
                ?.consentPolicyVersion
            }
            onClose={() => setConsentModalOpen(false)}
            onAgree={handleGrantConsent}
          />
        </>
      )}
    </AnimatePresence>
  )
}

export default ChatAssistantDrawer
