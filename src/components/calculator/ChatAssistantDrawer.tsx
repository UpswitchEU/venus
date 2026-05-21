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
import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { springDefault } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { useAiConsent } from '@/hooks/useAiConsent'
import { useScrollLock } from '@/hooks/useScrollLock'
import { trackAIAssistantMessage, trackAIAssistantOpen } from '@/lib/analytics'
import { AiConsentModal } from './AiConsentModal'
import { EmptyState, MessageBubble } from './ChatAssistantMessageBubble'
import {
  type ParsedCommand,
  type ParsedValue,
  parseFinancialValues,
  parseNormalizationCommands,
} from './ChatAssistantParsing'
import { getContextualSuggestionKeys } from './ChatAssistantSuggestions'
import type {
  ChatMessage,
  FieldContext,
  QualityWarning,
  StartupAssistantIssue,
} from './ChatAssistantTypes'

export type { ParsedCommand, ParsedValue } from './ChatAssistantParsing'
export { parseFinancialValues, parseNormalizationCommands } from './ChatAssistantParsing'
export type {
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

interface ChatAssistantDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatMessage[]
  onSendMessage: (
    content: string,
    attachments?: File[],
    detectedValues?: ParsedValue[],
    parsedCommands?: ParsedCommand[]
  ) => void
  isGenerating?: boolean
  // Context from the form
  companyName?: string
  fieldContext?: FieldContext
  hasReport?: boolean
  hasEbitda?: boolean
  pendingNormalizationsCount?: number
  /**
   * High-severity warnings from the latest valuation result. The drawer shows
   * each as an actionable card; clicking the CTA sends a prefilled message to
   * the assistant. Resolved/dismissed state is owned by the parent (so it can
   * persist with the session). Pass an empty array (or omit) to hide the rail.
   */
  qualityWarnings?: QualityWarning[]
  startupIssues?: StartupAssistantIssue[]
  /** Called when the advisor dismisses a warning (acknowledged without acting). */
  onDismissQualityWarning?: (warningType: string) => void
  /** Called when the advisor clicks the CTA. Sends `prompt` into the chat. */
  onResolveQualityWarning?: (warningType: string, prompt: string) => void
  /** Called when the advisor dismisses a startup issue card. */
  onDismissStartupIssue?: (issueId: string) => void
  /** Called when CTA is clicked for startup issue remediation. */
  onResolveStartupIssue?: (issueId: string, prompt: string) => void
  /** Optional jump helper (e.g. scroll to startup step). */
  onJumpToStartupIssue?: (issueId: string) => void
  // Bi-directional sync: when AI suggests field updates
  onApplyFieldUpdate?: (field: string, value: unknown) => void
  pendingUpdates?: { field: string; value: unknown; label: string }[]
  onAcceptUpdate?: (field: string) => void
  onRejectUpdate?: (field: string) => void
  // Normalization suggestion handlers
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  // Run-valuation proposal handlers (propose-only AI tool — see run_valuation.tool.ts)
  onApproveValuationRun?: (proposalId: string, reportId?: string, methods?: string[] | null) => void
  onRejectValuationRun?: (proposalId: string) => void
  // Report-generation proposal handlers (propose-only AI tool — see generate_report.tool.ts)
  onApproveReportGeneration?: (proposalId: string, reportId?: string) => void
  onRejectReportGeneration?: (proposalId: string) => void
  // Sellability-compute proposal handlers (propose-only AI tool — see run_sellability.tool.ts)
  onApproveSellabilityRun?: (proposalId: string) => void
  onRejectSellabilityRun?: (proposalId: string) => void
  // Listing proposal handlers (propose-only AI tool — see create_listing.tool.ts)
  onApproveListingCreate?: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null,
    visibility?: 'public' | 'private'
  ) => void
  onRejectListingCreate?: (proposalId: string) => void
  // Quick suggestion pills for common normalizations
  showQuickNormalizations?: boolean
  // Command pill click handler - auto-fills and sends
  onCommandPillClick?: (command: string) => void
  // Tool execution indicator (Claude is fetching data)
  toolInProgress?: string | null
  // Retry failed message
  onRetry?: (messageId: string) => void
  // Start a new conversation
  onNewConversation?: () => void
}

function hasAssistantRenderableContent(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return true
  if (message.content.trim().length > 0) return true
  if (message.isError) return true

  const cardCollections: Array<keyof ChatMessage> = [
    'fieldUpdates',
    'normalisationSuggestions',
    'valuationRunRequests',
    'reportGenerationRequests',
    'sellabilityRunRequests',
    'ownerProfileAnswerRequests',
    'integrationConnectRequests',
    'secureCredentialRequests',
    'csvUploadRequests',
    'multiSelectRequests',
    'singleSelectRequests',
    'clientCreateRequests',
    'belgianCompanyBootstraps',
    'valuationSessionRequests',
    'clientDataReadinessPreviews',
    'importReviewRequests',
    'methodReadinessPreviews',
    'listingPreviews',
    'listingCreateRequests',
    'buyerProfilePreviews',
    'buyerReadyCards',
    'businessTypeSearchResults',
    'registrySearchResults',
    'tasks',
  ]

  return cardCollections.some((key) => {
    const value = message[key]
    return Array.isArray(value) && value.length > 0
  })
}

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
  showQuickNormalizations = false,
  onCommandPillClick,
  toolInProgress,
  onRetry,
  onNewConversation,
}: ChatAssistantDrawerProps) {
  const ca = useTranslations('chatAssistant')
  const nh = useTranslations('normalizationHub')
  type ChatAssistantTranslationKey = Parameters<typeof ca>[0]
  type ChatAssistantTranslationValues = NonNullable<Parameters<typeof ca>[1]>
  type NormalizationHubTranslationKey = Parameters<typeof nh>[0]
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const [input, setInput] = useState('')
  const [consentModalOpen, setConsentModalOpen] = useState(false)
  const [consentRetryMessageId, setConsentRetryMessageId] = useState<string | null>(null)
  const [isGrantingConsent, setIsGrantingConsent] = useState(false)
  const {
    status: aiConsentStatus,
    error: aiConsentError,
    grant: grantAiConsent,
  } = useAiConsent({
    enabled: consentModalOpen,
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

  // Scroll to bottom on new messages and during streaming content updates
  const messageRenderKey = messages
    .map(
      (message) =>
        `${message.id}:${message.content.length}:${message.fieldUpdates?.length ?? 0}:${
          message.normalisationSuggestions?.length ?? 0
        }:${message.valuationRunRequests?.length ?? 0}:${
          message.reportGenerationRequests?.length ?? 0
        }:${message.sellabilityRunRequests?.length ?? 0}:${
          message.ownerProfileAnswerRequests?.length ?? 0
        }:${message.integrationConnectRequests?.length ?? 0}:${
          message.secureCredentialRequests?.length ?? 0
        }:${message.csvUploadRequests?.length ?? 0}:${message.multiSelectRequests?.length ?? 0}:${
          message.singleSelectRequests?.length ?? 0
        }:${message.clientCreateRequests?.length ?? 0}:${
          message.belgianCompanyBootstraps?.length ?? 0
        }:${message.valuationSessionRequests?.length ?? 0}:${
          message.clientDataReadinessPreviews?.length ?? 0
        }:${message.importReviewRequests?.length ?? 0}:${
          message.methodReadinessPreviews?.length ?? 0
        }:${message.listingPreviews?.length ?? 0}:${
          message.listingCreateRequests?.length ?? 0
        }:${message.buyerProfilePreviews?.length ?? 0}:${message.buyerReadyCards?.length ?? 0}:${
          message.businessTypeSearchResults?.length ?? 0
        }:${message.registrySearchResults?.length ?? 0}:${message.tasks?.length ?? 0}`
    )
    .join('|')
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

  const handleOpenConsent = useCallback((messageId: string) => {
    setConsentRetryMessageId(messageId)
    setConsentModalOpen(true)
  }, [])

  const handleGrantConsent = useCallback(async () => {
    setIsGrantingConsent(true)
    const ok = await grantAiConsent({ locale })
    setIsGrantingConsent(false)
    if (!ok) return

    const retryMessageId = consentRetryMessageId
    setConsentModalOpen(false)
    setConsentRetryMessageId(null)
    if (retryMessageId) {
      onRetry?.(retryMessageId)
    }
  }, [consentRetryMessageId, grantAiConsent, locale, onRetry])

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

            {startupIssues.length > 0 && (
              <div
                className="shrink-0 px-4 sm:px-5 pt-4 pb-2 space-y-4"
                data-testid="assistant-startup-issues"
              >
                {startupIssues.map((issue) => {
                  const accentClass =
                    issue.severity === 'block'
                      ? 'border-l-rose-500/70'
                      : issue.severity === 'warn'
                        ? 'border-l-amber-500/70'
                        : 'border-l-sky-500/70'
                  return (
                    <motion.div
                      key={issue.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                      className="flex flex-col items-start gap-2"
                    >
                      <div
                        className={cn(
                          'max-w-[88%] min-w-0',
                          'rounded-2xl rounded-tl-md',
                          'px-4 py-3',
                          'bg-foreground/[0.03]',
                          'border border-foreground/[0.08]',
                          'border-l-2',
                          accentClass
                        )}
                      >
                        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground">
                          {issue.title}
                        </p>
                        {issue.body && (
                          <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/70 mt-1.5">
                            {issue.body}
                          </p>
                        )}
                      </div>
                      <div className="ml-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onResolveStartupIssue?.(issue.id, issue.ctaPrompt)}
                          className="rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.08] hover:border-foreground/[0.14] px-3 py-1 text-xs text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap touch-manipulation"
                        >
                          {issue.ctaLabel}
                        </button>
                        {issue.jumpLabel && (
                          <button
                            type="button"
                            onClick={() => onJumpToStartupIssue?.(issue.id)}
                            className="rounded-full hover:bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/55 hover:text-foreground/80 transition-colors touch-manipulation"
                          >
                            {issue.jumpLabel}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDismissStartupIssue?.(issue.id)}
                          className="rounded-full hover:bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation"
                        >
                          {ca('dismissWarning')}
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/*
              Engine Insights — Pass-9.

              Each unacknowledged high-severity warning the engine emitted
              renders as a *proactive assistant insight* — visually a chat
              bubble from the assistant, parked at the top of the message
              stream so the user sees them the moment they open the
              drawer. Visual change from Pass-7: no warning-banner header,
              no amber rail. The bubble itself communicates urgency via
              the assistant's voice, not via UI chrome — this is the
              "feels like the assistant is talking to me" pattern the
              CTO audit asked for.

              Actions stay inline so a fix is one click away:
                - Primary CTA → forwards the prefilled prompt (the
                  assistant walks the user through the fix).
                - Dismiss   → acknowledges silently (parent persists).

              The report body no longer renders an AANDACHTSPUNTEN block;
              this surface is the single source of remediation.
            */}
            {qualityWarnings.length > 0 && (
              <div
                className="shrink-0 px-4 sm:px-5 pt-4 pb-2 space-y-4"
                data-testid="assistant-engine-insights"
              >
                {qualityWarnings.map((w) => (
                  <motion.div
                    key={w.type}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="flex flex-col items-start gap-2"
                  >
                    <div
                      className={cn(
                        'max-w-[88%] min-w-0',
                        'rounded-2xl rounded-tl-md',
                        'px-4 py-3',
                        'bg-foreground/[0.03]',
                        'border border-foreground/[0.08]',
                        'border-l-2 border-l-amber-500/60'
                      )}
                      role="status"
                    >
                      {w.message ? (
                        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground">
                          {w.message}
                        </p>
                      ) : null}
                      {w.recommendation ? (
                        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/70 mt-1.5">
                          {w.recommendation}
                        </p>
                      ) : null}
                    </div>
                    <div className="ml-2 flex flex-wrap items-center gap-1.5">
                      {w.cta_label && w.cta_prompt ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (w.cta_prompt) onResolveQualityWarning?.(w.type, w.cta_prompt)
                          }}
                          className="rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.08] hover:border-foreground/[0.14] px-3 py-1 text-xs text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap touch-manipulation"
                        >
                          {w.cta_label}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onDismissQualityWarning?.(w.type)}
                        className="rounded-full hover:bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation"
                      >
                        {ca('dismissWarning')}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pending Field Updates — reshaped as an inline assistant turn.
                Conversational: "I'd like to apply these updates", then a tight
                list of plain text rows with subtle accept / reject text actions.
                No panel chrome, no primary tint, no oversized icon buttons. */}
            {pendingUpdates.length > 0 && (
              <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex flex-col items-start gap-2">
                <div className="max-w-[88%] rounded-2xl rounded-tl-md px-4 py-3 bg-foreground/[0.03] border border-foreground/[0.08]">
                  <p className="text-[15px] sm:text-sm leading-relaxed text-foreground mb-2">
                    {ca('suggestedUpdates')}
                  </p>
                  <ul className="space-y-1.5">
                    {pendingUpdates.map((update) => (
                      <li
                        key={update.field}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 flex-1 text-foreground/80 truncate">
                          <span className="text-foreground/45 mr-1.5">→</span>
                          {update.label}
                        </span>
                        <span className="font-mono text-foreground/65 tabular-nums">
                          {typeof update.value === 'number'
                            ? `€${update.value.toLocaleString(currencyLocale)}`
                            : String(update.value ?? '')}
                        </span>
                        <span className="flex items-center gap-2 text-xs shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onApplyFieldUpdate?.(update.field, update.value)
                              onAcceptUpdate?.(update.field)
                            }}
                            className="text-primary/85 hover:text-primary transition-colors"
                          >
                            {ca('accept')}
                          </button>
                          <span className="text-foreground/20">·</span>
                          <button
                            type="button"
                            onClick={() => onRejectUpdate?.(update.field)}
                            className="text-foreground/45 hover:text-foreground/70 transition-colors"
                          >
                            {ca('dismissWarning')}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

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
                  onSuggestionClick={(text) => setInput(text)}
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

            {/* Composer — Aurora Clarity surface, mirrored from the home-page
                HeroKBOSearch input and Mercury's AdvisorAIDock. Contextual
                action chips render ABOVE the textarea (Lovable-style action
                points) so the textarea remains the single action surface.
                Detected commands / values keep their inline echo above the
                textarea. Paperclip + send live INSIDE the same rounded glass
                card, on a footer row beneath the textarea. */}
            <div className="shrink-0 px-4 sm:px-5 pb-4 sm:pb-5 pt-2 space-y-2.5">
              {/* Quick suggestions — pill chips, always visible when empty.
                  Aligned with Mercury's starter-chips treatment. */}
              <AnimatePresence>
                {!input.trim() && !isGenerating && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-wrap gap-1.5"
                    data-testid="assistant-starter-chips"
                  >
                    {suggestions.slice(0, 4).map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleCommandPillClick(suggestion)}
                        disabled={isGenerating}
                        className={cn(
                          'inline-flex items-center rounded-full',
                          'border border-primary/10 bg-primary/[0.04]',
                          'px-3 py-1 text-xs font-medium text-foreground/70',
                          'hover:border-primary/20 hover:bg-primary/[0.07] hover:text-foreground/90',
                          'active:scale-[0.97] transition-all touch-manipulation',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline detection echo — one quiet line, monospace, no panel */}
              <AnimatePresence>
                {(detectedCommands.length > 0 || detectedValues.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                    className="px-1 text-xs text-foreground/55 leading-relaxed"
                  >
                    <span className="text-foreground/35 mr-1.5">
                      {detectedCommands.length > 0
                        ? ca('normCommandDetected')
                        : ca('detectedValues')}
                      :
                    </span>
                    {(detectedCommands.length > 0 ? detectedCommands : detectedValues).map(
                      (item, index) => (
                        <span key={index} className="font-mono">
                          {index > 0 && <span className="text-foreground/25 mx-1.5">·</span>}
                          {(() => {
                            const fieldLabelKey =
                              `fieldLabels.${item.field}` as NormalizationHubTranslationKey

                            return nh.has(fieldLabelKey) ? nh(fieldLabelKey) : item.label
                          })()}
                          <span className="text-foreground/35"> → </span>€
                          {item.value.toLocaleString(currencyLocale)}
                        </span>
                      )
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Attachment preview — quiet inline chips */}
              <AnimatePresence>
                {attachments.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                    className="flex gap-1.5 flex-wrap"
                  >
                    {attachments.map((file, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-foreground/[0.04] text-xs text-foreground/70"
                      >
                        {file.type.startsWith('image/') ? (
                          <ImageIcon className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-foreground/40 hover:text-foreground/70"
                          aria-label="Remove attachment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Composer card — Aurora Clarity glass surface, rounded-2xl,
                  primary-tinted focus ring. Textarea sits on top; the file +
                  send buttons share a footer row inside the same card. */}
              <div
                className={cn(
                  'group relative flex flex-col w-full',
                  'rounded-2xl p-2',
                  'bg-foreground/[0.03] backdrop-blur-xl',
                  'border border-foreground/[0.08]',
                  'transition-[border-color,box-shadow] duration-300',
                  'focus-within:border-primary/40',
                  'focus-within:shadow-[0_0_40px_-12px_hsl(var(--primary)/0.18)]',
                  isInputFocused ? 'border-primary/40' : 'hover:border-foreground/[0.12]',
                  'shadow-sm'
                )}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    fieldContext
                      ? ca('askAboutField', { field: (fieldContext.label || '').toLowerCase() })
                      : ca('askOrCommand')
                  }
                  rows={3}
                  className={cn(
                    'w-full bg-transparent border-0 outline-none resize-none',
                    'focus:outline-none focus:ring-0 focus:border-0',
                    'text-base sm:text-sm min-h-[88px] leading-relaxed px-3 py-2',
                    'text-foreground placeholder:text-foreground/35'
                  )}
                  disabled={isGenerating}
                  aria-label={ca('chatInput')}
                />

                <div className="flex items-center justify-between px-1 pb-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors touch-manipulation"
                    aria-label={ca('addFile')}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={(!input.trim() && attachments.length === 0) || isGenerating}
                    className={cn(
                      'shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-colors touch-manipulation',
                      (input.trim() || attachments.length > 0) && !isGenerating
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85'
                        : 'bg-foreground/[0.06] text-foreground/30 cursor-not-allowed'
                    )}
                    aria-label={ca('send')}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
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
