'use client'

/**
 * Component 1 — Risk-Reduction Scorecard (Berkus)
 * ------------------------------------------------
 *
 * Academic blueprint (Bill Payne / Berkus 1996, refreshed 2024):
 *
 *   Five qualitative milestones, each scored 0-100 by the founder, scale
 *   a per-milestone EUR cap.  Default cap is €500k per milestone (pre-seed
 *   / seed) for a €2.5M ceiling — series A bumps to €750k for a €3.75M
 *   ceiling.  Numbers come from
 *   `apps/valuation-iq/src/domain/startup_valuation/regional_data.py`,
 *   mirrored locally in `regionalBaseline.ts`.
 *
 * UX:
 *
 *   - Each slider shows its EUR contribution next to the % score
 *     ("€350k of €500k") so the founder feels how every notch they
 *     drag changes the headline pre-money.
 *   - A baseline pill at the top makes the regional anchor explicit
 *     ("Up to €2.5M · Belgian seed-stage benchmark"), which is the #1
 *     thing investors ask about when shown a Berkus score.
 *   - A subtotal pill at the bottom shows the live Berkus pre-money.
 *
 * This is a *self-contained* section that mirrors the rhythm of
 * `SaasMetricsSection` and `DcfGlobalAssumptions` so the founder's
 * left panel feels homogeneous when stacked under the setup bar.
 */

import { useId, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Slider } from '@/design-system'
import { ValuationSectionHeader } from '../ValuationSectionHeader'
import {
  getRegionalBaseline,
  previewBerkusContribution,
} from './regionalBaseline'
import type { StartupStage } from '@/store/manual/useStartupValuationStore'

// Strongly typed list of the 5 Berkus milestones — exactly mirrors
// `BERKUS_MILESTONES` in `berkus.py`, both in name and order.
export const BERKUS_MILESTONE_KEYS = [
  'sound_idea',
  'prototype_status',
  'management_strength',
  'strategic_relationships',
  'product_rollout',
] as const

export type BerkusMilestoneKey = (typeof BERKUS_MILESTONE_KEYS)[number]

interface MilestoneCopy {
  /** i18n key for the slider label. */
  labelKey: string
  /** i18n key for the academic-flavoured helper line. */
  helperKey: string
}

const MILESTONE_COPY: Record<BerkusMilestoneKey, MilestoneCopy> = {
  sound_idea: { labelKey: 'soundIdea', helperKey: 'soundIdeaHelper' },
  prototype_status: { labelKey: 'prototypeStatus', helperKey: 'prototypeStatusHelper' },
  management_strength: {
    labelKey: 'managementStrength',
    helperKey: 'managementStrengthHelper',
  },
  strategic_relationships: {
    labelKey: 'strategicRelationships',
    helperKey: 'strategicRelationshipsHelper',
  },
  product_rollout: { labelKey: 'productRollout', helperKey: 'productRolloutHelper' },
}

/**
 * Format a EUR amount as a compact display string (e.g. €350k, €2.5M).
 * Compact-notation matches the way investor decks talk about Berkus
 * caps and avoids visual noise from full thousands separators on
 * mobile.
 */
function formatCompactEur(amount: number, locale: string): string {
  if (!Number.isFinite(amount)) return '—'
  // `Intl.NumberFormat` with compact notation fall back to scientific
  // formatting in some Node/jsdom builds — guard with manual fallback.
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)
  } catch {
    return `€${Math.round(amount).toLocaleString()}`
  }
}

interface SliderRowProps {
  label: string
  helper?: string
  /** EUR value contribution at the current score (e.g. "€350k of €500k"). */
  contributionDisplay: string
  value: number
  onChange: (value: number) => void
}

/**
 * Berkus 0–100 slider with an EUR-value badge.  Uses the Aurora
 * `Slider` primitive (scalar value + `onChange`) and forwards
 * `aria-label` / `aria-describedby` so screen readers announce the
 * milestone *and* the EUR helper.
 */
function MilestoneSlider({
  label,
  helper,
  contributionDisplay,
  value,
  onChange,
}: SliderRowProps) {
  const reactId = useId()
  const helperId = helper ? `berkus-slider-helper-${reactId}` : undefined
  const valueId = `berkus-slider-value-${reactId}`

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground" aria-hidden>
          {label}
        </span>
        <span
          id={valueId}
          className="text-[11px] font-semibold tabular-nums text-primary"
          aria-hidden
        >
          {value}% · {contributionDisplay}
        </span>
      </div>
      <Slider
        value={value}
        min={0}
        max={100}
        step={5}
        onChange={onChange}
        variant="default"
        aria-label={label}
        aria-describedby={[valueId, helperId].filter(Boolean).join(' ') || undefined}
      />
      {helper ? (
        <p id={helperId} className="text-[11px] leading-tight text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

export interface RiskReductionScorecardSectionProps {
  /** Step badge index — supplied by the parent panel for layout consistency. */
  step: number
  /**
   * Regional context — drives the per-milestone EUR cap.  Mirrors the
   * same `country_code` + `stage` the engine consumes, so the EUR
   * preview shown in the UI is byte-for-byte identical to what the
   * Python engine will compute on submit.
   */
  countryCode: string
  stage: StartupStage
  /** Berkus slider scores (0–100), keyed by milestone. */
  scores: Record<BerkusMilestoneKey, number>
  /**
   * Setter for a single slider score.  Keyed by milestone so the
   * parent can wire it directly to `useStartupValuationStore.setField`
   * without an intermediate dispatcher.
   */
  onScoreChange: (key: BerkusMilestoneKey, value: number) => void
  className?: string
}

/**
 * Step 1 of the founder wizard, rendered as a stacked left-panel
 * section (no Next/Back navigation — just like every other left-panel
 * section: SaaS metrics, DCF assumptions, NAV schedule, …).
 */
export function RiskReductionScorecardSection({
  step,
  countryCode,
  stage,
  scores,
  onScoreChange,
  className,
}: RiskReductionScorecardSectionProps) {
  const t = useTranslations('manualInput.startupValuation')
  const locale = useLocale()

  const baseline = useMemo(
    () => getRegionalBaseline(countryCode, stage),
    [countryCode, stage],
  )

  const formatEur = useMemo(
    () => (n: number) => formatCompactEur(n, locale === 'en' ? 'en-BE' : 'nl-BE'),
    [locale],
  )

  // Per-milestone EUR contribution at the current score.
  const contributions = useMemo(() => {
    return BERKUS_MILESTONE_KEYS.map((key) => ({
      key,
      score: scores[key] ?? 0,
      value: previewBerkusContribution(scores[key] ?? 0, baseline.max_per_milestone),
    }))
  }, [scores, baseline.max_per_milestone])

  const subtotal = useMemo(
    () => contributions.reduce((sum, c) => sum + c.value, 0),
    [contributions],
  )

  const sectionId = `startup-section-berkus`

  return (
    <motion.section
      key={sectionId}
      id={sectionId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      aria-labelledby={`${sectionId}-heading`}
      className={[
        'space-y-5 rounded-xl border border-foreground/[0.06] bg-background/40 p-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div id={`${sectionId}-heading`}>
        <ValuationSectionHeader
          step={step}
          complete={subtotal > 0}
          title={t('section1Title')}
        />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('section1Description')}
      </p>

      {/* Regional baseline pill — explicit academic anchor */}
      <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2">
        <p className="text-[11px] leading-tight text-foreground">
          {t.rich('section1BaselineCallout', {
            totalCap: formatEur(baseline.total_berkus_cap),
            perMilestone: formatEur(baseline.max_per_milestone),
            region: baseline.region_code,
            stage: t(`stage${capitalizeStage(stage)}`),
            strong: (chunks) => (
              <strong className="font-semibold text-primary">{chunks}</strong>
            ),
          })}
        </p>
      </div>

      <div className="space-y-3">
        {contributions.map(({ key, score, value }) => {
          const copy = MILESTONE_COPY[key]
          return (
            <MilestoneSlider
              key={key}
              label={t(copy.labelKey)}
              helper={t(copy.helperKey)}
              contributionDisplay={t('berkusContributionDisplay', {
                value: formatEur(value),
                max: formatEur(baseline.max_per_milestone),
              })}
              value={score}
              onChange={(v) => onScoreChange(key, v)}
            />
          )
        })}
      </div>

      {/* Live subtotal — confirms the Berkus pre-money the engine will compute */}
      <div className="flex items-center justify-between rounded-lg border border-foreground/[0.06] bg-background/60 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('berkusSubtotalLabel')}
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatEur(subtotal)}
        </span>
      </div>
    </motion.section>
  )
}

/**
 * Title-case a stage key to match the i18n key naming convention
 * (e.g. `pre_seed` → `PreSeed`, used as `stagePreSeed`).
 */
function capitalizeStage(stage: StartupStage): string {
  return stage
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export default RiskReductionScorecardSection
