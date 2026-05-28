'use client'

import { motion } from 'framer-motion'
import {
  CheckCheck,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LogIn,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/design-system/utils'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { ChatAssistantProposalCards } from './ChatAssistantProposalCards'
import type { AgentChoiceSelection, ChatMessage, FieldContext } from './ChatAssistantTypes'

// Empty State Component - Premium minimal design (no redundant icons)
export function EmptyState({
  onSuggestionClick,
  companyName,
  fieldContext,
  suggestions,
}: {
  onSuggestionClick: (text: string) => void
  companyName?: string
  fieldContext?: FieldContext
  suggestions: string[]
}) {
  const ca = useTranslations('chatAssistant')
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 sm:px-6 py-8 sm:py-10">
      <div className="max-w-md w-full space-y-8 sm:space-y-6">
        {/* Minimal Header - World-class typography hierarchy */}
        <div className="text-center space-y-3 sm:space-y-2">
          <h2 className="text-xl sm:text-lg font-semibold text-foreground tracking-tight">
            {fieldContext
              ? ca('helpWithField', { field: fieldContext.label || '' })
              : companyName
                ? ca('analysisFor', { company: companyName })
                : ca('howCanIHelp')}
          </h2>
          <p className="text-base sm:text-sm text-foreground/50 max-w-xs mx-auto">
            {fieldContext?.hint || ca('askOrUpload')}
          </p>
        </div>

        {/* Suggestions moved to input area pills */}
      </div>
    </div>
  )
}

// Code Block with copy button
function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const ca = useTranslations('chatAssistant')
  const lang = className?.replace(/^language-/, '') || ''
  const codeText = (
    Array.isArray(children) ? children.map(String).join('') : String(children)
  ).replace(/\n$/, '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-foreground/[0.08]">
      <div className="flex items-center justify-between px-4 py-2 bg-foreground/[0.06] border-b border-foreground/[0.06]">
        <span className="text-[11px] font-mono text-foreground/40 uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
            copied
              ? 'text-primary bg-primary/10'
              : 'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06]'
          )}
          aria-label={ca('copyCode')}
        >
          {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? ca('copied') : ca('copy')}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-foreground/[0.03]">
        <code className="text-sm font-mono text-foreground/80 leading-relaxed">{codeText}</code>
      </pre>
    </div>
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
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const loginLocale = locale === 'nl' || locale === 'en' ? locale : 'en'
  const loginHref = (() => {
    const mercuryUrl = getMercuryUrl().replace(/\/$/, '')
    const returnUrl =
      typeof window !== 'undefined' && window.location?.href
        ? window.location.href
        : `${mercuryUrl}/${loginLocale}`
    return `${mercuryUrl}/${loginLocale}/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
  })()
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-foreground mt-3 mb-2 first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/90 mb-3 last:mb-0">
                    {children}
                  </p>
                ),
                ul: ({ children }) => <ul className="space-y-1.5 mb-3 last:mb-0">{children}</ul>,
                ol: ({ children }) => (
                  <ol className="space-y-1.5 mb-3 last:mb-0 list-decimal list-inside">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2 text-[15px] sm:text-sm text-foreground/85">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60 mt-2" />
                    <span>{children}</span>
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => {
                  const text = String(children)
                  if (
                    text.startsWith('"') ||
                    text.toLowerCase().startsWith('normalis') ||
                    text.toLowerCase().startsWith('zet ') ||
                    text.toLowerCase().startsWith('pas ')
                  ) {
                    return (
                      <button
                        type="button"
                        onClick={() => onCommandPillClick?.(text.replace(/^["']|["']$/g, ''))}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium not-italic cursor-pointer hover:bg-primary/20 hover:border-primary/30 active:scale-[0.98] transition-all touch-manipulation"
                      >
                        {children}
                      </button>
                    )
                  }
                  return <em className="italic text-foreground/70">{children}</em>
                },
                // Code: block code lives inside <pre>, inline does not
                pre: ({ children }) => {
                  // Extract the inner <code> and render as CodeBlock
                  const child = Array.isArray(children) ? children[0] : children
                  if (child && typeof child === 'object' && 'props' in child) {
                    return (
                      <CodeBlock className={child.props.className}>
                        {child.props.children}
                      </CodeBlock>
                    )
                  }
                  return <pre>{children}</pre>
                },
                code: ({ children }) => (
                  <code className="px-1.5 py-0.5 rounded bg-foreground/[0.08] text-sm font-mono text-foreground/80">
                    {children}
                  </code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/40 pl-4 my-3 text-foreground/70 italic">
                    {children}
                  </blockquote>
                ),
                // GFM: Tables
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto rounded-lg border border-foreground/[0.08]">
                    <table className="w-full text-sm">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-foreground/[0.04] border-b border-foreground/[0.08]">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-sm text-foreground/80 border-t border-foreground/[0.04]">
                    {children}
                  </td>
                ),
                // GFM: Links
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors"
                  >
                    {children}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ),
                // GFM: Horizontal rule
                hr: () => <hr className="my-4 border-foreground/[0.08]" />,
                // GFM: Strikethrough handled automatically
              }}
            >
              {message.content}
            </ReactMarkdown>
            {/* Streaming cursor */}
            {isStreaming && (
              <motion.span
                className="inline-block w-2 h-4 ml-0.5 bg-primary rounded-sm align-middle"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        )}

        {message.requiresConsent && onOpenConsent && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onOpenConsent(message.id)}
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5',
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
              'mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5',
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
              'mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
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
          <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopyMessage}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
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
                  `+€${update.impact.valuationDelta.toLocaleString(currencyLocale)} ${ca('impactOnValue').toLowerCase()}`
                )

              return (
                <div key={update.field} className="text-sm leading-relaxed">
                  <p className="text-foreground">
                    {update.label}
                    <span className="text-foreground/35 mx-1.5">·</span>
                    <span className="font-mono">
                      €{update.value.toLocaleString(currencyLocale)}
                    </span>
                  </p>
                  {meta.length > 0 && (
                    <p className="text-foreground/55 text-xs mt-0.5">{meta.join(' · ')}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onApplyUpdate?.(update.field, update.value)}
                      className="text-primary/85 hover:text-primary transition-colors font-medium"
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
                        ebitda: suggestion.amount.toLocaleString(currencyLocale),
                        value: valuationImpact.toLocaleString(currencyLocale),
                      })}
                    </p>
                  )}
                  {isPending ? (
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => onAcceptNormalisation?.(suggestion.id)}
                        className="text-primary/85 hover:text-primary transition-colors font-medium"
                      >
                        {ca('accept')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectNormalisation?.(suggestion.id)}
                        className="text-foreground/45 hover:text-foreground/70 transition-colors"
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
