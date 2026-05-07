'use client'

/**
 * FindingPeek — Apollo-style single-finding nudge above the StudioCoPilot FAB.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  StudioIssue,
  StudioIssueSeverity,
} from '@/features/startup-studio/hooks/useStudioIssues'
import { useStudioLocale } from '@/features/startup-studio/i18n/useStudioLocale'
import { cn } from '@/lib/utils'

const SEVERITY_VISUAL: Record<
  StudioIssueSeverity,
  {
    dot: string
    border: string
    accent: string
    rank: number
  }
> = {
  block: {
    dot: 'bg-rose-500',
    border: 'border-rose-300/40 dark:border-rose-700/40',
    accent: 'text-rose-600 dark:text-rose-300',
    rank: 0,
  },
  warn: {
    dot: 'bg-amber-500',
    border: 'border-amber-300/40 dark:border-amber-700/40',
    accent: 'text-amber-600 dark:text-amber-300',
    rank: 1,
  },
  info: {
    dot: 'bg-sky-500',
    border: 'border-sky-300/40 dark:border-sky-700/40',
    accent: 'text-sky-600 dark:text-sky-300',
    rank: 2,
  },
}

interface FindingPeekProps {
  issues: StudioIssue[]
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  open: boolean
  onAskAi: (issue: StudioIssue) => void
  onSnooze: () => void
}

export function FindingPeek({ issues, open, onAskAi, onSnooze }: FindingPeekProps) {
  const locale = useStudioLocale()
  const t = useTranslations('startupStudio.findingPeek')
  const tNav = useTranslations('startupStudio.common')
  const sorted = useMemo(
    () =>
      [...issues].sort(
        (a, b) => SEVERITY_VISUAL[a.severity].rank - SEVERITY_VISUAL[b.severity].rank,
      ),
    [issues],
  )

  const [index, setIndex] = useState(0)
  const peekRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (index > 0 && index >= sorted.length) {
      setIndex(Math.max(0, sorted.length - 1))
    }
  }, [sorted.length, index])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (peekRef.current?.contains(target)) return
      onSnooze()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSnooze()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onSnooze])

  const issue = sorted[index] ?? sorted[0]
  const total = sorted.length

  return (
    <AnimatePresence>
      {open && issue && (
        <motion.aside
          ref={peekRef}
          key="finding-peek"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          role="complementary"
          aria-label={t('ariaPeek')}
          className={cn(
            'pointer-events-auto fixed bottom-24 right-6 z-30',
            'w-[min(20rem,calc(100vw-3rem))] rounded-xl border bg-background/95 shadow-md backdrop-blur',
            SEVERITY_VISUAL[issue.severity].border,
          )}
        >
          <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_VISUAL[issue.severity].dot)}
              />
              <span className={SEVERITY_VISUAL[issue.severity].accent}>
                {t(`severity.${issue.severity}` as 'severity.block')}
              </span>
              {total > 1 && (
                <span className="font-medium text-foreground/40">
                  · {index + 1}/{total}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onSnooze}
              aria-label={t('dismissAria')}
              title="Later"
              className="-mr-1 rounded-md p-1 text-foreground/40 transition hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div className="px-3.5 pb-2.5 pt-1">
            <p className="text-sm font-semibold leading-snug text-foreground">
              {issue.title[locale]}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-foreground/65">
              {issue.action[locale]}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.06] px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => onAskAi(issue)}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15"
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {t('askCopilot')}
            </button>
            {total > 1 && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  aria-label={tNav('previous')}
                  className="rounded-md p-1 text-foreground/55 transition hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                  disabled={index === total - 1}
                  aria-label={tNav('next')}
                  className="rounded-md p-1 text-foreground/55 transition hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
