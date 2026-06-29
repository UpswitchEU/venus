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
import { MessageCircle, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { springSnappy } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { MANUAL_LAYOUT_SCROLL_SELECTOR, useScrollLock } from '@/hooks/useScrollLock'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useVisualViewportDrawerInsets } from '@/hooks/useVisualViewportDrawerInsets'
import { trackAIAssistantOpen } from '@/lib/analytics'
import { resolveAssistantIntent } from '@/services/ai/local-chat-fallback'
import { AiConsentModal } from './AiConsentModal'
import { AttentionSummary } from './AttentionSummary'
import { PendingFieldUpdatesCard } from './ChatAssistantAttentionRails'
import { ChatAssistantComposer } from './ChatAssistantComposer'
import {
  buildChatAssistantScrollTriggerKey,
  getVisibleChatAssistantMessages,
  resolveChatAssistantCurrencyLocale,
  resolveChatAssistantHeaderSubtitle,
  shouldShowChatAssistantLoadingSkeleton,
} from './ChatAssistantDrawer.model'
import type { ChatAssistantDrawerProps } from './ChatAssistantDrawer.types'
import {
  getChatAssistantMessageRenderKey,
  scrollMessagesContainerToBottom,
} from './ChatAssistantDrawer.utils'
import { ChatAssistantLoadingIndicator } from './ChatAssistantLoadingIndicator'
import { EmptyState, MessageBubble } from './ChatAssistantMessageBubble'
import { useChatAssistantComposerController } from './useChatAssistantComposerController'
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
  integrationsEnabled = false,
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
  const currencyLocale = resolveChatAssistantCurrencyLocale(locale)
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
  const translateSuggestion = useCallback(
    (key: string, params?: Record<string, string>) => {
      const translationKey = key as ChatAssistantTranslationKey
      return params
        ? ca(translationKey, params as ChatAssistantTranslationValues)
        : ca(translationKey)
    },
    [ca]
  )
  const {
    attachments,
    detectedCommands,
    detectedValues,
    fileInputRef,
    handleCommandPillClick,
    handleFileChange,
    handleKeyDown,
    handleSubmit,
    handleSuggestionClick,
    input,
    isInputFocused,
    removeAttachment,
    setInput,
    setIsInputFocused,
    suggestions,
    textareaRef,
  } = useChatAssistantComposerController({
    acceptedNormalizationsCount,
    fieldContext,
    hasCapBreach,
    hasEbitda,
    hasReport,
    isGenerating,
    onCommandPillClick,
    onSendMessage,
    pendingNormalizationsCount,
    translateSuggestion,
  })
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
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

  // Scroll to bottom on new messages and during streaming content updates.
  // Use the messages container directly — scrollIntoView can shift the document
  // viewport when body scroll lock is active (Mercury AI dock pattern).
  const messageRenderKey = getChatAssistantMessageRenderKey(messages)
  const visibleMessages = getVisibleChatAssistantMessages(messages)
  const isEmpty = visibleMessages.length === 0
  const lastVisible = visibleMessages[visibleMessages.length - 1]
  const showLoadingSkeleton = shouldShowChatAssistantLoadingSkeleton({
    isGenerating,
    lastVisibleRole: lastVisible?.role,
  })
  const attentionRailsKey = `${pendingUpdates.length}:${startupIssues.length}:${qualityWarnings.length}`
  const scrollTriggerKey = buildChatAssistantScrollTriggerKey({
    attentionRailsKey,
    messageRenderKey,
    showLoadingSkeleton,
    viewportScrollKey,
  })

  useEffect(() => {
    void scrollTriggerKey
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (!open) return
    scrollMessagesContainerToBottom(messagesContainerRef.current, { force: !wasOpen })
  }, [open, scrollTriggerKey])

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

  const headerSubtitle = resolveChatAssistantHeaderSubtitle({
    fieldLabel: fieldContext?.label,
    companyName,
    translateAnalysisFor: (company) => ca('analysisFor', { company }),
  })

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
              !viewportStyle && 'bottom-0 h-[100dvh] md:h-full',
              viewportStyle && 'h-auto',
              'bg-background border-l border-primary/10',
              'shadow-[-4px_0_40px_-8px_rgba(0,0,0,0.15)]'
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
                      'min-h-11 px-3 rounded-md sm:min-h-0 sm:px-2.5 sm:py-1',
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
                    'h-11 w-11 rounded-md flex items-center justify-center sm:h-8 sm:w-8',
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
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4 touch-pan-y [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable]"
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
                        integrationsEnabled={integrationsEnabled}
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
                    <ChatAssistantLoadingIndicator
                      toolInProgress={toolInProgress}
                      hasTranslation={(key) => ca.has(key as ChatAssistantTranslationKey)}
                      t={(key) => ca(key as ChatAssistantTranslationKey)}
                    />
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
