'use client'

/**
 * Step — Founder Pedigree.
 *
 * Six discrete, defensible qualifications that drive a multiplicative
 * overlay on the leg-blend baseline (Berkus + Scorecard + VC + SaaS
 * Forward).  Replaces the implicit "management strength" slider in
 * Berkus + Scorecard with an explicit, investor-verifiable claim.
 *
 * Engine source-of-truth lives in:
 *   `apps/valuation-iq/src/domain/startup_valuation/founder_pedigree.py`
 *
 * The UI mirrors the deltas (`PEDIGREE_DELTA_PCT`) so the live receipt
 * can render the "+0.30×" / "−0.20×" chips without an engine round-trip.
 * The headline number on the report always comes back from the engine.
 *
 * Mutual exclusion: picking ``solo_founder`` clears
 * ``has_technical_cofounder`` (and vice-versa) so the founder cannot
 * claim both a discount and a lift on the same axis.
 */

import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  calculatePedigreeMultiplier,
  type FounderPedigreeKey,
  PEDIGREE_DELTA_PCT,
  PEDIGREE_EVIDENCE_MAX_LEN,
  PEDIGREE_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

/** @deprecated `locale` ignored — copy comes from next-intl route locale. */
interface FounderPedigreeStepProps {
  locale?: 'en' | 'nl' | 'fr'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(2)}×`
}

export function FounderPedigreeStep(_props: FounderPedigreeStepProps) {
  const t = useTranslations('startupStudio.pedigree')
  const flags = useStartupValuationStore((s) => s.founder_pedigree)
  const setFlag = useStartupValuationStore((s) => s.setPedigreeFlag)
  const evidence = useStartupValuationStore((s) => s.pedigree_evidence)
  const setEvidence = useStartupValuationStore((s) => s.setPedigreeEvidence)

  // A6 — auto-focus the evidence textarea the moment a positive flag
  // is checked (penalties + solo_founder don't need evidence). Without
  // this, founders ticked "Repeat founder" + "Technical co-founder" +
  // "Domain expert" thinking each adds a multiplier, only to discover
  // 60s later that the engine zeroed every claim because the evidence
  // text was empty. The auto-focus + the chip's "pending" suffix +
  // the amber border together make the evidence requirement
  // unmissable instead of a silent gotcha.
  const evidenceRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null)
  useEffect(() => {
    if (!pendingFocusKey) return
    const el = evidenceRefs.current[pendingFocusKey]
    if (el) {
      // Defer to the next frame so the framer-motion enter transition
      // has finished — focusing during the layout animation jumps the
      // viewport unpleasantly on long forms.
      requestAnimationFrame(() => {
        el.focus({ preventScroll: false })
      })
    }
    setPendingFocusKey(null)
  }, [pendingFocusKey])
  const handleFlagToggle = useCallback(
    (key: FounderPedigreeKey, nextChecked: boolean) => {
      setFlag(key, nextChecked)
      // Only auto-focus on POSITIVE deltas being newly checked — penalties
      // (solo_founder) don't take evidence; unchecks shouldn't yank focus.
      if (
        nextChecked &&
        key !== 'solo_founder' &&
        PEDIGREE_DELTA_PCT[key] > 0 &&
        !(evidence[key as Exclude<FounderPedigreeKey, 'solo_founder'>] ?? '').trim()
      ) {
        setPendingFocusKey(key)
      }
    },
    [evidence, setFlag]
  )

  const multiplier = calculatePedigreeMultiplier(flags)

  /**
   * Effective multiplier — the engine zeroes any positive delta whose
   * evidence string is empty.  This local mirror of that math gives the
   * founder honest UI feedback (the live receipt up top) instead of
   * promising 1.30× and then quietly delivering 1.00× in the report.
   */
  const evidencedFlags = { ...flags } as Record<FounderPedigreeKey, boolean>
  for (const key of PEDIGREE_KEYS) {
    if (key === 'solo_founder') continue
    if (flags[key] && !(evidence[key] ?? '').trim()) {
      evidencedFlags[key] = false
    }
  }
  const effectiveMultiplier = calculatePedigreeMultiplier(evidencedFlags)
  const lostToMissingEvidence = Math.abs(multiplier - effectiveMultiplier) > 0.001

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm leading-relaxed text-foreground/70">{t('introInputPrompt')}</p>
            {/* Solo-founder asymmetry citation + Strebulaev calibration
                citation moved to the ValuationIQ report (advisor-CTA
                partial / pedigree section) on 2026-05-10 — both were
                pure methodology citation, which belongs on the
                output side. The picker stays as the input control. */}
          </div>
          <div
            className={cn(
              'shrink-0 rounded-xl px-4 py-3 text-center transition-colors',
              effectiveMultiplier > 1
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : effectiveMultiplier < 1
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'bg-foreground/5 text-foreground/70'
            )}
          >
            <p className="text-[10px] uppercase tracking-wide opacity-75">
              {t('effectiveMultiplier')}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">
              {effectiveMultiplier.toFixed(2)}×
            </p>
            {lostToMissingEvidence ? (
              <p className="mt-1 text-[10px] font-medium opacity-90">
                {t('claimedNeutralized', { claimed: multiplier.toFixed(2) })}
              </p>
            ) : (
              <p className="mt-1 text-[10px] opacity-65">
                {effectiveMultiplier > 1 && t('liftApplied')}
                {effectiveMultiplier < 1 && t('discountApplied')}
                {effectiveMultiplier === 1 && t('noOverlay')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {PEDIGREE_KEYS.map((key) => {
          const checked = flags[key]
          const delta = PEDIGREE_DELTA_PCT[key]
          const isPenalty = delta < 0
          const evidenceKey =
            key === 'solo_founder' ? null : (key as Exclude<FounderPedigreeKey, 'solo_founder'>)
          const evidenceText = evidenceKey ? (evidence[evidenceKey] ?? '') : ''
          const evidenceMissing = checked && evidenceKey !== null && !evidenceText.trim()

          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'rounded-2xl border transition-all',
                checked
                  ? isPenalty
                    ? 'border-amber-400 bg-amber-500/5 shadow-inner'
                    : evidenceMissing
                      ? 'border-amber-400 bg-amber-500/5 shadow-inner'
                      : 'border-primary bg-primary/5 shadow-inner'
                  : 'border-foreground/10 bg-background/60 hover:border-primary/40 hover:bg-primary/[0.03]'
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => handleFlagToggle(key, !checked)}
                className={cn(
                  'group block w-full rounded-2xl p-5 text-left',
                  'focus:outline-none focus:ring-2 focus:ring-primary/40'
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      checked
                        ? isPenalty
                          ? 'border-amber-500 bg-amber-500'
                          : evidenceMissing
                            ? // A6 — checkbox glyph also flips amber when
                              // a positive flag is checked but the
                              // evidence is still empty.  Card border was
                              // already amber in this state; the checkbox
                              // matching it makes the "pending" status
                              // visible from a 30cm reading distance
                              // instead of needing the founder to look at
                              // the chip's small "· pending" suffix.
                              'border-amber-500 bg-amber-500'
                            : 'border-primary bg-primary'
                        : 'border-foreground/30 group-hover:border-primary/60'
                    )}
                  >
                    {checked && (
                      <svg
                        className="h-3 w-3 text-background"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {t(`options.${key}.title`)}
                      </h3>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                          isPenalty
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : evidenceMissing
                              ? 'bg-foreground/10 text-foreground/55 line-through'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        )}
                        // Surface the gate inline on the chip so the
                        // founder sees "+0.30× pending evidence" the
                        // moment they tick the box, instead of seeing
                        // a confident +0.30× and only later (in the
                        // bottom-right multiplier card) discovering it
                        // was neutralized.
                        title={
                          evidenceMissing
                            ? `${formatDelta(delta)} · ${t('liftPendingChipSuffix')}`
                            : undefined
                        }
                      >
                        {formatDelta(delta)}
                        {evidenceMissing && (
                          <span className="ml-1 text-[10px] font-medium uppercase tracking-wide opacity-80">
                            · {t('liftPendingChipSuffix')}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
                      {t(`options.${key}.description`)}
                    </p>
                    <p className="mt-2 text-xs text-foreground/55">
                      {t(`options.${key}.evidence`)}
                    </p>
                  </div>
                </div>
              </button>

              {checked && evidenceKey && (
                <div className="border-t border-foreground/10 px-5 py-4">
                  <label
                    htmlFor={`pedigree-evidence-${evidenceKey}`}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground/75"
                  >
                    {evidenceMissing && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    {t('evidenceLabel')}
                  </label>
                  <textarea
                    id={`pedigree-evidence-${evidenceKey}`}
                    // A6 — keep a per-row ref so handleFlagToggle can
                    // requestAnimationFrame-focus this textarea right
                    // after the founder ticks the parent flag.
                    ref={(el) => {
                      evidenceRefs.current[key] = el
                    }}
                    rows={2}
                    value={evidenceText}
                    onChange={(e) => setEvidence(evidenceKey, e.target.value)}
                    placeholder={t(`placeholders.${evidenceKey}`)}
                    className={cn(
                      'mt-1.5 block w-full resize-none rounded-md border bg-background/80 px-3 py-2 text-sm leading-relaxed',
                      'placeholder:text-foreground/40',
                      'focus:outline-none focus:ring-2 focus:ring-primary/40',
                      evidenceMissing
                        ? 'border-amber-400/70'
                        : 'border-foreground/15 focus:border-primary/60'
                    )}
                    maxLength={PEDIGREE_EVIDENCE_MAX_LEN}
                  />
                  {evidenceMissing ? (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                      {t('evidenceMissingEngine')}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-foreground/55">
                      {t('evidenceCounter', { count: evidenceText.length })}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Strebulaev calibration / 0.70×–1.80× clamp citation moved
          to the ValuationIQ report (advisor-CTA partial) on
          2026-05-10. The clamp is engine behaviour, not input
          guidance — the founder doesn't need to know the empirical
          envelope to pick which pedigree claims apply. */}
    </div>
  )
}
