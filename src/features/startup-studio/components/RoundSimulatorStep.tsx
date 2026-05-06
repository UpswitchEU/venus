'use client'

/**
 * Step 5 — Round Simulator.
 *
 * SAFE vs priced-round toggle.  When SAFE → renders the SAFE notes
 * list (advisor mode).  When priced → renders the live cap-table preview:
 *
 *   founders / option-pool / new investor split  given
 *     - investment_amount_sought
 *     - option_pool_pct
 *     - blended pre-money (from `useLiveValuation`)
 *
 * ``dilution_assumption_pct`` is **cumulative dilution to exit** (engine /
 * deck planning). It does **not** drive the bar — new-investor % is
 * always raise ÷ post-money for this priced close.
 */

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SafeNotesEditor } from '@/components/calculator/sections/SafeNotesEditor'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { formatEur, useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { resolveHeadlinePreMoney } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { type StartupStage, useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

const DILUTION_DEFAULT_PCT: Record<StartupStage, number> = {
  pre_seed: 70,
  seed: 60,
  series_a: 50,
}

interface RoundSimulatorStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  advisorMode?: boolean
}

type RoundType = 'priced' | 'safe'

export function RoundSimulatorStep({ advisorMode = false }: RoundSimulatorStepProps) {
  const t = useTranslations('startupStudio.round')
  const tCommon = useTranslations('startupStudio.common')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const locale = useLocale()
  const intlFmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale],
  )
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const valuation = useLiveValuation(benchmark)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)
  const dilution = useStartupValuationStore((s) => s.dilution_assumption_pct)
  const setField = useStartupValuationStore((s) => s.setField)
  const capTable = useStartupValuationStore((s) => s.cap_table)
  const setCapField = useStartupValuationStore((s) => s.setCapField)
  const addSafeNote = useStartupValuationStore((s) => s.addSafeNote)
  const updateSafeNote = useStartupValuationStore((s) => s.updateSafeNote)
  const removeSafeNote = useStartupValuationStore((s) => s.removeSafeNote)

  const stageDefaultDilution = DILUTION_DEFAULT_PCT[stage]
  const stageLabel = tStageLabels(stage)

  useEffect(() => {
    if (dilution == null) {
      setField('dilution_assumption_pct', stageDefaultDilution)
    }
  }, [dilution, stageDefaultDilution, setField])

  const [roundType, setRoundType] = useState<RoundType>(
    capTable.safe_notes.length > 0 ? 'safe' : 'priced',
  )

  const preMoneyPlaceholder = useMemo(() => {
    const mid = valuation.blended?.mid
    if (mid != null && Number.isFinite(mid) && mid > 0) return intlFmt.format(Math.round(mid))
    return t('preMoneyPlaceholder')
  }, [intlFmt, t, valuation.blended?.mid])
  const blendedMid = valuation.blended?.mid ?? null
  const preMoney = resolveHeadlinePreMoney(capTable.pre_money_target, blendedMid) ?? 0
  const postMoney = preMoney + (investment ?? 0)
  const newInvestorPct = postMoney > 0 && investment ? (investment / postMoney) * 100 : 0
  const optionPoolPct = capTable.option_pool_pct ?? 0
  const foundersPct = Math.max(0, 100 - newInvestorPct - optionPoolPct)

  const showHighRoundDilutionHint =
    capTable.safe_notes.length === 0 &&
    investment != null &&
    investment > 0 &&
    newInvestorPct > 22 &&
    Number.isFinite(newInvestorPct)

  /** Pre-money (€) that would yield ~12% to new money for this raise (illustrative). */
  const preMoneyForTypicalSlice = useMemo(() => {
    if (!investment || investment <= 0 || !Number.isFinite(investment)) return null
    const target = 0.12
    const pre = investment / target - investment
    return pre > 0 && Number.isFinite(pre) ? pre : null
  }, [investment])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('kindTitle')}</h3>
        <div className="mb-4 space-y-2 text-sm text-foreground/60">
          <p>{t('kindLead')}</p>
          <p className="text-[13px] leading-snug">{t('kindLeadDetail')}</p>
        </div>

        <SegmentedControl
          options={[
            { value: 'priced', label: t('priced') },
            { value: 'safe', label: t('safe') },
          ]}
          value={roundType}
          onChange={setRoundType}
        />
      </div>

      {roundType === 'priced' && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyInput
              label={t('roundSize')}
              value={investment ?? undefined}
              onChange={(value) => setField('investment_amount_sought', value ?? null)}
              placeholder={intlFmt.format(500_000)}
              size="sm"
              truncateLabel={false}
            />
            <CurrencyInput
              label={t('preMoneyTarget')}
              value={capTable.pre_money_target ?? undefined}
              onChange={(value) => setCapField('pre_money_target', value ?? null)}
              placeholder={preMoneyPlaceholder}
              size="sm"
              truncateLabel={false}
              description={t('preMoneyTargetDesc')}
            />
            <div className="sm:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <div className="min-w-0 flex-1">
                  <AdaptivePercentInput
                    label={t('dilutionLabel')}
                    value={dilution ?? undefined}
                    onChange={(value) => setField('dilution_assumption_pct', value ?? null)}
                    placeholder={String(stageDefaultDilution)}
                    size="sm"
                    truncateLabel={false}
                    description={t('dilutionDesc', {
                      pct: stageDefaultDilution,
                      stage: stageLabel,
                    })}
                  />
                </div>
                {dilution != null && Math.abs(dilution - stageDefaultDilution) > 0.5 && (
                  <button
                    type="button"
                    onClick={() => setField('dilution_assumption_pct', stageDefaultDilution)}
                    aria-label={t('useStageDefaultAria', {
                      stage: stageLabel,
                      pct: stageDefaultDilution,
                    })}
                    className="shrink-0 rounded-md border border-foreground/15 bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground/75 transition hover:border-primary/50 hover:text-primary sm:mb-0.5"
                  >
                    {t('useStageDefault', { pct: stageDefaultDilution })}
                  </button>
                )}
              </div>
            </div>
            <div className="sm:max-w-sm">
              <AdaptivePercentInput
                label={t('optionPool')}
                value={optionPoolPct}
                onChange={(value) => setCapField('option_pool_pct', value ?? 0)}
                placeholder={t('optionPoolPlaceholder')}
                size="sm"
                truncateLabel={false}
                description={t('optionPoolDesc')}
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-foreground/55">
              {t('capTableTitle')}
            </p>
            <p className="mb-3 text-[12px] leading-snug text-foreground/60">
              {t('capTableExplainer', { roundPct: newInvestorPct.toFixed(1) })}
            </p>
            {showHighRoundDilutionHint && preMoneyForTypicalSlice != null && (
              <p className="mb-3 rounded-md border border-amber-400/40 bg-amber-50/50 px-3 py-2 text-[11px] leading-snug text-amber-950/90 dark:border-amber-700/35 dark:bg-amber-950/30 dark:text-amber-100/85">
                {t('roundDilutionHighHint', {
                  roundPct: newInvestorPct.toFixed(1),
                  preHint: formatEur(preMoneyForTypicalSlice),
                })}
              </p>
            )}
            <div className="flex h-10 w-full overflow-hidden rounded-lg border border-foreground/10">
              <div
                className="flex items-center justify-center bg-emerald-500/80 text-[11px] font-semibold text-white"
                style={{ width: `${foundersPct}%` }}
                title={`${tCommon('founders')}: ${foundersPct.toFixed(1)}%`}
              >
                {foundersPct >= 8 && `${foundersPct.toFixed(0)}%`}
              </div>
              <div
                className="flex items-center justify-center bg-amber-500/80 text-[11px] font-semibold text-white"
                style={{ width: `${optionPoolPct}%` }}
                title={`${tCommon('optionPool')}: ${optionPoolPct.toFixed(1)}%`}
              >
                {optionPoolPct >= 8 && `${optionPoolPct.toFixed(0)}%`}
              </div>
              <div
                className="flex items-center justify-center bg-primary text-[11px] font-semibold text-white"
                style={{ width: `${newInvestorPct}%` }}
                title={`${tCommon('newInvestor')}: ${newInvestorPct.toFixed(1)}%`}
              >
                {newInvestorPct >= 8 && `${newInvestorPct.toFixed(0)}%`}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-foreground/65">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
                {tCommon('founders')} {foundersPct.toFixed(1)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500/80" />
                {tCommon('optionPool')} {optionPoolPct.toFixed(1)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {tCommon('newInvestor')} {newInvestorPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-primary/5 p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-foreground/55">{t('preMoney')}</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{formatEur(preMoney)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-foreground/55">{t('postMoney')}</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{formatEur(postMoney)}</p>
            </div>
          </div>
        </div>
      )}

      {roundType === 'safe' && (
        <SafeNotesEditor
          notes={capTable.safe_notes}
          onAdd={addSafeNote}
          onUpdate={updateSafeNote}
          onRemove={removeSafeNote}
          advisorMode={advisorMode}
        />
      )}
    </div>
  )
}
