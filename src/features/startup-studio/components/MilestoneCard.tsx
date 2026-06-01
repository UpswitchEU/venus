'use client'

/**
 * MilestoneCard
 * -------------
 *
 * Generic "pick one of N evidence-based maturity options" card used by
 * Step 1 (Berkus 2.0) and Step 2 (Scorecard 2.0) of the Studio wizard.
 *
 * Each card surfaces:
 *   1. a clear title + investor-facing subtitle,
 *   2. four maturity options as radio-style large buttons,
 *   3. an expandable "Why this matters / examples" disclosure,
 *   4. a free-text evidence field that becomes the founder's
 *      justification sentence in the PDF report.
 *
 * The discrete option pattern replaces the legacy 0–100 sliders that
 * felt like guesswork ("natte vingerwerk") to founders.
 */

import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type KeyboardEvent, useId, useState } from 'react'
import { AuroraTextarea } from '@/design-system/components/Input'
import { getMilestoneCopy, type StudioLocale } from '@/features/startup-studio/data/maturityOptions'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStudioLocale } from '@/features/startup-studio/i18n/useStudioLocale'
import { trackStudioEvidenceAdded } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import {
  MATURITY_TO_SCORE,
  type MaturityLevel,
  type StudioMilestoneKey,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

interface MilestoneCardProps {
  milestoneKey: StudioMilestoneKey
  /** EUR value the engine attributes per milestone at the founder's
   *  region+stage.  Used to render the live "+€X" chip per option. */
  maxPerMilestoneEur?: number
  /** @deprecated Route locale from next-intl is used. */
  locale?: StudioLocale
  /** Optional weight badge (Scorecard cards only). */
  weightPct?: number
}

export function MilestoneCard({
  milestoneKey,
  maxPerMilestoneEur,
  locale: _localeProp,
  weightPct,
}: MilestoneCardProps) {
  const locale = useStudioLocale()
  const t = useTranslations('startupStudio.milestone')
  const copy = getMilestoneCopy(milestoneKey, locale)
  const selected = useStartupValuationStore((s) => s.maturity[milestoneKey])
  const evidence = useStartupValuationStore((s) => s.evidence_notes[milestoneKey])
  const setMaturity = useStartupValuationStore((s) => s.setMaturity)
  const setEvidence = useStartupValuationStore((s) => s.setEvidenceNote)
  const [open, setOpen] = useState(false)
  const labelId = useId()

  const handlePick = (level: MaturityLevel) => {
    setMaturity(milestoneKey, level)
  }

  const handleEvidenceBlur = () => {
    if (evidence?.trim().length) trackStudioEvidenceAdded(milestoneKey)
  }

  /**
   * Roving-tabindex keyboard handler for the maturity radiogroup.
   *   ArrowDown / ArrowRight → next option
   *   ArrowUp   / ArrowLeft  → previous option
   *   Home / End             → first / last option
   * Each option is `tabIndex={isSelected ? 0 : -1}` so Tab moves to/from
   * the group as a single stop.
   */
  const handleKeyNav = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event
    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'ArrowRight' &&
      key !== 'ArrowLeft' &&
      key !== 'Home' &&
      key !== 'End'
    ) {
      return
    }
    event.preventDefault()
    const levels = copy.options.map((o) => o.level)
    const currentIdx = Math.max(0, levels.indexOf(selected))
    let nextIdx = currentIdx
    if (key === 'ArrowDown' || key === 'ArrowRight') nextIdx = (currentIdx + 1) % levels.length
    if (key === 'ArrowUp' || key === 'ArrowLeft')
      nextIdx = (currentIdx - 1 + levels.length) % levels.length
    if (key === 'Home') nextIdx = 0
    if (key === 'End') nextIdx = levels.length - 1
    handlePick(levels[nextIdx])
  }

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="rounded-2xl border border-foreground/10 bg-background/60 p-6 shadow-sm backdrop-blur"
      data-milestone={milestoneKey}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id={labelId} className="text-lg font-semibold text-foreground">
            {copy.title}
          </h3>
          <p className="mt-1 text-sm text-foreground/60">{copy.subtitle}</p>
        </div>
        {weightPct != null && (
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {weightPct}% {t('weight')}
          </span>
        )}
      </header>

      <div
        className="grid gap-2.5"
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyNav}
      >
        {copy.options.map((opt, idx) => {
          const isSelected = selected === opt.level
          // If nothing is selected yet, the first option is the keyboard
          // entry point so Tab actually lands inside the group.
          const isInitialFocus = !isSelected && selected === 'none' && idx === 0
          const eurValue =
            maxPerMilestoneEur != null
              ? Math.round((MATURITY_TO_SCORE[opt.level] / 100) * maxPerMilestoneEur)
              : null
          return (
            <button
              key={opt.level}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || isInitialFocus ? 0 : -1}
              onClick={() => handlePick(opt.level)}
              className={cn(
                'group flex items-start justify-between gap-4 rounded-xl border p-4 text-left transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-inner'
                  : 'border-foreground/10 bg-background/40 hover:border-primary/40 hover:bg-primary/[0.03]'
              )}
            >
              <div className="flex flex-1 items-start gap-3">
                <span
                  className={cn(
                    'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                    isSelected
                      ? 'border-primary bg-primary'
                      : 'border-foreground/30 group-hover:border-primary/60'
                  )}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-background" />}
                </span>
                <span className="text-sm leading-relaxed text-foreground/85">{opt.label}</span>
              </div>
              {eurValue != null && (
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-xs font-medium tabular-nums',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground/5 text-foreground/55'
                  )}
                  aria-label={`${opt.label} unlocks ${formatEur(eurValue)}`}
                >
                  {opt.level === 'none' ? '—' : `+${formatEur(eurValue)}`}
                </span>
              )}
              {/* Scorecard mode: show the Bill Payne 0.5×–1.5×
                  peer-comparison multiplier this option produces.
                  Mirrors `_score_to_multiplier` in scorecard.py so the
                  founder sees the exact lever they're picking — same
                  number that prints in the method-breakdown table. */}
              {eurValue == null && weightPct != null && (
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-xs font-medium tabular-nums',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground/5 text-foreground/55'
                  )}
                  aria-label={`${opt.label} multiplier ${(0.5 + MATURITY_TO_SCORE[opt.level] / 100).toFixed(2)}×`}
                >
                  {(0.5 + MATURITY_TO_SCORE[opt.level] / 100).toFixed(2)}×
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Why this matters disclosure */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary hover:text-primary/80 sm:min-h-0 sm:px-0"
        aria-expanded={open}
      >
        {t('whatInvestorsLookFor')}
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : 'rotate-0')}
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 space-y-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-4"
        >
          <p className="text-sm leading-relaxed text-foreground/75">{copy.why}</p>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
              {t('beneluxExamples')}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-foreground/70">
              {copy.examples.map((ex, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">→</span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Evidence text — investor justification sentence. The text
          becomes the per-milestone footnote in the investor PDF, so a
          live char counter (especially within 30 chars of the limit)
          tells the founder when they're about to truncate the
          rationale that ships verbatim. The 280-char cap matches
          Twitter-paragraph length — long enough for a defensible
          claim, short enough to read in one breath. */}
      <div className="mt-5">
        <label
          htmlFor={`evidence-${milestoneKey}`}
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-foreground/55"
        >
          {t('yourEvidence')}
        </label>
        <AuroraTextarea
          id={`evidence-${milestoneKey}`}
          rows={2}
          placeholder={copy.evidencePrompt}
          value={evidence ?? ''}
          onChange={(e) => setEvidence(milestoneKey, e.target.value)}
          onBlur={handleEvidenceBlur}
          maxLength={280}
        />
        {(() => {
          const count = (evidence ?? '').length
          const remaining = 280 - count
          // Show counter only once the user has typed something — keeps
          // the empty-state clean, surfaces the limit only when relevant.
          if (count === 0) return null
          const nearLimit = remaining <= 30
          return (
            <p
              className={cn(
                'mt-1 text-[10px] tabular-nums',
                nearLimit ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/45'
              )}
            >
              {nearLimit
                ? t('evidenceCounterNearLimit', { count, remaining })
                : t('evidenceCounter', { count })}
            </p>
          )
        })()}
      </div>
    </motion.section>
  )
}
