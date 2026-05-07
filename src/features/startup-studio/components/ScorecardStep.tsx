'use client'

/**
 * Step 2 — Scorecard 2.0 (Bill Payne defensibility).
 *
 * Five weighted factor cards anchored to the Athena regional median
 * pre-money for the founder's stage × sector × country.  Team is
 * intentionally NOT a Scorecard card here — it lives in Berkus's
 * `management_strength` so we never double-count.
 */

import { useTranslations } from 'next-intl'
import { SCORECARD_FACTORS } from '@/features/startup-studio/data/maturityOptions'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { STUDIO_SCORECARD_KEYS, useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { MilestoneCard } from './MilestoneCard'

interface ScorecardStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
}

export function ScorecardStep(_props: ScorecardStepProps) {
  const t = useTranslations('startupStudio.scorecard')
  const tCommon = useTranslations('startupStudio.common')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark, isFallback } = useStartupBenchmark(country, stage, sector)
  const stageLabel = tStageLabels(stage)
  const sectorLabel = tSectorLabels(sector)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <p className="text-sm leading-relaxed text-foreground/70">
          {t('introBefore')}
          <span className="font-medium text-foreground">{formatEur(benchmark.average_pre_money_eur)}</span>
          {t('introAfter')}
        </p>
        <p className="mt-3 text-xs text-foreground/55">
          {t('contextLine', { country, stage: stageLabel, sector: sectorLabel })}
          {isFallback && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700">{tCommon('offline')}</span>
          )}
        </p>
      </div>

      {STUDIO_SCORECARD_KEYS.map((key) => (
        <MilestoneCard key={key} milestoneKey={key} weightPct={SCORECARD_FACTORS[key].weight_pct} />
      ))}
    </div>
  )
}
