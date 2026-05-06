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
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

interface TractionStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
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
  const setField = useStartupValuationStore((s) => s.setField)

  const [hasRevenue, setHasRevenue] = useState<'yes' | 'no'>(() =>
    hasRevenueSignal(mrr, storedArr) ? 'yes' : 'no',
  )

  useEffect(() => {
    if (hasRevenueSignal(mrr, storedArr)) setHasRevenue('yes')
  }, [mrr, storedArr])

  const handleToggle = (value: 'yes' | 'no') => {
    setHasRevenue(value)
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
            <CurrencyInput
              label="MRR (€)"
              value={mrr ?? undefined}
              onChange={(value) => setField('mrr', value ?? null)}
              placeholder="5.000"
              size="sm"
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={t('monthlyGrowth')}
              value={growth ?? undefined}
              onChange={(value) => setField('mrr_growth_rate_pct', value ?? null)}
              placeholder="10"
              size="sm"
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={t('monthlyChurn')}
              value={churn ?? undefined}
              onChange={(value) => setField('monthly_churn_pct', value ?? null)}
              placeholder="3"
              size="sm"
              truncateLabel={false}
            />
            <CurrencyInput
              label="CAC (€)"
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
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">LTV : CAC</p>
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
