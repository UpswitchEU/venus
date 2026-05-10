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
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { PrefillBadge } from '@/features/startup-studio/components/PrefillBadge'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupPrefilledKeys } from '@/features/startup-studio/hooks/useStartupPrefilledKeys'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

interface TractionStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

function hasRevenueSignal(mrr: number | null | undefined, arr: number | null | undefined): boolean {
  return (typeof mrr === 'number' && mrr > 0) || (typeof arr === 'number' && arr > 0)
}

export function TractionStep(_props: TractionStepProps) {
  const t = useTranslations('startupStudio.traction')
  const tCommon = useTranslations('startupStudio.common')
  const mrr = useStartupValuationStore((s) => s.mrr)
  const storedArr = useStartupValuationStore((s) => s.arr)
  const growth = useStartupValuationStore((s) => s.mrr_growth_rate_pct)
  const churn = useStartupValuationStore((s) => s.monthly_churn_pct)
  const cac = useStartupValuationStore((s) => s.cac)
  const ltv = useStartupValuationStore((s) => s.ltv)
  const revenueStatus = useStartupValuationStore((s) => s.revenue_status)
  const setField = useStartupValuationStore((s) => s.setField)
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

  return (
    <div className="space-y-5">
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
                  <PrefillBadge
                    variant={mrr === initialMrr ? 'mercury' : 'your_override'}
                  />
                </div>
              )}
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
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">{t('ltvCacRatioLabel')}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {ltvCacRatio != null ? `${ltvCacRatio.toFixed(1)}×` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {t('payback')}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {paybackMonths != null
                    ? `${paybackMonths} ${tCommon('monthsShort')}`
                    : '—'}
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
