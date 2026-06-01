'use client'

/**
 * Chat Assistant Drawer
 *
 * Mercury-style fixed right dock for the AI co-pilot (spring slide-in at xl: 420px).
 * Contextual to the current field; bi-directional sync with the valuation form.
 *
 * YC Advisor Pattern: "The Chat is the Navigator, not the Pilot"
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Loader2, MessageCircle, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { springSnappy } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { MANUAL_LAYOUT_SCROLL_SELECTOR, useScrollLock } from '@/hooks/useScrollLock'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useVisualViewportDrawerInsets } from '@/hooks/useVisualViewportDrawerInsets'
import { trackAIAssistantMessage, trackAIAssistantOpen } from '@/lib/analytics'
import { type AssistantIntent, resolveAssistantIntent } from '@/services/ai/local-chat-fallback'
import { AiConsentModal } from './AiConsentModal'
import { AttentionSummary } from './AttentionSummary'
import { PendingFieldUpdatesCard } from './ChatAssistantAttentionRails'
import { ChatAssistantComposer } from './ChatAssistantComposer'
import type { ChatAssistantDrawerProps } from './ChatAssistantDrawer.types'
import {
  getChatAssistantMessageRenderKey,
  hasAssistantRenderableContent,
  scrollMessagesContainerToBottom,
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
import { useResizableAiDockWidth } from './useResizableAiDockWidth'
import { useVenusAiDockFocus } from './useVenusAiDockFocus'
import { VenusAiDockPortal } from './VenusAiDockPortal'
import {
  VENUS_AI_DOCK_DRAWER_WIDTH_CLASS,
  VENUS_AI_DOCK_LAYER_Z_CLASS,
} from './venus-ai-dock-layout'

export type { ParsedCommand, ParsedValue } from './ChatAssistantParsing'
export { parseFinancialValues, parseNormalizationCommands } from './ChatAssistantParsing'
export type {
  AcknowledgeWarningRequest,
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

const dockDrawerTransition = {
  type: 'spring',
  stiffness: 180,
  damping: 28,
  mass: 0.9,
} as const

export function ChatAssistantDrawer({
  open,
  lockScroll = false,
  showFabWhenClosed = false,
  onOpenChange,
  messages,
  onSendMessage,
  isGenerating = false,
  companyName,
  fieldContext,
  hasReport = false,
  hasEbitda = false,
  pendingNormalizationsCount = 0,
  acceptedNormalizationsCount = 0,
  hasCapBreach = false,
  onApplyFieldUpdate,
  pendingUpdates = [],
  onAcceptUpdate,
  onRejectUpdate,
  qualityWarnings = [],
  startupIssues = [],
  onDismissQualityWarning,
  onResolveQualityWarning,
  onInlineFixQualityWarning,
  onJumpToQualityWarning,
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
  const shouldReduceMotion = useReducedMotion()
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

  // Handler for inline command pill clicks in assistant replies — auto-send.
  const handleCommandPillClick = useCallback(
    (command: string) => {
      if (onCommandPillClick) {
        onCommandPillClick(command)
        return
      }
      const commands = parseNormalizationCommands(command)
      onSendMessage(command, undefined, undefined, commands.length > 0 ? commands : undefined)
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
    acceptedNormalizationsCount,
    hasCapBreach,
  })
  const suggestions = suggestionItems.map((item) => {
    const key = item.key as ChatAssistantTranslationKey
    return item.params ? ca(key, item.params as ChatAssistantTranslationValues) : ca(key)
  })
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  // Pin to the bottom as the smoothing buffer reveals text between state
  // updates, so streamed lines stay in view without snapping.
  useStickToBottom(messagesContainerRef, messagesContentRef, open)

  useScrollLock(open && lockScroll, lockScroll ? MANUAL_LAYOUT_SCROLL_SELECTOR : undefined)
  const viewportInsets = useVisualViewportDrawerInsets(open && lockScroll)
  const viewportStyle = viewportInsets
    ? { top: viewportInsets.top, height: viewportInsets.height }
    : undefined
  const { resizeHandleProps, style: dockWidthStyle, width: dockWidth } = useResizableAiDockWidth()
  const drawerStyle = viewportStyle ? { ...dockWidthStyle, ...viewportStyle } : dockWidthStyle
  const viewportScrollKey = viewportInsets ? `${viewportInsets.top}:${viewportInsets.height}` : ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingAssistantIntentRef = useRef<AssistantIntent | undefined>(undefined)

  // Suggestion-chip insertion (paste-and-wait): seeds the draft instead of
  // replacing it, appends a trailing space so the next keystroke is a fresh
  // word, and parks the caret at the end so the user keeps typing without
  // repositioning. Mirrors Mercury's AdvisorAIDockPanel.insertChipPrompt.
  //
  // flushSync commits the input update inside this click handler so the
  // focus() call stays in the user-initiated event chain (iOS Safari only
  // opens the soft keyboard for focus triggered from an interaction event)
  // and the caret reads the up-to-date value rather than racing the render.
  const insertSuggestion = useCallback((text: string, intent?: AssistantIntent) => {
    pendingAssistantIntentRef.current = intent
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
    el.focus({ preventScroll: true })
    el.setSelectionRange(nextValue.length, nextValue.length)
  }, [])

  const handleSuggestionClick = useCallback(
    (label: string) => {
      const item = suggestionItems.find((entry) => {
        const key = entry.key as ChatAssistantTranslationKey
        const translated = entry.params
          ? ca(key, entry.params as ChatAssistantTranslationValues)
          : ca(key)
        return translated === label
      })
      insertSuggestion(label, item?.intent)
    },
    [ca, insertSuggestion, suggestionItems]
  )

  // Scroll to bottom on new messages and during streaming content updates.
  // Use the messages container directly — scrollIntoView can shift the document
  // viewport when body scroll lock is active (Mercury AI dock pattern).
  const messageRenderKey = getChatAssistantMessageRenderKey(messages)
  const visibleMessages = messages.filter(hasAssistantRenderableContent)
  const isEmpty = visibleMessages.length === 0
  const lastVisible = visibleMessages[visibleMessages.length - 1]
  const showLoadingSkeleton = isGenerating && (!lastVisible || lastVisible.role !== 'assistant')
  const attentionRailsKey = `${pendingUpdates.length}:${startupIssues.length}:${qualityWarnings.length}`
  const scrollTriggerKey = `${messageRenderKey}:${showLoadingSkeleton ? '1' : '0'}:${attentionRailsKey}:${viewportScrollKey}`

  useEffect(() => {
    void scrollTriggerKey
    if (!open) return
    scrollMessagesContainerToBottom(messagesContainerRef.current)
  }, [open, scrollTriggerKey])

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
    if (!open) return
    trackAIAssistantOpen()
  }, [open])

  useVenusAiDockFocus(open, textareaRef, lockScroll)

  // Global keyboard shortcuts: Escape (consent first), Cmd+Shift+L for new conversation
  useEffect(() => {
    if (!open) return
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (consentModalOpen) {
          setConsentModalOpen(false)
          e.preventDefault()
          return
        }
        onOpenChange(false)
        e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'l') {
        e.preventDefault()
        onNewConversation?.()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, consentModalOpen, onOpenChange, onNewConversation, setConsentModalOpen])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (isGenerating) return
      if (!input.trim() && attachments.length === 0) return
      trackAIAssistantMessage()
      const intent = resolveAssistantIntent(input, pendingAssistantIntentRef.current)
      pendingAssistantIntentRef.current = undefined
      onSendMessage(
        input,
        attachments,
        detectedValues.length > 0 ? detectedValues : undefined,
        detectedCommands.length > 0 ? detectedCommands : undefined,
        intent
      )
      setInput('')
      setAttachments([])
      setDetectedValues([])
      setDetectedCommands([])
    },
    [input, attachments, detectedValues, detectedCommands, isGenerating, onSendMessage]
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

  // Track focus state for premium glow effect
  const [isInputFocused, setIsInputFocused] = useState(false)

  const headerSubtitle = fieldContext
    ? fieldContext.label || ''
    : companyName
      ? ca('analysisFor', { company: companyName })
      : null

  return (
    <VenusAiDockPortal>
      <AnimatePresence>
        {!open && showFabWhenClosed && (
          <motion.button
            type="button"
            key="venus-ai-dock-fab"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            transition={shouldReduceMotion ? { duration: 0 } : springSnappy}
            whileHover={shouldReduceMotion ? undefined : { y: -2 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => onOpenChange(true)}
            aria-label={ca('openLabel')}
            data-testid="venus-ai-dock-fab"
            className={cn(
              'fixed bottom-20 right-4 md:bottom-6 md:right-6',
              VENUS_AI_DOCK_LAYER_Z_CLASS,
              'inline-flex h-11 items-center gap-2 rounded-full px-4',
              'border border-primary/20 bg-background/90 text-sm font-semibold text-foreground backdrop-blur-xl',
              'shadow-[0_18px_50px_-24px_rgba(15,23,42,0.42)]',
              'transition-[border-color,box-shadow,background-color] duration-300',
              'hover:border-primary/35 hover:bg-background',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'touch-manipulation'
            )}
          >
            <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{ca('fabLabel')}</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="venus-ai-dock-drawer"
            initial={shouldReduceMotion ? false : { opacity: 0, x: 32, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.99 }}
            transition={shouldReduceMotion ? { duration: 0 } : dockDrawerTransition}
            style={drawerStyle}
            data-testid="venus-ai-dock-drawer"
            className={cn(
              'fixed top-0 right-0 flex flex-col min-h-0 w-full p-0',
              VENUS_AI_DOCK_LAYER_Z_CLASS,
              VENUS_AI_DOCK_DRAWER_WIDTH_CLASS,
              !viewportStyle && 'bottom-0 h-full',
              viewportStyle && 'h-auto',
              'bg-background border-l border-primary/10',
              'shadow-[-4px_0_40px_-8px_rgba(0,0,0,0.15)]',
              'pb-[env(safe-area-inset-bottom)]'
            )}
            aria-label={ca('panelLabel')}
          >
            <div
              {...resizeHandleProps}
              aria-label={ca('resizeHandle')}
              title={ca('resizeHandle')}
              data-testid="venus-ai-dock-resize-handle"
              className={cn(
                'group/resize hidden xl:flex',
                'absolute inset-y-0 left-0 z-10 w-4 -translate-x-1/2',
                'cursor-col-resize touch-none items-center justify-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
            >
              <span
                className={cn(
                  'h-16 w-1 rounded-full bg-primary/25 opacity-0',
                  'transition-opacity duration-150',
                  'group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100'
                )}
                aria-hidden="true"
              />
              <span className="sr-only">{`${ca('resizeHandle')} (${dockWidth}px)`}</span>
            </div>
            <header
              className={cn(
                'shrink-0 flex items-center justify-between',
                'px-4 sm:px-5 py-3.5',
                'border-b border-primary/10 bg-gradient-to-r from-primary/[0.06] via-background to-transparent'
              )}
            >
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{ca('title')}</h2>
                {headerSubtitle ? (
                  <p className="text-xs text-foreground/70 truncate mt-0.5">{headerSubtitle}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {visibleMessages.length > 0 && !isGenerating && onNewConversation ? (
                  <button
                    type="button"
                    onClick={onNewConversation}
                    aria-label={ca('newConversation')}
                    title={ca('newConversation')}
                    className={cn(
                      'px-2.5 py-1 rounded-md',
                      'text-foreground/40 hover:text-foreground/70',
                      'hover:bg-foreground/[0.06] active:bg-foreground/[0.08]',
                      'transition-colors touch-manipulation text-[11px] font-medium'
                    )}
                  >
                    <span className="text-[11px] font-medium">{ca('newConversationShort')}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center',
                    'text-foreground/50 hover:text-foreground',
                    'hover:bg-foreground/[0.06] active:bg-foreground/[0.08]',
                    'transition-colors touch-manipulation'
                  )}
                  aria-label={ca('close')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <AttentionSummary
              startupIssues={startupIssues}
              qualityWarnings={qualityWarnings}
              onResolveStartupIssue={onResolveStartupIssue}
              onApplyStartupIssueQuickFix={onApplyStartupIssueQuickFix}
              onJumpToStartupIssue={onJumpToStartupIssue}
              onDismissStartupIssue={onDismissStartupIssue}
              onResolveQualityWarning={onResolveQualityWarning}
              onInlineFixQualityWarning={onInlineFixQualityWarning}
              onJumpToQualityWarning={onJumpToQualityWarning}
              onDismissQualityWarning={onDismissQualityWarning}
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
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4"
              role="log"
              aria-live="polite"
              aria-busy={isGenerating}
              aria-label={ca('title')}
            >
              {isEmpty ? (
                <EmptyState fieldContext={fieldContext} />
              ) : (
                <div ref={messagesContentRef} className="space-y-3">
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
                          onSendMessage(
                            content,
                            undefined,
                            undefined,
                            undefined,
                            resolveAssistantIntent(content)
                          )
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
              onSuggestionClick={handleSuggestionClick}
            />
          </motion.aside>
        )}
      </AnimatePresence>

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
    </VenusAiDockPortal>
  )
}

export default ChatAssistantDrawer
