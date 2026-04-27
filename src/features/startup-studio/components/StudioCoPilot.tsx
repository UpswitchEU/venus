'use client'

/**
 * StudioCoPilot
 * --------------
 *
 * Self-contained AI assistant surface for the Studio v2 wizard.
 *
 *   ┌──── FAB (bottom-right) ────┐
 *   │   "Co-pilot · 2 to fix"    │     →    [ slide-over panel ]
 *   └────────────────────────────┘
 *
 * Why a slim copilot instead of mounting `ChatAssistantDrawer`?
 *   - The legacy drawer is wired tightly to the SME ManualLayout
 *     (1800+ lines, Zustand `useConversationStore`, normalization /
 *     field-update tooling). Studio v2 has none of those concerns.
 *   - Studio's job is narrower: surface the structured `StudioIssue`
 *     items derived in `useStudioIssues` and let the founder/advisor
 *     resolve them in a chat turn — so the PDF stays clean and
 *     defensible. No tool-use, no normalization rail, no field rewrites.
 *
 * The component owns its own message history (sessionStorage scoped to
 * the wizard run, so leaving and coming back keeps the conversation).
 * Network goes through the existing `aiChatService.streamMessage` →
 * `/api/ai/chat` → Titan SSE pipeline; no new backend.
 *
 * Stays display-only on the wizard state — when the assistant suggests
 * a change ("set exit multiple to 6×"), it tells the user where to
 * change it. We deliberately do NOT auto-mutate `useStartupValuationStore`
 * from inside the chat: every wizard input has a small typed surface,
 * and the assistant's job is education + framing, not silent overwrites.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  StudioIssue,
  StudioIssueSeverity,
  StudioStepId,
} from '@/features/startup-studio/hooks/useStudioIssues'
import { cn } from '@/lib/utils'
import { aiChatService } from '@/services/ai/AIChatService'

interface CoPilotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

const SESSION_KEY_PREFIX = 'upswitch.studio.copilot.'
const MAX_PERSISTED_MESSAGES = 30

const STEP_LABELS: Record<StudioStepId, { en: string; nl: string }> = {
  profile: { en: 'Profile', nl: 'Profiel' },
  berkus: { en: 'Risk reduction', nl: 'Risico-reductie' },
  scorecard: { en: 'Defensibility', nl: 'Defensibility' },
  founder_pedigree: { en: 'Team pedigree', nl: 'Team' },
  traction: { en: 'Traction', nl: 'Tractie' },
  exit_story: { en: 'Exit story', nl: 'Exit-verhaal' },
  round_simulator: { en: 'Round', nl: 'Ronde' },
  report: { en: 'Report', nl: 'Rapport' },
}

const SEVERITY_STYLES: Record<
  StudioIssueSeverity,
  { dot: string; pill: string; label: { en: string; nl: string } }
> = {
  block: {
    dot: 'bg-rose-500',
    pill: 'border-rose-300/50 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    label: { en: 'Must fix', nl: 'Te fixen' },
  },
  warn: {
    dot: 'bg-amber-500',
    pill: 'border-amber-300/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    label: { en: 'Recommended', nl: 'Aanbevolen' },
  },
  info: {
    dot: 'bg-sky-500',
    pill: 'border-sky-300/40 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    label: { en: 'Heads-up', nl: 'Let op' },
  },
}

interface StudioCoPilotProps {
  issues: StudioIssue[]
  /** Stable id for sessionStorage scoping (wizard run / report id). */
  scopeId?: string
  /** Founder/advisor locale. */
  locale?: 'en' | 'nl'
  /** Optional callback so the parent can deep-link to the relevant step. */
  onJumpToStep?: (step: StudioStepId) => void
  /** Open state — controlled when provided, uncontrolled otherwise. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Optional company name to ground the assistant context. */
  companyName?: string
}

function loadPersistedMessages(scopeId: string): CoPilotMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY_PREFIX + scopeId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CoPilotMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed.slice(-MAX_PERSISTED_MESSAGES)
  } catch {
    return []
  }
}

function persistMessages(scopeId: string, messages: CoPilotMessage[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      SESSION_KEY_PREFIX + scopeId,
      JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES))
    )
  } catch {
    // sessionStorage disabled (incognito, Safari) — silently no-op.
  }
}

export function StudioCoPilot({
  issues,
  scopeId = 'default',
  locale = 'en',
  onJumpToStep,
  open: openProp,
  onOpenChange,
  companyName,
}: StudioCoPilotProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next)
      else setInternalOpen(next)
    },
    [onOpenChange]
  )

  const [messages, setMessages] = useState<CoPilotMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [resolvedIssueIds, setResolvedIssueIds] = useState<Set<string>>(new Set())

  const streamCleanupRef = useRef<(() => void) | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Hydrate from sessionStorage once per scopeId. We can't read inline
  // in useState because Next.js SSR would mismatch.
  useEffect(() => {
    setMessages(loadPersistedMessages(scopeId))
  }, [scopeId])

  // Persist on every change (cap at MAX_PERSISTED_MESSAGES).
  useEffect(() => {
    if (messages.length === 0) return
    persistMessages(scopeId, messages)
  }, [messages, scopeId])

  // Cleanup any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      streamCleanupRef.current?.()
    }
  }, [])

  // Auto-scroll on new content / streaming chunks.
  useEffect(() => {
    if (!open) return
    const last = messages[messages.length - 1]
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    // Re-run when streaming content lengthens, not just on count change.
    void last?.content?.length
  }, [open, messages])

  // Auto-focus textarea on open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => textareaRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [open])

  // Escape closes; only when open to keep the listener cheap.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, setOpen])

  const sendMessage = useCallback(
    (content: string, originatingIssueId?: string) => {
      const trimmed = content.trim()
      if (!trimmed || isStreaming) return

      const userMsg: CoPilotMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      }
      const streamingId = `a-${Date.now()}`
      setMessages((prev) => [...prev, userMsg, { id: streamingId, role: 'assistant', content: '' }])
      setInput('')
      setIsStreaming(true)

      let streamed = ''
      streamCleanupRef.current?.()
      streamCleanupRef.current = aiChatService.streamMessage(
        {
          message: trimmed,
          companyName,
          locale,
          // The wizard does not know the report id yet (created on submit),
          // so we scope the conversation to the wizard session id only.
          sessionId: scopeId,
          history: messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        {
          onText: (text) => {
            streamed += text
            setMessages((prev) =>
              prev.map((m) => (m.id === streamingId ? { ...m, content: streamed } : m))
            )
          },
          onDone: () => {
            streamCleanupRef.current = null
            setIsStreaming(false)
            if (originatingIssueId) {
              setResolvedIssueIds((prev) => {
                const next = new Set(prev)
                next.add(originatingIssueId)
                return next
              })
            }
          },
          onError: (error) => {
            streamCleanupRef.current = null
            setIsStreaming(false)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId
                  ? {
                      ...m,
                      content:
                        locale === 'nl'
                          ? `De assistent is even niet bereikbaar (${error}). Probeer opnieuw — je inputs blijven bewaard.`
                          : `The assistant is briefly unavailable (${error}). Try again — your wizard inputs are preserved.`,
                      isError: true,
                    }
                  : m
              )
            )
          },
        }
      )
    },
    [companyName, isStreaming, locale, messages, scopeId]
  )

  const handleResolveIssue = useCallback(
    (issue: StudioIssue) => {
      setOpen(true)
      sendMessage(issue.assistantPrompt[locale], issue.id)
    },
    [locale, sendMessage, setOpen]
  )

  const handleJumpToStep = useCallback(
    (step: StudioStepId) => {
      onJumpToStep?.(step)
      setOpen(false)
    },
    [onJumpToStep, setOpen]
  )

  const visibleIssues = useMemo(
    () => issues.filter((i) => !resolvedIssueIds.has(i.id)),
    [issues, resolvedIssueIds]
  )
  const blockerCount = visibleIssues.filter((i) => i.severity === 'block').length
  const warnCount = visibleIssues.filter((i) => i.severity === 'warn').length
  const fabBadgeCount = blockerCount + warnCount

  const fabLabel =
    locale === 'nl'
      ? fabBadgeCount > 0
        ? `Co-pilot · ${fabBadgeCount} te fixen`
        : 'Co-pilot · alles in orde'
      : fabBadgeCount > 0
        ? `Co-pilot · ${fabBadgeCount} to fix`
        : 'Co-pilot · all clear'

  return (
    <>
      {/* Floating launcher — bottom-right, above mobile receipt drawer. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={fabLabel}
          className={cn(
            'fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg backdrop-blur transition-all',
            'border border-primary/30 bg-primary text-primary-foreground hover:scale-[1.02] hover:shadow-xl',
            blockerCount > 0 && 'ring-2 ring-rose-300/60'
          )}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{fabLabel}</span>
          <span className="sm:hidden">{fabBadgeCount > 0 ? fabBadgeCount : ''}</span>
          {blockerCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
              {blockerCount}
            </span>
          )}
        </button>
      )}

      {/* Slide-over panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop on mobile only — keeps the wizard usable on desktop. */}
            <motion.button
              type="button"
              tabIndex={-1}
              aria-label={locale === 'nl' ? 'Co-pilot sluiten' : 'Close co-pilot'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/30 lg:hidden"
              onClick={() => setOpen(false)}
            />

            <motion.aside
              key="copilot-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col border-l border-foreground/10 bg-background shadow-2xl"
              role="dialog"
              aria-label={locale === 'nl' ? 'Studio Co-pilot' : 'Studio Co-pilot'}
            >
              {/* Header */}
              <header className="flex items-center justify-between border-b border-foreground/10 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {locale === 'nl' ? 'Studio Co-pilot' : 'Studio Co-pilot'}
                    </p>
                    <p className="text-[11px] text-foreground/55">
                      {locale === 'nl'
                        ? 'Lost issues op vóór je het PDF-rapport genereert'
                        : 'Resolves issues before you generate the PDF report'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={locale === 'nl' ? 'Sluiten' : 'Close'}
                  className="rounded-md p-1.5 text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              {/* Issue rail */}
              {visibleIssues.length > 0 && (
                <section
                  aria-label={locale === 'nl' ? 'Open issues' : 'Open issues'}
                  className="space-y-2 border-b border-foreground/10 bg-background/60 px-5 py-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                    {locale === 'nl'
                      ? `${visibleIssues.length} issue${visibleIssues.length === 1 ? '' : 's'} te bekijken`
                      : `${visibleIssues.length} issue${visibleIssues.length === 1 ? '' : 's'} to review`}
                  </p>
                  <ul className="space-y-2">
                    {visibleIssues.map((issue) => {
                      const sev = SEVERITY_STYLES[issue.severity]
                      const stepLabel = STEP_LABELS[issue.step][locale]
                      return (
                        <li
                          key={issue.id}
                          className="rounded-lg border border-foreground/10 bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className={cn('h-2 w-2 shrink-0 rounded-full', sev.dot)}
                              />
                              <p className="text-sm font-semibold leading-snug text-foreground">
                                {issue.title[locale]}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                                sev.pill
                              )}
                            >
                              {sev.label[locale]}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
                            {issue.body[locale]}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleResolveIssue(issue)}
                              disabled={isStreaming}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                            >
                              <Sparkles className="h-3 w-3" />
                              {locale === 'nl' ? 'Fix met AI' : 'Fix with AI'}
                            </button>
                            {onJumpToStep && (
                              <button
                                type="button"
                                onClick={() => handleJumpToStep(issue.step)}
                                className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-2.5 py-1 text-[11px] font-medium text-foreground/75 transition hover:border-primary hover:text-primary"
                              >
                                {locale === 'nl' ? 'Ga naar' : 'Jump to'} {stepLabel}
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {visibleIssues.length === 0 && issues.length > 0 && (
                <section className="flex items-center gap-2 border-b border-foreground/10 bg-emerald-50/60 px-5 py-3 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Check className="h-4 w-4" />
                  {locale === 'nl'
                    ? 'Alle issues zijn met de assistent besproken. Je kunt het rapport genereren.'
                    : 'All issues have been discussed with the assistant. You can generate the report.'}
                </section>
              )}

              {visibleIssues.length === 0 && issues.length === 0 && messages.length === 0 && (
                <section className="flex items-center gap-2 border-b border-foreground/10 bg-emerald-50/60 px-5 py-3 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Check className="h-4 w-4" />
                  {locale === 'nl'
                    ? 'Geen openstaande issues — vraag me anything om je waardering aan te scherpen.'
                    : 'No open issues — ask me anything to sharpen your valuation.'}
                </section>
              )}

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.length === 0 && (
                  <div className="rounded-lg border border-dashed border-foreground/15 bg-background/40 p-4 text-xs text-foreground/60">
                    {locale === 'nl'
                      ? 'Tip: tik op "Fix met AI" naast een issue, of stel je eigen vraag.'
                      : 'Tip: tap "Fix with AI" next to an issue, or ask your own question.'}
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : m.isError
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-foreground/[0.06] text-foreground'
                      )}
                    >
                      {m.content || (
                        <span className="inline-flex items-center gap-1.5 text-foreground/50">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {locale === 'nl' ? 'Aan het denken…' : 'Thinking…'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                className="border-t border-foreground/10 bg-background px-5 py-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  sendMessage(input)
                }}
              >
                <div className="flex items-end gap-2 rounded-xl border border-foreground/15 bg-background px-3 py-2 focus-within:border-primary">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(input)
                      }
                    }}
                    placeholder={locale === 'nl' ? 'Vraag de co-pilot…' : 'Ask the co-pilot…'}
                    className="flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    aria-label={locale === 'nl' ? 'Versturen' : 'Send'}
                    className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-40"
                  >
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-foreground/45">
                  <MessageCircle className="h-3 w-3" />
                  {locale === 'nl'
                    ? 'De co-pilot edit je wizard niet zelf — hij legt uit en geeft je de exacte input.'
                    : 'The co-pilot does not edit your wizard for you — it explains and gives you the exact input.'}
                </p>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Inline alert badge for the first blocker — surfaces even when
          the panel is closed, so the founder doesn't miss a hard issue. */}
      {!open && blockerCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 right-6 z-30 max-w-xs rounded-lg border border-rose-300/40 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 shadow-md dark:bg-rose-950/40 dark:text-rose-300"
        >
          <p className="flex items-start gap-1.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {locale === 'nl'
                ? `${blockerCount} blokkerende issue${blockerCount === 1 ? '' : 's'} — open de co-pilot om te fixen voor PDF.`
                : `${blockerCount} blocking issue${blockerCount === 1 ? '' : 's'} — open the co-pilot to resolve before PDF.`}
            </span>
          </p>
        </div>
      )}
    </>
  )
}
