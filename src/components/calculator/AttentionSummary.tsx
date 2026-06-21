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
import { AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/design-system/utils'
import { AttentionCard } from './AttentionSummaryCard'
import { type AttentionItem, buildAttentionItems } from './AttentionSummaryModel'
import type { QualityWarning, StartupAssistantIssue } from './ChatAssistantTypes'

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

  const items = useMemo<AttentionItem[]>(
    () => buildAttentionItems({ startupIssues, qualityWarnings }),
    [startupIssues, qualityWarnings]
  )

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
