'use client'

/**
 * Step 4 — Exit Story (the VC-method narrative).
 *
 * Three controls:
 *   1. TAM / SAM / SOM funnel → grounds the exit narrative.
 *   2. Year-5 revenue projection → either typed manually or seeded
 *      from a "growth curve" picker (3×, 5×, 8× SOM by Y5).
 *   3. Exit multiple — dual lens between sector default and a public
 *      comp slider (low / median / high) sourced from Athena.
 */

import { TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { getRegionalBaseline } from '@/components/calculator/sections/startup/regionalBaseline'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import {
  computeSomSharePercents,
  formatSomShareForIntl,
} from '@/features/startup-studio/utils/tamSamSomFunnel'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

interface ExitStoryStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
}

type GrowthCurve = '3x' | '5x' | '8x'

const GROWTH_MULTIPLIERS: Record<GrowthCurve, number> = {
  '3x': 3,
  '5x': 5,
  '8x': 8,
}

const SOM_FUNNEL_WARN_KEY = {
  sam_gt_tam: 'somFunnelWarnSamGtTam',
  som_gt_sam: 'somFunnelWarnSomGtSam',
  som_gt_tam: 'somFunnelWarnSomGtTam',
} as const

export function ExitStoryStep(_props: ExitStoryStepProps) {
  const t = useTranslations('startupStudio.exitStory')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const locale = useLocale()
  const intlFmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale],
  )
  const placeholders = useMemo(
    () => ({
      tam: intlFmt.format(50_000_000_000),
      sam: intlFmt.format(2_000_000_000),
      som: intlFmt.format(50_000_000),
      y5: intlFmt.format(1_500_000),
    }),
    [intlFmt],
  )
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const tamSamSom = useStartupValuationStore((s) => s.tam_sam_som)
  const setTamSamSom = useStartupValuationStore((s) => s.setTamSamSom)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const targetRoi = useStartupValuationStore((s) => s.target_roi_x)
  const setField = useStartupValuationStore((s) => s.setField)

  const { benchmark, isFallback } = useStartupBenchmark(country, stage, sector)
  const stageLabel = tStageLabels(stage)

  const benchmarkMidMultiple = Math.round(
    (benchmark.exit_multiple_low + benchmark.exit_multiple_high) / 2,
  )
  const stageDefaultRoi = getRegionalBaseline(country, stage).default_target_roi_x
  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[sector] ?? 5_000_000

  useEffect(() => {
    if (exitMultiple == null) {
      setField('exit_revenue_multiple', benchmarkMidMultiple)
    }
    if (targetRoi == null) {
      setField('target_roi_x', stageDefaultRoi)
    }
    if (y5 == null) {
      setField('year5_revenue_projection', sectorDefaultY5)
    }
  }, [
    benchmarkMidMultiple,
    exitMultiple,
    targetRoi,
    y5,
    stageDefaultRoi,
    sectorDefaultY5,
    setField,
  ])

  const applyGrowthCurve = (curve: GrowthCurve) => {
    if (!tamSamSom.som || tamSamSom.som <= 0) return
    setField('year5_revenue_projection', Math.round(tamSamSom.som * GROWTH_MULTIPLIERS[curve]))
  }

  const applySectorDefaultY5 = () => {
    setField('year5_revenue_projection', sectorDefaultY5)
  }

  const effectiveMultiple = exitMultiple ?? benchmarkMidMultiple
  const previewY5 = y5 ?? 0
  const previewExit = previewY5 * effectiveMultiple

  const somShare = useMemo(() => {
    const ti = tamSamSom.tam
    const si = tamSamSom.sam
    const oi = tamSamSom.som
    if (ti == null || si == null || oi == null) return null
    return computeSomSharePercents(ti, si, oi)
  }, [tamSamSom.tam, tamSamSom.sam, tamSamSom.som])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('tamSamSomTitle')}</h3>
        <p className="mb-5 text-sm text-foreground/60">{t('tamSamSomLead')}</p>

        <div className="flex flex-col gap-4">
          <CurrencyInput
            label={t('tamLabel')}
            value={tamSamSom.tam ?? undefined}
            onChange={(value) => setTamSamSom({ tam: value ?? null })}
            placeholder={placeholders.tam}
            size="sm"
            truncateLabel={false}
            description={t('tamDesc')}
          />
          <CurrencyInput
            label={t('samLabel')}
            value={tamSamSom.sam ?? undefined}
            onChange={(value) => setTamSamSom({ sam: value ?? null })}
            placeholder={placeholders.sam}
            size="sm"
            truncateLabel={false}
            description={t('samDesc')}
          />
          <CurrencyInput
            label={t('somLabel')}
            value={tamSamSom.som ?? undefined}
            onChange={(value) => setTamSamSom({ som: value ?? null })}
            placeholder={placeholders.som}
            size="sm"
            truncateLabel={false}
            description={t('somDesc')}
          />
        </div>

        {somShare && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-foreground/60">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span>
                {t('somShareLine', {
                  pctSam: formatSomShareForIntl(somShare.pctOfSam),
                  pctTam: formatSomShareForIntl(somShare.pctOfTam),
                })}
              </span>
            </div>
            {somShare.issues.length > 0 && (
              <ul className="list-inside list-disc space-y-1 rounded-md border border-amber-400/40 bg-amber-50/50 py-2 pl-3 pr-2 text-[11px] text-amber-900/90 dark:border-amber-700/35 dark:bg-amber-950/30 dark:text-amber-100/85">
                {somShare.issues.map((issue) => (
                  <li key={issue}>{t(SOM_FUNNEL_WARN_KEY[issue])}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('growthCurveTitle')}</h3>
        <p className="mb-4 text-sm text-foreground/60">{t('growthCurveLead')}</p>

        {tamSamSom.som && tamSamSom.som > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {(['3x', '5x', '8x'] as const).map((curve) => {
              const som = tamSamSom.som ?? 0
              const curveLabel = curve.replace(/x$/i, '×')
              return (
                <button
                  key={curve}
                  type="button"
                  onClick={() => applyGrowthCurve(curve)}
                  className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-xs font-medium text-foreground/80 transition hover:border-primary hover:bg-primary/5"
                >
                  {`${curveLabel} SOM → ${formatEur(som * GROWTH_MULTIPLIERS[curve])}`}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applySectorDefaultY5}
              className="rounded-lg border border-primary/40 bg-primary/[0.04] px-3 py-2 text-xs font-medium text-primary transition hover:border-primary hover:bg-primary/[0.08]"
            >
              {t('sectorDefaultBtn', { amount: formatEur(sectorDefaultY5) })}
            </button>
            <span className="text-[11px] text-foreground/55">
              {t('sectorDefaultHint', { sector: tSectorLabels(sector) })}
            </span>
          </div>
        )}

        <CurrencyInput
          label={t('y5Label')}
          value={y5 ?? undefined}
          onChange={(value) => setField('year5_revenue_projection', value ?? null)}
          placeholder={placeholders.y5}
          size="sm"
          truncateLabel={false}
        />
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('investorAskTitle')}</h3>
        <p className="mb-4 text-sm text-foreground/60">{t('investorAskLead')}</p>

        <AdaptivePercentInput
          label={t('targetRoiLabel')}
          value={targetRoi ?? undefined}
          onChange={(value) => setField('target_roi_x', value ?? null)}
          placeholder={String(stageDefaultRoi)}
          size="sm"
          truncateLabel={false}
          description={t('targetRoiDesc', {
            roi: String(stageDefaultRoi),
            stage: stageLabel,
          })}
        />

        {previewExit > 0 && (
          <div className="mt-4 rounded-xl bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-foreground/55">{t('impliedExit')}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
              {formatEur(previewExit)}
            </p>
            <p className="mt-1 text-[11px] text-foreground/55">
              {formatEur(previewY5)} × {effectiveMultiple}×
            </p>
          </div>
        )}

        <p className="mt-4 border-t border-foreground/10 pt-3 text-[11px] text-foreground/55">
          {t('sectorMultipleFoot')}
          <span className="font-medium tabular-nums text-foreground">{effectiveMultiple}×</span>
          {' · range '}
          {benchmark.exit_multiple_low}–{benchmark.exit_multiple_high}× · {tSectorLabels(sector)}
          {' · Athena Q1 2026'}
          {isFallback && ' · offline'}
        </p>
      </div>
    </div>
  )
}
