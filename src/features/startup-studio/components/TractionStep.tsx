'use client'

/**
 * Step 3 — Traction.
 *
 * Yes/no toggle: "Are you generating revenue?" — when no, the SaaS
 * forward leg is silently dropped from the founder triangulation
 * (handled engine-side by `synthesis._resolve_weights`).
 *
 * When yes, the founder enters MRR / growth / churn / CAC and gets a
 * live unit-economics preview (LTV : CAC, payback, forward 12-mo ARR).
 */

import { Calculator } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { Slider } from '@/design-system/components/Slider'
import { PrefillBadge } from '@/features/startup-studio/components/PrefillBadge'
import { formatEur, useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupPrefilledKeys } from '@/features/startup-studio/hooks/useStartupPrefilledKeys'
import {
  coerceStudioLocale,
  studioIntlLocale,
} from '@/features/startup-studio/i18n/useStudioLocale'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

/** Empirical "real engagement" threshold mirrored from the engine's
 *  `ENGAGEMENT_USERS_REAL_THRESHOLD` so the wizard advisory band matches
 *  the defensibility bump exactly (no UI/engine drift). */
const ENGAGEMENT_USERS_REAL_THRESHOLD = 1_000
const ENGAGEMENT_USERS_TOKEN_THRESHOLD = 100

interface TractionStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl' | 'fr'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

function hasRevenueSignal(mrr: number | null | undefined, arr: number | null | undefined): boolean {
  return (typeof mrr === 'number' && mrr > 0) || (typeof arr === 'number' && arr > 0)
}

export function TractionStep(_props: TractionStepProps) {
  const t = useTranslations('startupStudio.traction')
  const tCommon = useTranslations('startupStudio.common')
  const locale = coerceStudioLocale(useLocale())
  const intlFmt = useMemo(
    () =>
      new Intl.NumberFormat(studioIntlLocale(locale), {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale]
  )
  const mrr = useStartupValuationStore((s) => s.mrr)
  const storedArr = useStartupValuationStore((s) => s.arr)
  const growth = useStartupValuationStore((s) => s.mrr_growth_rate_pct)
  const churn = useStartupValuationStore((s) => s.monthly_churn_pct)
  const cac = useStartupValuationStore((s) => s.cac)
  const ltv = useStartupValuationStore((s) => s.ltv)
  const activeUsers = useStartupValuationStore((s) => s.active_users)
  const revenueStatus = useStartupValuationStore((s) => s.revenue_status)
  const setField = useStartupValuationStore((s) => s.setField)
  // Live valuation hook — drives the pre-money pill so the founder sees
  // exactly how much (and how little) the MRR slider moves the headline.
  // At pre-seed the modal movement is small by design; the pill makes
  // that honest rather than hiding it behind a static number.
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const valuation = useLiveValuation(benchmark)
  // Prefill-source map maintained by `useStartupPrefill` — when MRR
  // or ARR was synced from an accountant integration, the corresponding
  // key is in the set and we render a "from Mercury" badge under the
  // input.  Cleared values drop the badge naturally because the
  // visual signal lives next to the value.
  const prefilledKeys = useStartupPrefilledKeys()
  // Snapshot initial MRR once at mount so we can distinguish "user
  // edited to a different number" from "still showing the prefilled
  // value".  An edit elevates the badge to `your_override` (subtle
  // slate); the original Mercury origin stays auditable.  ARR is a
  // pure derivation from MRR in the preview strip, so we don't track
  // a separate ARR snapshot — the MRR badge is the canonical signal.
  const [initialMrr] = useState<number | null | undefined>(mrr)

  // Resolve the segmented control's value:
  //   - 'yes' if MRR/ARR carry a signal (covers prefilled / returning)
  //   - explicit store value when the founder picked one
  //   - 'no' as the default render (pre-revenue is the modal case at
  //     pre-seed, and "no" is the only state that drops the SaaS leg).
  const hasRevenue: 'yes' | 'no' = hasRevenueSignal(mrr, storedArr)
    ? 'yes'
    : revenueStatus === 'yes'
      ? 'yes'
      : 'no'

  // Mirror inferred state back into the store so the section completion
  // lights up for returning founders whose only signal is MRR/ARR.
  useEffect(() => {
    if (hasRevenueSignal(mrr, storedArr) && revenueStatus !== 'yes') {
      setField('revenue_status', 'yes')
    }
  }, [mrr, storedArr, revenueStatus, setField])

  const handleToggle = (value: 'yes' | 'no') => {
    setField('revenue_status', value)
    if (value === 'no') {
      setField('mrr', null)
      setField('arr', null)
      setField('mrr_growth_rate_pct', null)
      setField('monthly_churn_pct', null)
      setField('cac', null)
      setField('ltv', null)
    }
  }

  const ltvCacRatio = cac && cac > 0 && ltv && ltv > 0 ? ltv / cac : null
  const currentArrPreview = storedArr ?? (mrr != null && mrr > 0 ? mrr * 12 : null)
  const forwardArr =
    mrr && growth != null ? Math.round(mrr * Math.pow(1 + growth / 100, 12) * 12) : null
  const paybackMonths = cac && mrr && mrr > 0 ? Math.round(cac / (mrr / 12 || 1)) : null

  const liveMid = valuation.blended?.mid ?? null
  const engagementBadge =
    activeUsers != null && activeUsers >= ENGAGEMENT_USERS_REAL_THRESHOLD
      ? { tone: 'real' as const, key: 'engagementBadgeReal' }
      : activeUsers != null && activeUsers >= ENGAGEMENT_USERS_TOKEN_THRESHOLD
        ? { tone: 'token' as const, key: 'engagementBadgeToken' }
        : { tone: 'none' as const, key: 'engagementBadgeNone' }

  return (
    <div className="space-y-5">
      {/* Live pre-money pill — sits at the top of the step so the
          founder sees the headline reacting as they drag the sliders
          below.  At pre-seed the modal movement is small (Berkus +
          Scorecard carry 75% of weight); the pill makes that explicit
          rather than hiding it behind a static number — the founder
          understands at a glance that the slider isn't a magic wand. */}
      {liveMid != null && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-foreground/55">
              {t('livePreMoneyLabel')}
            </p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {formatEur(liveMid)}
            </p>
          </div>
          <p className="max-w-[55%] text-[11px] leading-snug text-foreground/55">
            {t('livePreMoneyCaption')}
          </p>
        </div>
      )}

      {/* Active users — sector-agnostic engagement signal. Lives ABOVE
          the revenue toggle because pre-revenue marketplace founders
          should answer it first (engagement is their primary signal,
          not revenue). Feeds the defensibility traction_signal sub-score
          via active_users — see defensibility.py:STRONG_TRACTION_ARR_THRESHOLD
          and _engagement_bump for the matching engine bands. */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('engagementTitle')}</h3>
        <p className="mb-5 text-sm leading-relaxed text-foreground/60">{t('engagementLead')}</p>
        <CurrencyInput
          label={t('engagementLabel')}
          value={activeUsers ?? undefined}
          onChange={(value) => setField('active_users', value != null ? Math.round(value) : null)}
          placeholder="0"
          size="sm"
          truncateLabel={false}
          /* Currency input but used as a plain integer field — the design
             system component handles thousand-separators and accepts an
             integer-shaped value just as cleanly. */
        />
        <div className="mt-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
              {t('engagementSliderLabel')}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-foreground/60">
              0 — {intlFmt.format(5000)}
            </p>
          </div>
          <div className="mt-2">
            <Slider
              value={
                typeof activeUsers === 'number' && Number.isFinite(activeUsers)
                  ? Math.min(Math.max(activeUsers, 0), 5000)
                  : 0
              }
              min={0}
              max={5000}
              step={50}
              showTooltip
              formatValue={(v) => intlFmt.format(v)}
              onChange={(v) => setField('active_users', Math.round(v))}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/55">
            {t('engagementSliderHint')}
          </p>
        </div>
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-[11px] leading-snug ${
            engagementBadge.tone === 'real'
              ? 'border-emerald-400/40 bg-emerald-50/60 text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-100'
              : engagementBadge.tone === 'token'
                ? 'border-amber-400/40 bg-amber-50/60 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-100'
                : 'border-foreground/15 bg-foreground/[0.03] text-foreground/65'
          }`}
        >
          {t(engagementBadge.key)}
        </div>
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <p className="mb-4 text-sm leading-relaxed text-foreground/70">{t('revenuePrompt')}</p>
        <SegmentedControl
          options={[
            { value: 'no', label: t('noRevenue') },
            { value: 'yes', label: t('yesMrr') },
          ]}
          value={hasRevenue}
          onChange={handleToggle}
        />
      </div>

      {hasRevenue === 'yes' && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <h3 className="mb-1 text-lg font-semibold text-foreground">{t('forwardTitle')}</h3>
          <p className="mb-5 text-sm text-foreground/60">{t('forwardSub')}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <CurrencyInput
                label={t('mrrLabel')}
                value={mrr ?? undefined}
                onChange={(value) => setField('mrr', value ?? null)}
                placeholder="5.000"
                size="sm"
                truncateLabel={false}
              />
              {/* Prefill provenance — when the bootstrap chain seeded
                  MRR from an accountant integration (Yuki/Exact via
                  Hermes), surface that origin so the founder knows
                  the number isn't a typo of their own.  Once they
                  edit the value, the variant flips to `your_override`
                  to signal the field has moved off the synced number. */}
              {prefilledKeys.has('mrr') && typeof mrr === 'number' && mrr > 0 && (
                <div className="mt-1.5">
                  <PrefillBadge variant={mrr === initialMrr ? 'mercury' : 'your_override'} />
                </div>
              )}
              {/* MRR what-if slider — mirrors the RaiseWhatIfSlider pattern on
                  RoundSimulatorStep so the founder can drag to compare ARR
                  scenarios.  Range capped at €25k MRR (≈€300k ARR) which is
                  the empirical "passed the pilot-scale floor" line; typing
                  any larger number into the CurrencyInput above still
                  works.  At pre-seed the SaaS Forward weight is 10%
                  ([synthesis.py:100-107]) so dragging won't move the headline
                  much — the live pre-money pill at the top makes that
                  honest movement visible. */}
              <div className="mt-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
                    {t('mrrSliderLabel')}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-foreground/60">
                    €0 — €{intlFmt.format(25000)}
                  </p>
                </div>
                <div className="mt-2">
                  <Slider
                    value={
                      typeof mrr === 'number' && Number.isFinite(mrr)
                        ? Math.min(Math.max(mrr, 0), 25000)
                        : 0
                    }
                    min={0}
                    max={25000}
                    step={250}
                    showTooltip
                    formatValue={(v) => `€${intlFmt.format(v)}`}
                    onChange={(v) => setField('mrr', v)}
                  />
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/55">
                  {t('mrrSliderHint')}
                </p>
              </div>
            </div>
            <div>
              <AdaptivePercentInput
                label={t('monthlyGrowth')}
                value={growth ?? undefined}
                onChange={(value) => setField('mrr_growth_rate_pct', value ?? null)}
                placeholder="10"
                size="sm"
                truncateLabel={false}
                description={t('monthlyGrowthHint')}
              />
              {/* Annual cross-check — surface the implied annual growth
                  the moment the founder types so a "5%" entry doesn't
                  silently get treated as monthly when the founder
                  meant annual. The math is (1+m)^12 - 1, identical to
                  what the engine compounds when projecting forward
                  ARR. Hot-zone warning above 20%/mo is the empirical
                  cap from Bessemer State of the Cloud — sustained
                  >20%/mo is unicorn-only territory. */}
              {typeof growth === 'number' && growth > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
                  <span className="rounded-md border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-foreground/65">
                    {t('monthlyGrowthAnnualEquiv', {
                      annualPct: ((Math.pow(1 + growth / 100, 12) - 1) * 100).toFixed(0),
                    })}
                  </span>
                  {growth > 20 && (
                    <span className="rounded-md border border-amber-400/40 bg-amber-50/60 px-2 py-0.5 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
                      {t('monthlyGrowthHotWarn')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <AdaptivePercentInput
              label={t('monthlyChurn')}
              value={churn ?? undefined}
              onChange={(value) => setField('monthly_churn_pct', value ?? null)}
              placeholder="3"
              size="sm"
              truncateLabel={false}
            />
            <CurrencyInput
              label={t('cacLabel')}
              value={cac ?? undefined}
              onChange={(value) => setField('cac', value ?? null)}
              placeholder="500"
              size="sm"
              truncateLabel={false}
            />
            <div className="sm:col-span-2">
              <CurrencyInput
                label={t('ltvOptional')}
                value={ltv ?? undefined}
                onChange={(value) => setField('ltv', value ?? null)}
                placeholder="3.000"
                size="sm"
                truncateLabel={false}
              />
            </div>
          </div>

          {(currentArrPreview || ltvCacRatio || forwardArr || paybackMonths) && (
            <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl bg-primary/5 p-4 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {t('currentArr')}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {currentArrPreview != null ? formatEur(currentArrPreview) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {t('forwardArr')}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {forwardArr != null ? formatEur(forwardArr) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {t('ltvCacRatioLabel')}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {ltvCacRatio != null ? `${ltvCacRatio.toFixed(1)}×` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {t('payback')}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {paybackMonths != null ? `${paybackMonths} ${tCommon('monthsShort')}` : '—'}
                </p>
              </div>
            </div>
          )}

          {ltvCacRatio != null && ltvCacRatio < 3 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
              <Calculator className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t('ltvCacWarn')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
