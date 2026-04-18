'use client'

/**
 * Component 3 — Exit Scenario (VC Method)
 * ----------------------------------------
 *
 * Academic blueprint (Sahlman 1989, refreshed by First Round / a16z 2024) —
 * see `apps/valuation-iq/src/domain/startup_valuation/vc_method.py`:
 *
 *   pre_money = (Year_5_Revenue × Exit_Multiple ÷ Target_ROI) − Investment_Sought
 *
 * Sector + stage smart defaults are baked into
 * `STARTUP_SECTOR_EXIT_MULTIPLES` and `STARTUP_STAGE_DEFAULT_RAISE`,
 * mirrored in `regional_data.py` so the panel never disagrees with
 * the engine.  Default Target ROI is 15× — the academic mid-point
 * across stages (pre-seed 30× → seed 20× → series A 10×).
 *
 * UX:
 *
 *   - Sector default flows in from the *setup bar* (top of the panel)
 *     into the exit-multiple field; founders can override.
 *   - The "round-too-large" warning fires the moment the implied
 *     post-money is smaller than the investment ask, mirroring
 *     `vc_method` clamping the leg to zero.  Without it the founder
 *     watches their VC valuation silently disappear.
 */

import { useId, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraInput } from '@/design-system'
import { CurrencyInput } from '../../CurrencyInput'
import { AdaptivePercentInput } from '../AdaptivePercentInput'
import { ValuationSectionHeader } from '../ValuationSectionHeader'
import {
  STARTUP_SECTOR_EXIT_MULTIPLES,
  type StartupSector,
  type StartupStage,
} from '@/store/manual/useStartupValuationStore'
import { getRegionalBaseline } from './regionalBaseline'

/**
 * UI default Target ROI.  Academic mid-point (Sahlman/INSEAD) — the
 * actual stage-aware default the engine uses comes from
 * `regional_data.default_target_roi_x` and is surfaced to the
 * founder as a "Suggested for {stage}" placeholder so they can
 * override on a per-deal basis.
 */
export const DEFAULT_TARGET_ROI_X = 15

/**
 * Academic VC formula — pure mirror of `vc_method.calculate_vc_method`
 * (without Decimal quantisation).  Returns a structured result so the
 * UI can render the same warning/preview the report does.
 */
export function previewVcMethod({
  year5Revenue,
  exitMultiple,
  targetRoi,
  investmentSought,
  fallbackRoi,
}: {
  year5Revenue: number | null | undefined
  exitMultiple: number | null | undefined
  targetRoi: number | null | undefined
  investmentSought: number | null | undefined
  fallbackRoi: number
}): { post: number; pre: number; investment: number; dilution: number } | null {
  const y5 = typeof year5Revenue === 'number' ? year5Revenue : 0
  const m = typeof exitMultiple === 'number' ? exitMultiple : 0
  const roi =
    typeof targetRoi === 'number' && targetRoi > 0 ? targetRoi : fallbackRoi
  const inv = typeof investmentSought === 'number' && investmentSought > 0 ? investmentSought : 0

  if (y5 <= 0 || m <= 0 || roi <= 0) return null

  const post = (y5 * m) / roi
  if (post <= 0) return null

  // When no investment is supplied, the entire post-money becomes pre-money.
  if (inv <= 0) return { post, pre: post, investment: 0, dilution: 0 }

  const pre = Math.max(0, post - inv)
  // Match the report-side defensive clamp on dilution.
  const rawDilution = (inv / post) * 100
  const dilution = Math.max(0, Math.min(100, rawDilution))
  return { post, pre, investment: inv, dilution }
}

export interface ExitScenarioSectionProps {
  step: number
  /**
   * Setup-bar selections — flowed in from the parent panel so we can
   * surface sector-aware default copy (multiple suggestions, ROI hint).
   */
  sector: StartupSector
  stage: StartupStage
  countryCode: string
  /** VC-method inputs (current store values). */
  year5Revenue: number | null
  exitMultiple: number | null
  targetRoi: number | null
  investmentSought: number | null
  dilutionPct: number | null
  /** Single dispatch for every field this section owns. */
  onFieldChange: (
    field:
      | 'year5_revenue_projection'
      | 'exit_revenue_multiple'
      | 'target_roi_x'
      | 'investment_amount_sought'
      | 'dilution_assumption_pct',
    value: number | null,
  ) => void
  className?: string
}

export function ExitScenarioSection({
  step,
  sector,
  stage,
  countryCode,
  year5Revenue,
  exitMultiple,
  targetRoi,
  investmentSought,
  dilutionPct,
  onFieldChange,
  className,
}: ExitScenarioSectionProps) {
  const t = useTranslations('manualInput.startupValuation')
  const locale = useLocale()

  const baseline = useMemo(
    () => getRegionalBaseline(countryCode, stage),
    [countryCode, stage],
  )
  const stageRoiSuggestion = baseline.default_target_roi_x

  const formatEur = useMemo(
    () => (n: number) => {
      const tag = locale === 'en' ? 'en-BE' : 'nl-BE'
      try {
        return new Intl.NumberFormat(tag, {
          style: 'currency',
          currency: 'EUR',
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(n)
      } catch {
        return `€${Math.round(n).toLocaleString()}`
      }
    },
    [locale],
  )

  const preview = useMemo(
    () =>
      previewVcMethod({
        year5Revenue,
        exitMultiple,
        targetRoi,
        investmentSought,
        fallbackRoi: stageRoiSuggestion,
      }),
    [year5Revenue, exitMultiple, targetRoi, investmentSought, stageRoiSuggestion],
  )

  const reactId = useId()
  const sectionId = 'startup-section-exit-scenario'
  const oversubscribed = preview && preview.investment > 0 && preview.pre <= 0

  return (
    <motion.section
      key={sectionId}
      id={sectionId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      aria-labelledby={`${sectionId}-heading`}
      className={[
        'space-y-3 rounded-xl border border-foreground/[0.06] bg-background/40 p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div id={`${sectionId}-heading`}>
        <ValuationSectionHeader
          step={step}
          complete={year5Revenue != null && year5Revenue > 0 && investmentSought != null && investmentSought > 0}
          title={t('section3Title')}
        />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('section3Description')}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CurrencyInput
          size="sm"
          label={t('y5Revenue')}
          value={year5Revenue ?? undefined}
          onChange={(v) => onFieldChange('year5_revenue_projection', v ?? null)}
        />
        <AuroraInput
          size="sm"
          type="number"
          inputMode="decimal"
          step="0.5"
          label={t('exitMultiple')}
          // Show the sector-specific multiple as a placeholder so the
          // founder sees the academic suggestion before they type.
          placeholder={t('exitMultiplePlaceholder', {
            multiple: STARTUP_SECTOR_EXIT_MULTIPLES[sector],
          })}
          value={exitMultiple ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            onFieldChange('exit_revenue_multiple', raw === '' ? null : Number(raw))
          }}
        />
        <AuroraInput
          size="sm"
          type="number"
          inputMode="decimal"
          step="1"
          label={t('targetRoi')}
          // Engine uses stage-aware default; surface it so founders
          // know which suggestion the engine will fall back to.
          placeholder={t('targetRoiPlaceholder', {
            stageRoi: stageRoiSuggestion,
            defaultRoi: DEFAULT_TARGET_ROI_X,
          })}
          value={targetRoi ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            onFieldChange('target_roi_x', raw === '' ? null : Number(raw))
          }}
          aria-describedby={`exit-roi-hint-${reactId}`}
        />
        <CurrencyInput
          size="sm"
          label={t('investmentAmountSought')}
          description={t('investmentAmountSoughtHelper')}
          value={investmentSought ?? undefined}
          onChange={(v) => onFieldChange('investment_amount_sought', v ?? null)}
        />
        <AdaptivePercentInput
          label={t('dilutionAssumption')}
          value={dilutionPct ?? undefined}
          onChange={(v) => onFieldChange('dilution_assumption_pct', v ?? null)}
        />
      </div>

      <p
        id={`exit-roi-hint-${reactId}`}
        className="text-[11px] leading-tight text-muted-foreground"
      >
        {t('section3RoiHint', {
          stageRoi: stageRoiSuggestion,
          defaultRoi: DEFAULT_TARGET_ROI_X,
        })}
      </p>

      {/* Live cap-table preview — confirms the implied dilution */}
      {preview && preview.investment > 0 && preview.pre > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {t('capTableSimulatorTitle')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground">
            {t.rich('capTableSimulatorLine', {
              amount: formatEur(preview.investment),
              preMoney: formatEur(preview.pre),
              dilution: preview.dilution.toFixed(1),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
            {t('capTableSimulatorDisclaimer')}
          </p>
        </motion.div>
      )}

      {/* Asking-too-much warning */}
      {oversubscribed && preview && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="rounded-lg border border-amber-400/60 bg-amber-50/60 p-3 dark:border-amber-500/40 dark:bg-amber-950/20"
          role="alert"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {t('vcOversubscribedTitle')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground">
            {t.rich('vcOversubscribedLine', {
              amount: formatEur(preview.investment),
              postMoney: formatEur(preview.post),
              shortfall: formatEur(Math.max(0, preview.investment - preview.post)),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </motion.div>
      )}
    </motion.section>
  )
}

export default ExitScenarioSection
