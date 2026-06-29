'use client'

import { motion } from 'framer-motion'
import {
  CheckCheck,
  Copy,
  FileText,
  Image as ImageIcon,
  LogIn,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { springGentle } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { useSmoothStreamedText } from '@/hooks/useSmoothStreamedText'
import { useTransientFlag } from '@/hooks/useTransientFlag'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { ChatAssistantProposalCards } from './ChatAssistantProposalCards'
import type { AgentChoiceSelection, ChatMessage, FieldContext } from './ChatAssistantTypes'
import { CommandPillProvider, StreamingMarkdown } from './StreamingMarkdown'

// Empty state — matches Mercury AdvisorAIDockPanel (dot + title + description).
export function EmptyState({ fieldContext }: { fieldContext?: FieldContext }) {
  const ca = useTranslations('chatAssistant')
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
      <div className="w-1.5 h-1.5 rounded-full bg-primary mb-4" />
      <h3 className="text-sm font-semibold text-foreground mb-1">
        {fieldContext
          ? ca('helpWithField', { field: fieldContext.label || '' })
          : ca('howCanIHelp')}
      </h3>
      <p className="text-xs text-foreground/50 max-w-xs">
        {fieldContext?.hint || ca('askOrUpload')}
      </p>
    </div>
  )
}

// Smooth streaming caret — a soft, gently pulsing block that trails the
// revealed text. Calmer than a hard blinking bar, which itself reads as jitter.
function StreamingCursor() {
  return (
    <motion.span
      aria-hidden
      className="inline-block w-1.5 h-4 ml-0.5 rounded-full bg-primary/80 align-[-2px]"
      animate={{ opacity: [1, 0.25, 1] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

// Message Bubble Component
export function MessageBubble({
  message,
  isStreaming = false,
  onApplyUpdate,
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
  onCommandPillClick,
  integrationsEnabled = false,
  onOpenConsent,
  onRetry,
  onSendFollowUp,
}: {
  message: ChatMessage
  isStreaming?: boolean
  onApplyUpdate?: (field: string, value: unknown) => void
  onAcceptNormalisation?: (id: string) => void
  onRejectNormalisation?: (id: string) => void
  onApproveValuationRun?: (proposalId: string, reportId?: string, methods?: string[] | null) => void
  onRejectValuationRun?: (proposalId: string) => void
  onApproveReportGeneration?: (proposalId: string, reportId?: string) => void
  onRejectReportGeneration?: (proposalId: string) => void
  onApproveSellabilityRun?: (proposalId: string) => void
  onRejectSellabilityRun?: (proposalId: string) => void
  onApproveListingCreate?: (
    proposalId: string,
    reportId?: string,
    accountantCustomerId?: string | null,
    visibility?: 'public' | 'private'
  ) => void
  onRejectListingCreate?: (proposalId: string) => void
  onApplyAgentChoice?: (choice: AgentChoiceSelection) => boolean | Promise<boolean>
  onCommandPillClick?: (command: string) => void
  integrationsEnabled?: boolean
  onOpenConsent?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  /**
   * Programmatic follow-up sender used by the registry-search picker —
   * clicking a row fires "Use {name} ({registry} {number})" so the agent
   * can chain to bootstrap_belgian_company or create_client without the
   * user re-typing. Optional because most renderable cards don't need it.
   */
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const loginLocale = locale === 'fr' || locale === 'nl' || locale === 'en' ? locale : 'en'
  const loginHref = (() => {
    const mercuryUrl = getMercuryUrl().replace(/\/$/, '')
    const returnUrl =
      typeof window !== 'undefined' && window.location?.href
        ? window.location.href
        : `${mercuryUrl}/${loginLocale}`
    return `${mercuryUrl}/${loginLocale}/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
  })()
  const [copied, showCopied] = useTransientFlag(2000)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // Smoothing buffer: reveals streamed text at an even, eased rate so bursty
  // SSE delivery reads like fluid typing instead of jumping in chunks.
  const { text: streamedContent, isAnimating } = useSmoothStreamedText(
    message.content,
    isStreaming && !isUser && !isSystem
  )

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    showCopied()
  }

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="text-center py-2"
      >
        <span className="text-xs text-foreground/40 italic">{message.content}</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      className={cn('flex group/msg', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* No avatar — bubble shape + alignment carry the role distinction
          (Cursor / Lovable / Ilara pattern). */}

      <div
        className={cn(
          'max-w-[88%]',
          isUser
            ? // User bubble: tinted accent
              [
                'rounded-2xl rounded-tr-md',
                'px-4 py-3',
                'bg-primary/12',
                'text-foreground',
                'border border-primary/20',
              ]
            : // Assistant bubble: surface, no chrome
              [
                'rounded-2xl rounded-tl-md',
                'px-5 py-4',
                'bg-foreground/[0.03]',
                'border border-foreground/[0.08]',
                'text-foreground',
                message.isOfflineFallback && 'border-amber-500/25 bg-amber-500/[0.04]',
              ]
        )}
      >
        {!isUser && message.isOfflineFallback ? (
          <p className="text-[11px] font-medium text-amber-700/90 dark:text-amber-400/95 mb-2.5 tracking-wide">
            {ca('offlineFallbackBadge')}
          </p>
        ) : null}
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:gap-1.5 mb-3 sm:mb-2">
            {message.attachments.map((attachment, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-1.5 sm:py-1 rounded-lg text-sm sm:text-xs',
                  isUser
                    ? 'bg-primary/20 text-foreground/80'
                    : 'bg-foreground/[0.06] text-foreground/70'
                )}
              >
                {attachment.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 sm:w-3 sm:h-3" />
                ) : (
                  <FileText className="w-4 h-4 sm:w-3 sm:h-3" />
                )}
                <span className="truncate max-w-[100px] sm:max-w-[80px]">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Content with Markdown for AI, plain text for user */}
        {isUser ? (
          <p className="text-[15px] sm:text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            {/* Block-memoized markdown fed by the smoothing buffer — only the
                final growing block re-parses while streaming. */}
            <CommandPillProvider onCommandPillClick={onCommandPillClick}>
              <StreamingMarkdown content={streamedContent} />
            </CommandPillProvider>
            {(isStreaming || isAnimating) && <StreamingCursor />}
          </div>
        )}

        {message.requiresConsent && onOpenConsent && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onOpenConsent(message.id)}
            className={cn(
              'mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 py-2 sm:min-h-0 sm:px-3 sm:py-1.5',
              'bg-primary/10 text-xs font-medium text-primary',
              'border border-primary/20 transition-all hover:bg-primary/15 active:scale-[0.98] touch-manipulation'
            )}
          >
            <ShieldCheck className="w-3 h-3" />
            {ca('aiConsent.openCta')}
          </motion.button>
        )}

        {message.requiresAuth && (
          <motion.a
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            href={loginHref}
            className={cn(
              'mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 py-2 sm:min-h-0 sm:px-3 sm:py-1.5',
              'text-xs font-medium text-primary',
              'bg-primary/10 border border-primary/20',
              'transition-all hover:bg-primary/15 active:scale-[0.98] touch-manipulation'
            )}
          >
            <LogIn className="w-3 h-3" />
            {ca('signInAgain')}
          </motion.a>
        )}

        {/* Error state with retry */}
        {message.isError && !message.requiresConsent && !message.requiresAuth && onRetry && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onRetry(message.id)}
            className={cn(
              'mt-2 flex min-h-11 items-center gap-1.5 px-3.5 py-2 rounded-lg sm:min-h-0 sm:px-3 sm:py-1.5',
              'text-xs font-medium text-destructive',
              'bg-destructive/10 border border-destructive/20',
              'hover:bg-destructive/15 active:scale-[0.98] transition-all touch-manipulation'
            )}
          >
            <RotateCcw className="w-3 h-3" />
            {ca('retry')}
          </motion.button>
        )}

        {/* Copy button - hover reveal for assistant messages */}
        {!isUser && !isSystem && message.content && !message.isError && (
          <div className="mt-2 flex items-center gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover/msg:opacity-100">
            <button
              onClick={handleCopyMessage}
              className={cn(
                'flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all sm:min-h-0 sm:px-2 sm:py-1',
                copied
                  ? 'text-primary bg-primary/10'
                  : 'text-foreground/35 hover:text-foreground/60 hover:bg-foreground/[0.06]'
              )}
              aria-label={ca('copyMessage')}
            >
              {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? ca('copied') : ca('copy')}
            </button>
          </div>
        )}

        {/* Field updates — flattened. Each one is a single text line:
            "label  €value  · source · confidence  · Apply". No card,
            no header bar, no nested impact panel. */}
        {message.fieldUpdates && message.fieldUpdates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-2.5">
            {message.fieldUpdates.map((update) => {
              const sourceLabel =
                update.source === 'ai'
                  ? ca('aiSuggestion')
                  : update.source === 'yuki'
                    ? 'Yuki'
                    : update.source === 'kbo'
                      ? (ca('registrySource') ?? 'Registry')
                      : update.source
              const confidenceLabel =
                update.confidence === 'high'
                  ? ca('reliable')
                  : update.confidence === 'medium'
                    ? ca('toVerify')
                    : update.confidence === 'low'
                      ? ca('indicative')
                      : null
              const meta: string[] = []
              if (update.grootboekCode) meta.push(update.grootboekCode)
              if (sourceLabel) meta.push(sourceLabel as string)
              if (confidenceLabel) meta.push(confidenceLabel)
              if (update.impact)
                meta.push(
                  `+€${Math.round(update.impact.valuationDelta).toLocaleString(currencyLocale)} ${ca('impactOnValue').toLowerCase()}`
                )

              return (
                <div key={update.field} className="text-sm leading-relaxed">
                  <p className="text-foreground">
                    {update.label}
                    <span className="text-foreground/35 mx-1.5">·</span>
                    <span className="font-mono">
                      €{Math.round(update.value).toLocaleString(currencyLocale)}
                    </span>
                  </p>
                  {meta.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{meta.join(' · ')}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onApplyUpdate?.(update.field, update.value)}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                    >
                      {ca('acceptAndApply')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Normalisation suggestions — flat conversational style: plain text
            continuation inside the bubble, one primary text action + cancel. */}
        {message.normalisationSuggestions && message.normalisationSuggestions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
            {message.normalisationSuggestions.map((suggestion) => {
              const valuationImpact =
                suggestion.valuationImpact ||
                Math.round(suggestion.amount * (suggestion.multiple || 5.2))
              const isPending = suggestion.status === 'pending'
              const isAccepted = suggestion.status === 'accepted'

              return (
                <motion.div
                  key={suggestion.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="text-sm leading-relaxed"
                >
                  <p className="text-foreground">
                    {ca('normalizeSuggestion', {
                      description: (suggestion.description || '').toLowerCase(),
                    })}
                  </p>
                  {suggestion.reason && (
                    <p className="text-foreground/55 text-xs mt-0.5">{suggestion.reason}</p>
                  )}
                  {isPending && (
                    <p className="text-foreground/55 text-xs mt-1 font-mono">
                      {ca('impactEbitdaToValue', {
                        ebitda: Math.round(suggestion.amount).toLocaleString(currencyLocale),
                        value: Math.round(valuationImpact).toLocaleString(currencyLocale),
                      })}
                    </p>
                  )}
                  {isPending ? (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onAcceptNormalisation?.(suggestion.id)}
                        className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                      >
                        {ca('accept')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectNormalisation?.(suggestion.id)}
                        className="inline-flex min-h-11 items-center rounded-full px-3 text-foreground/45 hover:text-foreground/70 transition-colors sm:min-h-0 sm:px-0"
                      >
                        {ca('reject')}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-foreground/45">
                      {isAccepted ? ca('accepted') : ca('rejected')}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        <ChatAssistantProposalCards
          message={message}
          onApproveValuationRun={onApproveValuationRun}
          onRejectValuationRun={onRejectValuationRun}
          onApproveReportGeneration={onApproveReportGeneration}
          onRejectReportGeneration={onRejectReportGeneration}
          onApproveSellabilityRun={onApproveSellabilityRun}
          onRejectSellabilityRun={onRejectSellabilityRun}
          onApproveListingCreate={onApproveListingCreate}
          onRejectListingCreate={onRejectListingCreate}
          onApplyAgentChoice={onApplyAgentChoice}
          onSendFollowUp={onSendFollowUp}
          integrationsEnabled={integrationsEnabled}
        />

        {/* Open tasks — quiet inline list, one line per task. */}
        {message.tasks && message.tasks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-foreground/[0.08]">
            <ul className="space-y-1">
              {message.tasks
                .filter((t) => !t.completed)
                .map((task) => (
                  <li key={task.id} className="text-sm leading-relaxed text-foreground">
                    <span className="text-foreground/35 mr-1.5">→</span>
                    {task.label}
                    {task.context && (
                      <span className="text-foreground/55 ml-1.5 text-xs">— {task.context}</span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Timestamp - refined styling */}
        <span
          className={cn(
            'text-[11px] mt-2.5 block font-medium tracking-wide',
            isUser ? 'text-primary-foreground/50' : 'text-foreground/35'
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}
