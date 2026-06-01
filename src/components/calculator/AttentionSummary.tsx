'use client'

/**
 * AttentionSummary
 * ----------------
 *
 * Single compact surface that replaces the old stacked `StartupIssueRail`
 * + `QualityWarningRail` cards. Designed for the post-valuation moment:
 * the report is done, the advisor wants to talk to the assistant — caveats
 * should be a *talking point*, never a wall that pushes the composer off
 * screen.
 *
 * Behavior contract:
 *  - Aggregates StartupAssistantIssue + QualityWarning into one severity-
 *    sorted list (block → warn → info).
 *  - When ≥2 items: renders a slim header bar with the count, collapsed by
 *    default. Click expands into a capped scroller (`max-h-[35vh]`) so the
 *    messages area and composer always stay visible.
 *  - When 1 item: renders that single item inline, no header bar.
 *  - Each card is title-first; body opens on tap. Primary action sits inline.
 *  - Dispatches dismiss/resolve/quick-fix/jump back to the original
 *    callbacks so existing engine + telemetry wiring is unchanged.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, ChevronUp, Info, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'
import type { QualityWarning, StartupAssistantIssue } from './ChatAssistantTypes'

type Severity = 'block' | 'warn' | 'info'

interface AttentionItem {
  key: string
  source: 'startup' | 'quality'
  sourceId: string
  severity: Severity
  title: string
  body?: string
  ctaLabel?: string
  ctaPrompt?: string
  quickFixLabel?: string
  jumpLabel?: string
  /** When set, the CTA opens an inline fill form (these fields) instead of chat. */
  inlineFix?: QualityWarning['inlineFix']
  /** When set, the CTA scrolls to this form anchor (a "picker gap") instead of chat. */
  jumpAnchor?: string
}

const SEVERITY_RANK: Record<Severity, number> = { block: 0, warn: 1, info: 2 }

function normalizeSeverity(raw: string | undefined): Severity {
  const v = String(raw ?? '').toLowerCase()
  if (v === 'high' || v === 'block' || v === 'critical') return 'block'
  if (v === 'medium' || v === 'warn' || v === 'warning') return 'warn'
  return 'info'
}

const SEVERITY_DOT: Record<Severity, string> = {
  block: 'bg-rose-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
}

interface AttentionSummaryProps {
  startupIssues: StartupAssistantIssue[]
  qualityWarnings: QualityWarning[]
  onResolveStartupIssue?: (id: string, prompt: string) => void
  onApplyStartupIssueQuickFix?: (id: string) => void
  onJumpToStartupIssue?: (id: string) => void
  onDismissStartupIssue?: (id: string) => void
  onResolveQualityWarning?: (type: string, prompt: string) => void
  onInlineFixQualityWarning?: (type: string, values: Record<string, number>) => void | Promise<void>
  onJumpToQualityWarning?: (anchor: string) => void
  onDismissQualityWarning?: (type: string) => void
}

export function AttentionSummary({
  startupIssues,
  qualityWarnings,
  onResolveStartupIssue,
  onApplyStartupIssueQuickFix,
  onJumpToStartupIssue,
  onDismissStartupIssue,
  onResolveQualityWarning,
  onInlineFixQualityWarning,
  onJumpToQualityWarning,
  onDismissQualityWarning,
}: AttentionSummaryProps) {
  const ca = useTranslations('chatAssistant')

  const inlineLabels = useMemo(
    () => ({
      apply: ca('qualityInlineApply'),
      applying: ca('qualityInlineApplying'),
      cancel: ca('qualityInlineCancel'),
      note: ca('qualityInlineNote'),
    }),
    [ca]
  )

  const items = useMemo<AttentionItem[]>(() => {
    const all: AttentionItem[] = []
    for (const s of startupIssues) {
      // Defensive: skip rows the engine emitted with no usable display title.
      // Without a title we have nothing trustworthy to show — better to drop
      // silently than render an empty card the advisor can't act on.
      const title = (s.title ?? '').trim()
      if (!title) continue
      all.push({
        key: `startup:${s.id}`,
        source: 'startup',
        sourceId: s.id,
        severity: normalizeSeverity(s.severity),
        title,
        body: s.body,
        ctaLabel: s.ctaLabel,
        ctaPrompt: s.ctaPrompt,
        quickFixLabel: s.quickFixLabel,
        jumpLabel: s.jumpLabel,
      })
    }
    for (const q of qualityWarnings) {
      const title = (q.message ?? '').trim()
      if (!title) continue
      all.push({
        key: `quality:${q.type}`,
        source: 'quality',
        sourceId: q.type,
        severity: normalizeSeverity(String(q.severity ?? 'high')),
        title,
        body: q.recommendation,
        ctaLabel: q.cta_label,
        ctaPrompt: q.cta_prompt,
        inlineFix: q.inlineFix,
        jumpAnchor: q.jump?.anchor,
      })
    }
    return all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  }, [startupIssues, qualityWarnings])

  // Fingerprint = set of item keys. When it changes (new items appear or
  // are resolved away) we reset open/expanded state so a brand-new caveat
  // doesn't hide silently inside an already-collapsed panel.
  const fingerprint = useMemo(() => items.map((i) => i.key).join('|'), [items])
  const [open, setOpen] = useState<boolean>(items.length === 1)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    void fingerprint
    // Functional-set bails when value is unchanged so we don't allocate a new
    // Set ref or flip `open` to the same boolean every render. The old form
    // (`setExpandedKeys(new Set())`) churned a fresh reference on every fire,
    // which compounded with parent re-render bursts (autosave / bootstrap
    // settling) into the React #185 cascade traced in the Mercury accountant
    // flow on 2026-05-27.
    const nextOpen = items.length === 1
    setOpen((prev) => (prev === nextOpen ? prev : nextOpen))
    setExpandedKeys((prev) => (prev.size === 0 ? prev : new Set()))
  }, [fingerprint, items.length])

  const blockCount = items.filter((i) => i.severity === 'block').length
  const totalCount = items.length

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleResolve = useCallback(
    (item: AttentionItem) => {
      if (!item.ctaPrompt) return
      if (item.source === 'startup') {
        onResolveStartupIssue?.(item.sourceId, item.ctaPrompt)
      } else {
        onResolveQualityWarning?.(item.sourceId, item.ctaPrompt)
      }
    },
    [onResolveStartupIssue, onResolveQualityWarning]
  )

  const handleInlineFix = useCallback(
    (item: AttentionItem, values: Record<string, number>) =>
      onInlineFixQualityWarning?.(item.sourceId, values),
    [onInlineFixQualityWarning]
  )

  const handleQualityJump = useCallback(
    (item: AttentionItem) => {
      if (item.jumpAnchor) onJumpToQualityWarning?.(item.jumpAnchor)
    },
    [onJumpToQualityWarning]
  )

  const handleQuickFix = useCallback(
    (item: AttentionItem) => {
      if (item.source === 'startup') {
        onApplyStartupIssueQuickFix?.(item.sourceId)
      }
    },
    [onApplyStartupIssueQuickFix]
  )

  const handleJump = useCallback(
    (item: AttentionItem) => {
      if (item.source === 'startup') {
        onJumpToStartupIssue?.(item.sourceId)
      }
    },
    [onJumpToStartupIssue]
  )

  const handleDismiss = useCallback(
    (item: AttentionItem) => {
      if (item.source === 'startup') {
        onDismissStartupIssue?.(item.sourceId)
      } else {
        onDismissQualityWarning?.(item.sourceId)
      }
    },
    [onDismissStartupIssue, onDismissQualityWarning]
  )

  // Bulk-ack helper. Snapshotted from the current items so a parent that
  // updates the array synchronously between dispatches doesn't drop entries.
  const handleDismissAll = useCallback(() => {
    for (const item of items) {
      if (item.source === 'startup') {
        onDismissStartupIssue?.(item.sourceId)
      } else {
        onDismissQualityWarning?.(item.sourceId)
      }
    }
  }, [items, onDismissStartupIssue, onDismissQualityWarning])

  if (items.length === 0) return null

  const headerLabel =
    blockCount > 0
      ? ca('attentionSummaryWithBlockers', { total: totalCount, blockers: blockCount })
      : ca('attentionSummary', { total: totalCount })

  const headerIcon = blockCount > 0 ? AlertTriangle : Info
  const headerColor = blockCount > 0 ? 'text-rose-600' : 'text-amber-600'
  const HeaderIcon = headerIcon

  // Single-item layout: skip the header bar, render inline. The bar would
  // be visual overhead with no expand/collapse value when there is one row.
  if (items.length === 1) {
    const item = items[0]
    if (!item) return null
    return (
      <section
        className="shrink-0 px-4 sm:px-5 pt-3 pb-1"
        role="region"
        aria-label={headerLabel}
        aria-live="polite"
        data-testid="assistant-attention-summary"
      >
        <AttentionCard
          item={item}
          isOpen={expandedKeys.has(item.key)}
          onToggle={() => toggleExpand(item.key)}
          onResolve={() => handleResolve(item)}
          onQuickFix={() => handleQuickFix(item)}
          onJump={() => handleJump(item)}
          onDismiss={() => handleDismiss(item)}
          onInlineFix={
            onInlineFixQualityWarning ? (values) => handleInlineFix(item, values) : undefined
          }
          inlineLabels={inlineLabels}
          onQualityJump={onJumpToQualityWarning ? () => handleQualityJump(item) : undefined}
          dismissLabel={ca('dismissWarning')}
        />
      </section>
    )
  }

  return (
    <section
      className="shrink-0 px-4 sm:px-5 pt-3 pb-1"
      role="region"
      aria-label={headerLabel}
      aria-live="polite"
      data-testid="assistant-attention-summary"
    >
      <div
        className={cn(
          'rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]',
          'overflow-hidden'
        )}
      >
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="assistant-attention-list"
            className={cn(
              'flex-1 min-w-0 flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 sm:min-h-0',
              'text-left text-sm',
              'hover:bg-foreground/[0.03] transition-colors touch-manipulation'
            )}
          >
            <HeaderIcon className={cn('w-4 h-4 shrink-0', headerColor)} aria-hidden />
            <span className="flex-1 min-w-0 truncate text-foreground/85 font-medium">
              {headerLabel}
            </span>
            <span className="shrink-0 text-foreground/40">
              {open ? (
                <ChevronUp className="w-4 h-4" aria-hidden />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden />
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={handleDismissAll}
            className={cn(
              'shrink-0 min-h-11 px-3 text-xs text-foreground/55 hover:text-foreground/85 sm:min-h-0',
              'hover:bg-foreground/[0.04] border-l border-foreground/[0.06]',
              'transition-colors touch-manipulation'
            )}
            data-testid="attention-dismiss-all"
          >
            {ca('attentionDismissAll')}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="attention-list"
              id="assistant-attention-list"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="border-t border-foreground/[0.06]"
            >
              <div
                className={cn(
                  'max-h-[35vh] overflow-y-auto overscroll-contain',
                  'divide-y divide-foreground/[0.06]'
                )}
              >
                {items.map((item) => (
                  <AttentionCard
                    key={item.key}
                    item={item}
                    isOpen={expandedKeys.has(item.key)}
                    onToggle={() => toggleExpand(item.key)}
                    onResolve={() => handleResolve(item)}
                    onQuickFix={() => handleQuickFix(item)}
                    onJump={() => handleJump(item)}
                    onDismiss={() => handleDismiss(item)}
                    onInlineFix={
                      onInlineFixQualityWarning
                        ? (values) => handleInlineFix(item, values)
                        : undefined
                    }
                    inlineLabels={inlineLabels}
                    onQualityJump={
                      onJumpToQualityWarning ? () => handleQualityJump(item) : undefined
                    }
                    dismissLabel={ca('dismissWarning')}
                    compact
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

interface InlineFixLabels {
  apply: string
  applying: string
  cancel: string
  note: string
}

interface AttentionCardProps {
  item: AttentionItem
  isOpen: boolean
  compact?: boolean
  dismissLabel: string
  onToggle: () => void
  onResolve: () => void
  onQuickFix: () => void
  onJump: () => void
  onDismiss: () => void
  onInlineFix?: (values: Record<string, number>) => void | Promise<void>
  inlineLabels?: InlineFixLabels
  onQualityJump?: () => void
}

function AttentionCard({
  item,
  isOpen,
  compact = false,
  dismissLabel,
  onToggle,
  onResolve,
  onQuickFix,
  onJump,
  onDismiss,
  onInlineFix,
  inlineLabels,
  onQualityJump,
}: AttentionCardProps) {
  const [fillOpen, setFillOpen] = useState(false)
  const hasBody = Boolean(item.body && item.body.trim().length > 0)
  const inlineFixFields = item.inlineFix?.fields ?? []
  // Resolution precedence for a quality warning: fill-inline (numbers) >
  // jump-to-control (picker gap) > chat. Whichever applies, the chat CTA is the
  // slow path and is hidden so the advisor lands on a real action.
  const hasInlineFix = Boolean(inlineFixFields.length > 0 && onInlineFix && inlineLabels)
  const hasQualityJump = Boolean(item.jumpAnchor && onQualityJump && !hasInlineFix)
  const hasResolve = Boolean(item.ctaLabel && item.ctaPrompt)
  const showChatResolve = hasResolve && !hasInlineFix && !hasQualityJump
  const hasQuickFix = Boolean(item.quickFixLabel)
  const hasJump = Boolean(item.jumpLabel)
  // When there is no AI-resolve action, the quick-fix IS the headline action
  // — render it in the primary style instead of the muted secondary style so
  //   the advisor's eye lands on something actionable.
  const quickFixIsPrimary = hasQuickFix && !hasResolve

  const primaryButtonClass = cn(
    'min-h-11 rounded-full px-3.5 py-1.5 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-0.5',
    'bg-primary/10 text-primary/90 border border-primary/15',
    'hover:bg-primary/15 hover:text-primary hover:border-primary/25 transition-colors',
    'touch-manipulation'
  )
  const secondaryButtonClass = cn(
    'min-h-11 rounded-full px-3.5 py-1.5 text-xs sm:min-h-0 sm:px-2.5 sm:py-0.5',
    'bg-foreground/[0.04] text-foreground/75 border border-foreground/[0.08]',
    'hover:bg-foreground/[0.08] hover:text-foreground hover:border-foreground/[0.14] transition-colors',
    'touch-manipulation'
  )
  const linkButtonClass = cn(
    'min-h-11 rounded-full px-3.5 py-1.5 text-xs sm:min-h-0 sm:px-2.5 sm:py-0.5',
    'text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.04] transition-colors',
    'touch-manipulation'
  )
  const titleClassName = cn(
    'flex-1 min-w-0 text-left text-sm leading-snug text-foreground/90',
    // Title clamp keeps a 200-char engine message from eating the panel.
    // When a body exists, tapping reveals the full context below.
    !isOpen && 'line-clamp-2',
    hasBody && 'cursor-pointer hover:text-foreground touch-manipulation'
  )

  return (
    <div
      className={cn(
        'group flex flex-col gap-1.5',
        compact
          ? 'px-3.5 py-2.5'
          : 'rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-3.5 py-2.5'
      )}
      data-testid={`attention-item-${item.key}`}
      data-severity={item.severity}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_DOT[item.severity])}
          aria-hidden
        />
        {hasBody ? (
          <button
            type="button"
            onClick={onToggle}
            className={titleClassName}
            aria-expanded={isOpen}
          >
            {item.title}
          </button>
        ) : (
          <p className={titleClassName} title={item.title}>
            {item.title}
          </p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            'shrink-0 h-11 w-11 rounded-md flex items-center justify-center sm:h-6 sm:w-6',
            'text-foreground/30 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors',
            'touch-manipulation'
          )}
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && hasBody && (
          <motion.p
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="pl-5 text-xs leading-relaxed text-foreground/65"
          >
            {item.body}
          </motion.p>
        )}
      </AnimatePresence>

      {(hasInlineFix || hasQualityJump || showChatResolve || hasQuickFix || hasJump) && (
        <div className="pl-5 flex flex-wrap items-center gap-1.5">
          {hasInlineFix && (
            <button
              type="button"
              onClick={() => setFillOpen((v) => !v)}
              aria-expanded={fillOpen}
              className={primaryButtonClass}
            >
              {item.ctaLabel}
            </button>
          )}
          {hasQualityJump && (
            <button type="button" onClick={onQualityJump} className={primaryButtonClass}>
              {item.ctaLabel}
            </button>
          )}
          {showChatResolve && (
            <button type="button" onClick={onResolve} className={primaryButtonClass}>
              {item.ctaLabel}
            </button>
          )}
          {hasQuickFix && (
            <button
              type="button"
              onClick={onQuickFix}
              className={quickFixIsPrimary ? primaryButtonClass : secondaryButtonClass}
              data-primary={quickFixIsPrimary || undefined}
            >
              {item.quickFixLabel}
            </button>
          )}
          {hasJump && (
            <button type="button" onClick={onJump} className={linkButtonClass}>
              {item.jumpLabel}
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {hasInlineFix && fillOpen && onInlineFix && inlineLabels && (
          <InlineFixForm
            key="inline-fix"
            fields={inlineFixFields}
            labels={inlineLabels}
            onApply={onInlineFix}
            onCancel={() => setFillOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface InlineFixFormProps {
  fields: NonNullable<QualityWarning['inlineFix']>['fields']
  labels: InlineFixLabels
  onApply: (values: Record<string, number>) => void | Promise<void>
  onCancel: () => void
}

/**
 * The inline fill: a labelled euro input per field. Apply writes the numbers
 * straight to the valuation and recalculates (the parent clears the warning on
 * the corrected result). Blanks count as 0, so a partial fill still resolves
 * the gap. Digits-only — balance figures are whole euros.
 */
function InlineFixForm({ fields, labels, onApply, onCancel }: InlineFixFormProps) {
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => void (mountedRef.current = false), [])

  const anyFilled = fields.some((field) => (raw[field.key] ?? '').length > 0)

  const handleApply = async () => {
    if (submitting || !anyFilled) return
    const values: Record<string, number> = {}
    for (const field of fields) {
      const digits = (raw[field.key] ?? '').replace(/\D/g, '')
      values[field.key] = digits ? Number.parseInt(digits, 10) : 0
    }
    setSubmitting(true)
    try {
      await onApply(values)
    } finally {
      // On success the corrected result drops the warning and this card
      // unmounts; if it failed (or the warning persists) re-enable for a retry.
      if (mountedRef.current) setSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16 }}
      className="pl-5 overflow-hidden"
    >
      <div className="mt-1 space-y-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-xs font-medium text-foreground/80">{field.label}</span>
            {field.hint && (
              <span className="ml-1.5 text-[11px] text-foreground/45">{field.hint}</span>
            )}
            <div className="mt-1 flex items-center rounded-lg border border-foreground/[0.10] bg-background focus-within:border-primary/40 transition-colors">
              <span className="pl-2.5 pr-1 text-sm text-foreground/40 select-none">€</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={field.label}
                value={raw[field.key] ?? ''}
                onChange={(e) =>
                  setRaw((prev) => ({ ...prev, [field.key]: e.target.value.replace(/\D/g, '') }))
                }
                disabled={submitting}
                placeholder="0"
                className="min-h-11 w-full bg-transparent py-2 pr-2.5 text-sm text-foreground tabular-nums outline-none disabled:opacity-50 sm:min-h-0 sm:py-1.5"
              />
            </div>
          </label>
        ))}
        <p className="text-[11px] leading-relaxed text-foreground/45">{labels.note}</p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={handleApply}
            disabled={submitting || !anyFilled}
            className={cn(
              'min-h-11 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors touch-manipulation sm:min-h-0 sm:px-3 sm:py-1',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {submitting ? labels.applying : labels.apply}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={cn(
              'min-h-11 rounded-full px-3.5 py-1.5 text-xs text-foreground/55 sm:min-h-0 sm:px-2.5 sm:py-1',
              'hover:text-foreground/85 hover:bg-foreground/[0.04] transition-colors touch-manipulation',
              'disabled:opacity-50'
            )}
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
