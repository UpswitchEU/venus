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
import { useEffect, useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

interface TractionStepProps {
  locale?: 'en' | 'nl'
}

function hasRevenueSignal(mrr: number | null | undefined, arr: number | null | undefined): boolean {
  return (typeof mrr === 'number' && mrr > 0) || (typeof arr === 'number' && arr > 0)
}

export function TractionStep({ locale = 'en' }: TractionStepProps) {
  const mrr = useStartupValuationStore((s) => s.mrr)
  const storedArr = useStartupValuationStore((s) => s.arr)
  const growth = useStartupValuationStore((s) => s.mrr_growth_rate_pct)
  const churn = useStartupValuationStore((s) => s.monthly_churn_pct)
  const cac = useStartupValuationStore((s) => s.cac)
  const ltv = useStartupValuationStore((s) => s.ltv)
  const setField = useStartupValuationStore((s) => s.setField)

  const [hasRevenue, setHasRevenue] = useState<'yes' | 'no'>(() =>
    hasRevenueSignal(mrr, storedArr) ? 'yes' : 'no'
  )

  // Session hydrate: MRR or ARR can arrive after first paint — open the traction form.
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

  // Live unit economics preview --------------------------------------
  const ltvCacRatio = cac && cac > 0 && ltv && ltv > 0 ? ltv / cac : null
  const currentArrPreview = storedArr ?? (mrr != null && mrr > 0 ? mrr * 12 : null)
  // Forward 12-month ARR using compounding monthly growth (simple model).
  const forwardArr =
    mrr && growth != null ? Math.round(mrr * Math.pow(1 + growth / 100, 12) * 12) : null
  const paybackMonths = cac && mrr && mrr > 0 ? Math.round(cac / (mrr / 12 || 1)) : null

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <p className="mb-4 text-sm leading-relaxed text-foreground/70">
          {locale === 'nl'
            ? 'Genereer je vandaag al omzet? Bij "nee" valt de SaaS-forward leg automatisch weg uit de blend.'
            : 'Are you generating revenue today? Saying "no" silently drops the SaaS-forward leg from the blend.'}
        </p>
        <SegmentedControl
          options={[
            {
              value: 'no',
              label: locale === 'nl' ? 'Nog geen omzet' : 'No revenue yet',
            },
            { value: 'yes', label: locale === 'nl' ? 'Ja, MRR live' : 'Yes, MRR live' },
          ]}
          value={hasRevenue}
          onChange={handleToggle}
        />
      </div>

      {hasRevenue === 'yes' && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <h3 className="mb-1 text-lg font-semibold text-foreground">
            {locale === 'nl' ? 'Forward-looking SaaS-cijfers' : 'Forward-looking SaaS metrics'}
          </h3>
          <p className="mb-5 text-sm text-foreground/60">
            {locale === 'nl'
              ? 'Voed de SaaS-leg van de waardering met je huidige unit economics.'
              : 'Feeds the SaaS leg of the valuation with your current unit economics.'}
          </p>

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
              label={locale === 'nl' ? 'Maandelijkse groei (%)' : 'Monthly growth (%)'}
              value={growth ?? undefined}
              onChange={(value) => setField('mrr_growth_rate_pct', value ?? null)}
              placeholder="10"
              size="sm"
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={locale === 'nl' ? 'Maandelijkse churn (%)' : 'Monthly churn (%)'}
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
                label={locale === 'nl' ? 'LTV (€) — optioneel' : 'LTV (€) — optional'}
                value={ltv ?? undefined}
                onChange={(value) => setField('ltv', value ?? null)}
                placeholder="3.000"
                size="sm"
                truncateLabel={false}
              />
            </div>
          </div>

          {/* Live unit-economics preview */}
          {(currentArrPreview || ltvCacRatio || forwardArr || paybackMonths) && (
            <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl bg-primary/5 p-4 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {locale === 'nl' ? 'Huidige ARR' : 'Current ARR'}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {currentArrPreview != null ? formatEur(currentArrPreview) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                  {locale === 'nl' ? 'Forward 12mo ARR' : 'Forward 12mo ARR'}
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
                  {locale === 'nl' ? 'Payback' : 'Payback'}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {paybackMonths != null ? `${paybackMonths} mo` : '—'}
                </p>
              </div>
            </div>
          )}

          {ltvCacRatio != null && ltvCacRatio < 3 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
              <Calculator className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {locale === 'nl'
                  ? 'LTV : CAC ratio onder 3× wordt door investeerders als zorgwekkend gezien — overweeg LTV-verbeteringen of CAC-reductie.'
                  : 'LTV : CAC below 3× is a yellow flag for investors — explore LTV upside or CAC reduction.'}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
