'use client'

/**
 * Step 1 — Berkus 2.0 (Risk-Reduction Scorecard).
 *
 * 5 milestone cards with 4 evidence-based maturity options each.
 * Replaces the legacy 0–100 sliders that gave every founder a
 * misleading €1.7M baseline before any thinking.
 */

import { useTranslations } from 'next-intl'
import { MilestoneCard } from './MilestoneCard'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { STUDIO_BERKUS_KEYS, useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

interface BerkusStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
}

export function BerkusStep(_props: BerkusStepProps) {
  const t = useTranslations('startupStudio.berkus')
  const tCommon = useTranslations('startupStudio.common')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark, isFallback } = useStartupBenchmark(country, stage, sector)
  const stageLabel = tStageLabels(stage)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <p className="text-sm leading-relaxed text-foreground/70">
          {t('introBefore')}
          <span className="font-medium text-foreground">{t('introHighlight')}</span>
          {t('introAfter')}
        </p>
        <p className="mt-3 text-xs text-foreground/55">
          {t('capLine', {
            total: formatEur(benchmark.berkus_max_per_milestone_eur * 5),
            per: formatEur(benchmark.berkus_max_per_milestone_eur),
            country,
            stage: stageLabel,
          })}
          {isFallback && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700">
              {tCommon('offline')}
            </span>
          )}
        </p>
      </div>

      {STUDIO_BERKUS_KEYS.map((key) => (
        <MilestoneCard key={key} milestoneKey={key} maxPerMilestoneEur={benchmark.berkus_max_per_milestone_eur} />
      ))}
    </div>
  )
}
