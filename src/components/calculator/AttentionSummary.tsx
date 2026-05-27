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
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  onDismissQualityWarning,
}: AttentionSummaryProps) {
  const ca = useTranslations('chatAssistant')

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
    setOpen(items.length === 1)
    setExpandedKeys(new Set())
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
              'flex-1 min-w-0 flex items-center gap-2.5 px-3.5 py-2.5',
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
              'shrink-0 px-3 text-xs text-foreground/55 hover:text-foreground/85',
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
}: AttentionCardProps) {
  const hasBody = Boolean(item.body && item.body.trim().length > 0)
  const hasResolve = Boolean(item.ctaLabel && item.ctaPrompt)
  const hasQuickFix = Boolean(item.quickFixLabel)
  const hasJump = Boolean(item.jumpLabel)
  // When there is no AI-resolve action, the quick-fix IS the headline action
  // — render it in the primary style instead of the muted secondary style so
  //   the advisor's eye lands on something actionable.
  const quickFixIsPrimary = hasQuickFix && !hasResolve

  const primaryButtonClass = cn(
    'rounded-full px-2.5 py-0.5 text-xs font-medium',
    'bg-primary/10 text-primary/90 border border-primary/15',
    'hover:bg-primary/15 hover:text-primary hover:border-primary/25 transition-colors',
    'touch-manipulation'
  )
  const secondaryButtonClass = cn(
    'rounded-full px-2.5 py-0.5 text-xs',
    'bg-foreground/[0.04] text-foreground/75 border border-foreground/[0.08]',
    'hover:bg-foreground/[0.08] hover:text-foreground hover:border-foreground/[0.14] transition-colors',
    'touch-manipulation'
  )
  const linkButtonClass = cn(
    'rounded-full px-2.5 py-0.5 text-xs',
    'text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.04] transition-colors',
    'touch-manipulation'
  )

  return (
    <div
      className={cn(
        'group flex flex-col gap-1.5',
        compact ? 'px-3.5 py-2.5' : 'rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-3.5 py-2.5'
      )}
      data-testid={`attention-item-${item.key}`}
      data-severity={item.severity}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_DOT[item.severity])}
          aria-hidden
        />
        <button
          type="button"
          onClick={hasBody ? onToggle : undefined}
          className={cn(
            'flex-1 min-w-0 text-left text-sm leading-snug text-foreground/90',
            // Title clamp keeps a 200-char engine message from eating the
            // panel; full body is reachable by tap when present.
            !isOpen && 'line-clamp-2',
            hasBody && 'cursor-pointer hover:text-foreground touch-manipulation'
          )}
          aria-expanded={hasBody ? isOpen : undefined}
        >
          {item.title}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            'shrink-0 h-6 w-6 rounded-md flex items-center justify-center',
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

      {(hasResolve || hasQuickFix || hasJump) && (
        <div className="pl-5 flex flex-wrap items-center gap-1.5">
          {hasResolve && (
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
    </div>
  )
}
