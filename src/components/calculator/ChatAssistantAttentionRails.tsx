'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import type { PendingAssistantUpdate } from './ChatAssistantDrawer.types'
import type { QualityWarning, StartupAssistantIssue } from './ChatAssistantTypes'

interface StartupIssueRailProps {
  startupIssues: StartupAssistantIssue[]
  onDismissStartupIssue?: (issueId: string) => void
  onResolveStartupIssue?: (issueId: string, prompt: string) => void
  onApplyStartupIssueQuickFix?: (issueId: string) => void
  onJumpToStartupIssue?: (issueId: string) => void
}

export function StartupIssueRail({
  startupIssues,
  onDismissStartupIssue,
  onResolveStartupIssue,
  onApplyStartupIssueQuickFix,
  onJumpToStartupIssue,
}: StartupIssueRailProps) {
  const ca = useTranslations('chatAssistant')

  if (startupIssues.length === 0) return null

  return (
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
              {issue.quickFixLabel && (
                <button
                  type="button"
                  onClick={() => onApplyStartupIssueQuickFix?.(issue.id)}
                  className="min-h-[40px] rounded-full bg-primary/10 hover:bg-primary/15 border border-primary/15 hover:border-primary/25 px-3.5 py-1.5 text-xs font-medium text-primary/90 hover:text-primary transition-colors whitespace-nowrap touch-manipulation sm:min-h-0 sm:px-3 sm:py-1"
                >
                  {issue.quickFixLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => onResolveStartupIssue?.(issue.id, issue.ctaPrompt)}
                className="min-h-[40px] rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.08] hover:border-foreground/[0.14] px-3.5 py-1.5 text-xs text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap touch-manipulation sm:min-h-0 sm:px-3 sm:py-1"
              >
                {issue.ctaLabel}
              </button>
              {issue.jumpLabel && (
                <button
                  type="button"
                  onClick={() => onJumpToStartupIssue?.(issue.id)}
                  className="min-h-[40px] rounded-full hover:bg-foreground/[0.04] px-3.5 py-1.5 text-xs text-foreground/55 hover:text-foreground/80 transition-colors touch-manipulation sm:min-h-0 sm:px-3 sm:py-1"
                >
                  {issue.jumpLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismissStartupIssue?.(issue.id)}
                className="min-h-[40px] rounded-full hover:bg-foreground/[0.04] px-3.5 py-1.5 text-xs text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation sm:min-h-0 sm:px-3 sm:py-1"
              >
                {ca('dismissWarning')}
              </button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

interface QualityWarningRailProps {
  qualityWarnings: QualityWarning[]
  onDismissQualityWarning?: (warningType: string) => void
  onResolveQualityWarning?: (warningType: string, prompt: string) => void
}

export function QualityWarningRail({
  qualityWarnings,
  onDismissQualityWarning,
  onResolveQualityWarning,
}: QualityWarningRailProps) {
  const ca = useTranslations('chatAssistant')

  if (qualityWarnings.length === 0) return null

  return (
    <div
      className="shrink-0 px-4 sm:px-5 pt-4 pb-2 space-y-4"
      data-testid="assistant-engine-insights"
    >
      {qualityWarnings.map((warning) => (
        <motion.div
          key={warning.type}
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
            {warning.message ? (
              <p className="text-[15px] sm:text-sm leading-relaxed text-foreground">
                {warning.message}
              </p>
            ) : null}
            {warning.recommendation ? (
              <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/70 mt-1.5">
                {warning.recommendation}
              </p>
            ) : null}
          </div>
          <div className="ml-2 flex flex-wrap items-center gap-1.5">
            {warning.cta_label && warning.cta_prompt ? (
              <button
                type="button"
                onClick={() => onResolveQualityWarning?.(warning.type, warning.cta_prompt || '')}
                className="min-h-[40px] rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/[0.08] hover:border-foreground/[0.14] px-3.5 py-1.5 text-xs text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap touch-manipulation sm:min-h-0 sm:px-3 sm:py-1"
              >
                {warning.cta_label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDismissQualityWarning?.(warning.type)}
              className="min-h-[40px] rounded-full hover:bg-foreground/[0.04] px-3.5 py-1.5 text-xs text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation sm:min-h-0 sm:px-3 sm:py-1"
            >
              {ca('dismissWarning')}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

interface PendingFieldUpdatesCardProps {
  pendingUpdates: PendingAssistantUpdate[]
  currencyLocale: string
  onApplyFieldUpdate?: (field: string, value: unknown) => void
  onAcceptUpdate?: (field: string) => void
  onRejectUpdate?: (field: string) => void
}

export function PendingFieldUpdatesCard({
  pendingUpdates,
  currencyLocale,
  onApplyFieldUpdate,
  onAcceptUpdate,
  onRejectUpdate,
}: PendingFieldUpdatesCardProps) {
  const ca = useTranslations('chatAssistant')

  if (pendingUpdates.length === 0) return null

  return (
    <div className="shrink-0 px-4 sm:px-5 pt-4 pb-2 flex flex-col items-start gap-2">
      <div className="max-w-[88%] rounded-2xl rounded-tl-md px-4 py-3 bg-foreground/[0.03] border border-foreground/[0.08]">
        <p className="text-[15px] sm:text-sm leading-relaxed text-foreground mb-2">
          {ca('suggestedUpdates')}
        </p>
        <ul className="space-y-1.5">
          {pendingUpdates.map((update) => (
            <li key={update.field} className="flex items-baseline justify-between gap-3 text-sm">
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
                  className="inline-flex min-h-[36px] items-center rounded-full px-2.5 text-primary/85 hover:text-primary transition-colors touch-manipulation sm:min-h-0 sm:px-0"
                >
                  {ca('accept')}
                </button>
                <span className="text-foreground/20">·</span>
                <button
                  type="button"
                  onClick={() => onRejectUpdate?.(update.field)}
                  className="inline-flex min-h-[36px] items-center rounded-full px-2.5 text-foreground/45 hover:text-foreground/70 transition-colors touch-manipulation sm:min-h-0 sm:px-0"
                >
                  {ca('dismissWarning')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
