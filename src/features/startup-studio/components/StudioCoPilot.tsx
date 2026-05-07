'use client'

/**
 * StudioCoPilot
 * --------------
 *
 * Startup remediation launcher that preserves the Apollo-style nudges
 * (bottom-right FAB + floating finding peek) while routing all chat
 * interactions into the unified `Assistent` drawer in `ManualLayout`.
 *
 * Important: this component no longer renders its own side panel/chat.
 * It only:
 *   1) shows counts + urgency in the FAB
 *   2) nudges unresolved issues via `FindingPeek`
 *   3) hands off "Fix with AI" to the shared assistant callbacks
 */

import { MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FindingPeek } from '@/features/startup-studio/components/FindingPeek'
import type { StudioIssue } from '@/features/startup-studio/hooks/useStudioIssues'
import { cn } from '@/lib/utils'

const PEEK_SNOOZE_KEY_PREFIX = 'upswitch.studio.copilot.peeksnooze.'
const PEEK_AUTO_OPEN_DELAY_MS = 1500

interface StudioCoPilotProps {
  issues: StudioIssue[]
  scopeId?: string
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /**
   * Whether the shared assistant drawer is currently open.
   * Used to hide duplicate nudges while the drawer is active.
   */
  isAssistantOpen?: boolean
  /** Opens the shared assistant drawer. */
  onOpenAssistant?: () => void
  /** Sends a specific issue prompt into the shared assistant. */
  onResolveIssueWithAssistant?: (issue: StudioIssue) => void
}

export function StudioCoPilot({
  issues,
  scopeId = 'default',
  isAssistantOpen = false,
  onOpenAssistant,
  onResolveIssueWithAssistant,
}: StudioCoPilotProps) {
  const t = useTranslations('startupStudio.copilot')
  const [peekOpen, setPeekOpen] = useState(false)
  const [peekSnoozed, setPeekSnoozed] = useState(false)

  // Hydrate the per-scope peek snooze flag. Persisting at scope level
  // means each wizard run gets its own first-peek nudge.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(PEEK_SNOOZE_KEY_PREFIX + scopeId)
      setPeekSnoozed(raw === '1')
    } catch {
      // sessionStorage unavailable — peek will simply auto-open every mount.
    }
  }, [scopeId])

  const handleResolveIssue = useCallback(
    (issue: StudioIssue) => {
      // Peek hands off to the shared assistant.
      setPeekOpen(false)
      if (onResolveIssueWithAssistant) {
        onResolveIssueWithAssistant(issue)
        return
      }
      onOpenAssistant?.()
    },
    [onOpenAssistant, onResolveIssueWithAssistant]
  )

  const handleSnoozePeek = useCallback(() => {
    setPeekOpen(false)
    setPeekSnoozed(true)
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(PEEK_SNOOZE_KEY_PREFIX + scopeId, '1')
    } catch {
      // sessionStorage disabled (incognito) — fall back to in-memory only.
    }
  }, [scopeId])

  const visibleIssues = useMemo(() => issues, [issues])
  const blockerCount = visibleIssues.filter((i) => i.severity === 'block').length
  const warnCount = visibleIssues.filter((i) => i.severity === 'warn').length
  const fabBadgeCount = blockerCount + warnCount

  // Auto-peek once per session, but never while the shared assistant is open.
  useEffect(() => {
    if (peekSnoozed || peekOpen || isAssistantOpen) return
    if (visibleIssues.length === 0) return
    const t = setTimeout(() => setPeekOpen(true), PEEK_AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(t)
  }, [peekSnoozed, peekOpen, isAssistantOpen, visibleIssues.length])

  useEffect(() => {
    if (peekOpen && visibleIssues.length === 0) setPeekOpen(false)
  }, [peekOpen, visibleIssues.length])

  const fabLabel =
    fabBadgeCount > 0 ? t('fabToFix', { count: fabBadgeCount }) : t('fabAllClear')

  return (
    <>
      {!isAssistantOpen && (
        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label={fabLabel}
          className={cn(
            'fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg backdrop-blur transition-all',
            'border border-primary/30 bg-primary text-primary-foreground hover:scale-[1.02] hover:shadow-xl',
            blockerCount > 0 && 'ring-2 ring-rose-300/60'
          )}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{fabLabel}</span>
          <span className="sm:hidden">{fabBadgeCount > 0 ? fabBadgeCount : ''}</span>
          {blockerCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
              {blockerCount}
            </span>
          )}
        </button>
      )}

      {!isAssistantOpen && (
        <FindingPeek
          issues={visibleIssues}
          open={peekOpen && !peekSnoozed}
          onAskAi={handleResolveIssue}
          onSnooze={handleSnoozePeek}
        />
      )}
    </>
  )
}
