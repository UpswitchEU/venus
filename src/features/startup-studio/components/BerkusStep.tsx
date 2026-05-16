'use client'

/**
 * Step 1 — Berkus 2.0 (Risk-Reduction Scorecard).
 *
 * 5 milestone cards with 4 evidence-based maturity options each.
 * Replaces the legacy 0–100 sliders that gave every founder a
 * misleading €1.7M baseline before any thinking.
 *
 * Input-only surface — the running EUR contribution + progress bar
 * that briefly lived here in 2026-05-10 was output / live calc and
 * belonged on the report side. Removed in favour of letting the
 * report render the per-milestone contribution table (it already
 * does, see `startup_method_breakdown.html`).
 */

import { useTranslations } from 'next-intl'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STUDIO_BERKUS_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { MilestoneCard } from './MilestoneCard'

interface BerkusStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
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
  const cap = benchmark.berkus_max_per_milestone_eur
  const totalCap = cap * 5

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-4">
        <p className="text-sm leading-relaxed text-foreground/75">{t('introInputPrompt')}</p>
        <p className="mt-2 text-[11px] text-foreground/55">
          {t('capLine', {
            total: formatEur(totalCap),
            per: formatEur(cap),
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
        <MilestoneCard key={key} milestoneKey={key} maxPerMilestoneEur={cap} />
      ))}
    </div>
  )
}
