'use client'

/**
 * Step 2 — Scorecard 2.0 (Bill Payne defensibility).
 *
 * Five weighted factor cards anchored to the Athena regional median
 * pre-money for the founder's stage × sector × country.  Team is
 * intentionally NOT a Scorecard card here — it lives in Berkus's
 * `management_strength` so we never double-count.
 *
 * Input-only surface — the live blended-multiplier chip + bar that
 * lived here in 2026-05-10 was output / live calc and belonged on
 * the report side. Removed in favour of letting the report render
 * the per-factor weighted multiplier table (it already does, see
 * `startup_method_breakdown.html`'s Scorecard section).
 */

import { useTranslations } from 'next-intl'
import { SCORECARD_FACTORS } from '@/features/startup-studio/data/maturityOptions'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { STUDIO_SCORECARD_KEYS, useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { MilestoneCard } from './MilestoneCard'

interface ScorecardStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

export function ScorecardStep(_props: ScorecardStepProps) {
  const t = useTranslations('startupStudio.scorecard')
  const tCommon = useTranslations('startupStudio.common')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { isFallback } = useStartupBenchmark(country, stage, sector)
  const stageLabel = tStageLabels(stage)
  const sectorLabel = tSectorLabels(sector)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-4">
        <p className="text-sm leading-relaxed text-foreground/75">
          {t('introInputPrompt')}
        </p>
        <p className="mt-2 text-[11px] text-foreground/55">
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
