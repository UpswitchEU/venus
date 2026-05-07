'use client'

/**
 * Component 2 — Forward-Looking SaaS Metrics
 * -------------------------------------------
 *
 * Academic blueprint (Index Ventures · Seedcamp · Point Nine, INSEAD,
 * LBS, 2025) — see
 * `apps/valuation-iq/src/domain/startup_valuation/saas_forward.py`:
 *
 *   *Forward 12-month ARR* (today's MRR projected forward at the
 *   founder's MoM growth rate) is multiplied by a regional EV/Revenue
 *   forward multiple, then risk-adjusted via the Berkus surface and a
 *   churn drag.  This deliberately replaces the SME `arr_multiple`
 *   lens for the venture path — pre-revenue founders cannot defend a
 *   backward-looking multiple, but they *can* defend a forward ARR
 *   anchored to current MRR plus a stated growth rate.
 *
 * UX:
 *
 *   - Fully *skippable*.  A founder who is pre-revenue toggles the
 *     "Pre-revenue / skip this step" switch, and we clear MRR / ARR /
 *     growth / churn so the engine drops the SaaS Forward leg and
 *     re-normalises the remaining 2 legs (Berkus + VC).  This mirrors
 *     `saas_forward.is_available` — the leg only contributes when MRR
 *     or ARR is supplied.
 *   - When active, a *forward 12-month ARR preview* is computed live
 *     so the founder sees how their inputs translate into the number
 *     the engine will actually multiply.
 */

import { useId, useLayoutEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraButton, AuroraInput } from '@/design-system'
import { CurrencyInput } from '../../CurrencyInput'
import { AdaptivePercentInput } from '../AdaptivePercentInput'
import { ValuationSectionHeader } from '../ValuationSectionHeader'

/**
 * Forecast horizon for the live preview.  Matches `_FORWARD_MONTHS`
 * in `saas_forward.py` so the panel and the engine never disagree.
 */
const FORWARD_MONTHS = 12

/**
 * Hard cap on MoM growth to mirror `_MAX_MOM_GROWTH_PCT` in the engine —
 * keeps the preview from showing fantasy ARRs (e.g. 30% MoM compounded
 * annually = 23× — defensible only on slides, not in valuations).
 */
const MAX_MOM_GROWTH_PCT = 20

function isSaaSLegCoreEmpty(
  mrr: number | null,
  arr: number | null,
  mrrGrowthPct: number | null,
  monthlyChurnPct: number | null,
): boolean {
  return mrr == null && arr == null && mrrGrowthPct == null && monthlyChurnPct == null
}

/**
 * Compute the forward 12-month ARR preview.  Pure function — same
 * formula as `saas_forward._project_forward_arr` (without the Decimal
 * quantisation).  Returns `null` when inputs don't justify a number.
 */
export function projectForwardArrEur({
  mrr,
  arr,
  momGrowthPct,
}: {
  mrr: number | null | undefined
  arr: number | null | undefined
  momGrowthPct: number | null | undefined
}): number | null {
  // Anchor: prefer MRR when available, else infer from ARR.
  const anchorMrr =
    typeof mrr === 'number' && mrr > 0
      ? mrr
      : typeof arr === 'number' && arr > 0
        ? arr / 12
        : null
  if (anchorMrr === null) return null

  const growth =
    typeof momGrowthPct === 'number' && momGrowthPct > 0
      ? Math.min(momGrowthPct, MAX_MOM_GROWTH_PCT)
      : 0
  const monthlyFactor = 1 + growth / 100
  const forwardMrr = anchorMrr * Math.pow(monthlyFactor, FORWARD_MONTHS)
  return Math.round(forwardMrr * 12)
}

export interface ForwardLookingSaasSectionProps {
  step: number
  /**
   * Current store values — kept granular instead of a single `state`
   * prop so the section component is trivially testable in isolation
   * (the test fixture only has to provide what it needs).
   */
  mrr: number | null
  arr: number | null
  mrrGrowthPct: number | null
  monthlyChurnPct: number | null
  cac: number | null
  burnRateMonthly: number | null
  runwayMonths: number | null
  /**
   * Single dispatch hatch for *every* field this section owns.  Kept
   * intentionally generic — see `setField` on `useStartupValuationStore`
   * — so the parent doesn't have to weave 7 individual setters.
   */
  onFieldChange: (
    field:
      | 'mrr'
      | 'arr'
      | 'mrr_growth_rate_pct'
      | 'monthly_churn_pct'
      | 'cac'
      | 'burn_rate_monthly'
      | 'runway_months',
    value: number | null,
  ) => void
  className?: string
}

export function ForwardLookingSaasSection({
  step,
  mrr,
  arr,
  mrrGrowthPct,
  monthlyChurnPct,
  cac,
  burnRateMonthly,
  runwayMonths,
  onFieldChange,
  className,
}: ForwardLookingSaasSectionProps) {
  const t = useTranslations('manualInput.startupValuation')
  const locale = useLocale()

  // Explicit pre-revenue UI mode — "Heractiveer" must re-open the form
  // (derived-only skip made the re-enable button a no-op when fields were hidden).
  const [isPreRevenue, setIsPreRevenue] = useState(() =>
    isSaaSLegCoreEmpty(mrr, arr, mrrGrowthPct, monthlyChurnPct),
  )

  // When persisted traction loads, exit pre-revenue UI before paint.
  useLayoutEffect(() => {
    if (!isSaaSLegCoreEmpty(mrr, arr, mrrGrowthPct, monthlyChurnPct)) {
      setIsPreRevenue(false)
    }
  }, [mrr, arr, mrrGrowthPct, monthlyChurnPct])

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

  const forwardArr = useMemo(
    () => projectForwardArrEur({ mrr, arr, momGrowthPct: mrrGrowthPct }),
    [mrr, arr, mrrGrowthPct],
  )

  /**
   * Toggle pre-revenue mode. "I'm pre-revenue" clears the four SaaS-leg
   * inputs so the engine drops the forward-SaaS leg; "Re-enable" shows
   * the fields again without prefilling.
   */
  const handleToggleSkip = () => {
    if (isPreRevenue) {
      setIsPreRevenue(false)
      return
    }
    // Clear every SaaS-traction field so the engine cannot anchor on stale
    // unit-economics after the founder says "pre-revenue" (matches TractionStep).
    onFieldChange('mrr', null)
    onFieldChange('arr', null)
    onFieldChange('mrr_growth_rate_pct', null)
    onFieldChange('monthly_churn_pct', null)
    onFieldChange('cac', null)
    onFieldChange('burn_rate_monthly', null)
    onFieldChange('runway_months', null)
    setIsPreRevenue(true)
  }

  const reactId = useId()
  const skipBtnId = `forward-saas-skip-${reactId}`
  const sectionId = 'startup-section-forward-saas'

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
      <div className="flex items-start justify-between gap-3">
        <div id={`${sectionId}-heading`} className="flex-1">
          <ValuationSectionHeader
            step={step}
            complete={!isPreRevenue && (mrr != null || arr != null)}
            title={t('section2Title')}
          />
        </div>
        {/* Skip toggle — explicit, single-click, idempotent */}
        <AuroraButton
          id={skipBtnId}
          type="button"
          variant={isPreRevenue ? 'primary' : 'ghost'}
          size="sm"
          onClick={handleToggleSkip}
          aria-pressed={isPreRevenue}
        >
          {isPreRevenue ? t('section2SkipBadgeOn') : t('section2SkipBadgeOff')}
        </AuroraButton>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {isPreRevenue ? t('section2DescriptionSkipped') : t('section2Description')}
      </p>

      {!isPreRevenue && (
        <>
          <div className="flex flex-col gap-4">
            <CurrencyInput
              size="sm"
              truncateLabel={false}
              label={t('mrr')}
              value={mrr ?? undefined}
              onChange={(v) => onFieldChange('mrr', v ?? null)}
            />
            <AdaptivePercentInput
              label={t('mrrGrowth')}
              value={mrrGrowthPct ?? undefined}
              onChange={(v) => onFieldChange('mrr_growth_rate_pct', v ?? null)}
              size="sm"
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={t('monthlyChurn')}
              value={monthlyChurnPct ?? undefined}
              onChange={(v) => onFieldChange('monthly_churn_pct', v ?? null)}
              size="sm"
              truncateLabel={false}
            />
            <CurrencyInput
              size="sm"
              truncateLabel={false}
              label={t('cac')}
              value={cac ?? undefined}
              onChange={(v) => onFieldChange('cac', v ?? null)}
            />
            <CurrencyInput
              size="sm"
              truncateLabel={false}
              label={t('burnRate')}
              value={burnRateMonthly ?? undefined}
              onChange={(v) => onFieldChange('burn_rate_monthly', v ?? null)}
            />
            <AuroraInput
              size="sm"
              truncateLabel={false}
              type="number"
              inputMode="numeric"
              label={t('runwayMonths')}
              value={runwayMonths ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                onFieldChange('runway_months', raw === '' ? null : Number(raw))
              }}
            />
          </div>

          {/* Live forward 12-month ARR preview — confirms the number
              the engine will actually multiply by the EV/Revenue
              forward multiple. */}
          {forwardArr !== null && forwardArr > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {t('forwardArrPreviewTitle')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                {t.rich('forwardArrPreviewLine', {
                  arr: formatEur(forwardArr),
                  growth:
                    typeof mrrGrowthPct === 'number' && mrrGrowthPct > 0
                      ? Math.min(mrrGrowthPct, MAX_MOM_GROWTH_PCT).toFixed(1)
                      : '0',
                  months: FORWARD_MONTHS,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              {typeof mrrGrowthPct === 'number' && mrrGrowthPct > MAX_MOM_GROWTH_PCT && (
                <p className="mt-1 text-[10px] leading-tight text-amber-700 dark:text-amber-300">
                  {t('forwardArrGrowthCapped', { cap: MAX_MOM_GROWTH_PCT })}
                </p>
              )}
            </motion.div>
          )}
        </>
      )}
    </motion.section>
  )
}

export default ForwardLookingSaasSection
