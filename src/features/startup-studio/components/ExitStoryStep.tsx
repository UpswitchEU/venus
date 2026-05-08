'use client'

/**
 * Step 4 — Exit Story (the VC-method narrative).
 *
 * Two controls:
 *   1. Year-5 revenue projection — typed manually or seeded from the
 *      sector default for the founder's stage.
 *   2. Investor's required return (target ROI multiple).
 *
 * The exit multiple itself is sector-anchored (Athena Q1 2026) and
 * surfaces as a static footnote — making it editable is a separate
 * P0 follow-up.  TAM/SAM/SOM was removed 2026-05-08: the engine never
 * read it, the report never rendered it, and the only mechanical use
 * was a 3×/5×/8× SOM helper button that's now superseded by the
 * sector-default Y5 seed.
 */

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { getRegionalBaseline } from '@/components/calculator/sections/startup/regionalBaseline'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

interface ExitStoryStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
}

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
      y5: intlFmt.format(1_500_000),
    }),
    [intlFmt],
  )
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
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

  const applySectorDefaultY5 = () => {
    setField('year5_revenue_projection', sectorDefaultY5)
  }

  const effectiveMultiple = exitMultiple ?? benchmarkMidMultiple
  const previewY5 = y5 ?? 0
  const previewExit = previewY5 * effectiveMultiple

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('y5Title')}</h3>
        <p className="mb-4 text-sm text-foreground/60">{t('y5Lead')}</p>

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

        <CurrencyInput
          label={t('y5Label')}
          value={y5 ?? undefined}
          onChange={(value) => setField('year5_revenue_projection', value ?? null)}
          placeholder={placeholders.y5}
          size="sm"
          truncateLabel={false}
          description={t('y5Desc')}
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
