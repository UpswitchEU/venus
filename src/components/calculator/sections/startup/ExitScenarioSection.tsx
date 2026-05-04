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

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraInput } from '@/design-system'
import { CurrencyInput } from '../../CurrencyInput'
import { AdaptivePercentInput } from '../AdaptivePercentInput'
import { ValuationSectionHeader } from '../ValuationSectionHeader'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STARTUP_SECTOR_EXIT_MULTIPLES,
  type StartupSector,
  type StartupStage,
} from '@/store/manual/useStartupValuationStore'
import { getRegionalBaseline } from './regionalBaseline'

/** UI default Target ROI — academic mid-point surfaced in copy. */
export const DEFAULT_TARGET_ROI_X = 15

const STAGE_LABEL_KEY: Record<StartupStage, string> = {
  pre_seed: 'stagePreSeed',
  seed: 'stageSeed',
  series_a: 'stageSeriesA',
}

const SECTOR_LABEL_KEY: Record<StartupSector, string> = {
  saas: 'sectorSaas',
  marketplace: 'sectorMarketplace',
  fintech: 'sectorFintech',
  biotech_healthtech: 'sectorBiotech',
  deeptech_ai: 'sectorDeeptech',
  consumer: 'sectorConsumer',
  hardware: 'sectorHardware',
  other: 'sectorOther',
}

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

  if (inv <= 0) return { post, pre: post, investment: 0, dilution: 0 }

  const pre = Math.max(0, post - inv)
  const rawDilution = (inv / post) * 100
  const dilution = Math.max(0, Math.min(100, rawDilution))
  return { post, pre, investment: inv, dilution }
}

export interface ExitScenarioSectionProps {
  step: number
  sector: StartupSector
  stage: StartupStage
  countryCode: string
  year5Revenue: number | null
  exitMultiple: number | null
  targetRoi: number | null
  investmentSought: number | null
  dilutionPct: number | null
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

  const sectorLabel = t(SECTOR_LABEL_KEY[sector])
  const stageLabel = t(STAGE_LABEL_KEY[stage])
  const y5Suggestion = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[sector]
  const sectorMultiple = STARTUP_SECTOR_EXIT_MULTIPLES[sector]

  const formatEur = useMemo(
    () => (n: number) => {
      const tag = locale === 'en' ? 'en-BE' : 'nl-BE'
      try {
        return new Intl.NumberFormat(tag, {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
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

  const sectionId = 'startup-section-exit-scenario'
  const oversubscribed = preview && preview.investment > 0 && preview.pre <= 0

  const missingVcLabels = useMemo(() => {
    const out: string[] = []
    if (year5Revenue == null || year5Revenue <= 0) out.push(t('y5Revenue'))
    if (exitMultiple == null || exitMultiple <= 0) out.push(t('exitMultiple'))
    if (targetRoi == null || targetRoi <= 0) out.push(t('targetRoi'))
    if (investmentSought == null || investmentSought <= 0) out.push(t('investmentAmountSought'))
    return out
  }, [year5Revenue, exitMultiple, targetRoi, investmentSought, t])

  const vcSectionComplete = missingVcLabels.length === 0

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
          complete={vcSectionComplete}
          title={t('section3Title')}
        />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('section3Description')}</p>

      <div
        role="status"
        className={[
          'rounded-lg border px-3 py-2 text-xs leading-relaxed',
          vcSectionComplete
            ? 'border-primary/30 bg-primary/[0.06] text-foreground'
            : 'border-foreground/10 bg-background/60 text-muted-foreground',
        ].join(' ')}
      >
        {vcSectionComplete
          ? t('vcSectionValidityReady')
          : t('vcSectionValidityTodo', { items: missingVcLabels.join(' · ') })}
      </div>

      <div className="flex flex-col gap-4">
        <CurrencyInput
          size="sm"
          required
          truncateLabel={false}
          label={t('y5Revenue')}
          description={t('y5RevenueDescription', {
            sectorLabel,
            suggestion: formatEur(y5Suggestion),
          })}
          value={year5Revenue ?? undefined}
          onChange={(v) => onFieldChange('year5_revenue_projection', v ?? null)}
        />

        <AuroraInput
          size="sm"
          required
          truncateLabel={false}
          type="number"
          inputMode="decimal"
          step="0.5"
          label={t('exitMultiple')}
          description={t('exitMultipleDescription', {
            sectorLabel,
            multiple: sectorMultiple,
          })}
          placeholder={t('exitMultiplePlaceholder', {
            multiple: sectorMultiple,
          })}
          value={exitMultiple ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onFieldChange('exit_revenue_multiple', null)
              return
            }
            const n = Number(raw)
            onFieldChange('exit_revenue_multiple', Number.isFinite(n) ? n : null)
          }}
        />

        <AuroraInput
          size="sm"
          required
          truncateLabel={false}
          type="number"
          inputMode="decimal"
          step="1"
          label={t('targetRoi')}
          description={t('targetRoiDescription', {
            stageLabel,
            stageRoi: stageRoiSuggestion,
            defaultRoi: DEFAULT_TARGET_ROI_X,
          })}
          placeholder={t('targetRoiPlaceholder', {
            stageRoi: stageRoiSuggestion,
            defaultRoi: DEFAULT_TARGET_ROI_X,
          })}
          value={targetRoi ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onFieldChange('target_roi_x', null)
              return
            }
            const n = Number(raw)
            onFieldChange('target_roi_x', Number.isFinite(n) ? n : null)
          }}
        />

        <CurrencyInput
          size="sm"
          required
          truncateLabel={false}
          label={t('investmentAmountSought')}
          description={t('investmentAmountSoughtHelper')}
          value={investmentSought ?? undefined}
          onChange={(v) => onFieldChange('investment_amount_sought', v ?? null)}
        />

        <AdaptivePercentInput
          label={t('dilutionAssumptionOptional')}
          description={t('dilutionDescription')}
          value={dilutionPct ?? undefined}
          onChange={(v) => onFieldChange('dilution_assumption_pct', v ?? null)}
          size="sm"
          truncateLabel={false}
        />
      </div>

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
