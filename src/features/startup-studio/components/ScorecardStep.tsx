'use client'

/**
 * Step 2 — Scorecard 2.0 (Bill Payne defensibility).
 *
 * Five weighted factor cards anchored to the Athena regional median
 * pre-money for the founder's stage × sector × country.  Team is
 * intentionally NOT a Scorecard card here — it lives in Berkus's
 * `management_strength` so we never double-count.
 */

import { MilestoneCard } from './MilestoneCard'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STUDIO_SCORECARD_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { SCORECARD_FACTORS } from '@/features/startup-studio/data/maturityOptions'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'

interface ScorecardStepProps {
  locale?: 'en' | 'nl'
}

export function ScorecardStep({ locale = 'en' }: ScorecardStepProps) {
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark, isFallback } = useStartupBenchmark(country, stage, sector)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <p className="text-sm leading-relaxed text-foreground/70">
          {locale === 'nl' ? (
            <>
              De Scorecard verfijnt de regionale mediaan{' '}
              <span className="font-medium text-foreground">
                {formatEur(benchmark.average_pre_money_eur)}
              </span>{' '}
              op basis van vijf gewogen defensibility-factoren (Bill Payne 2024).
            </>
          ) : (
            <>
              The Scorecard refines the regional median{' '}
              <span className="font-medium text-foreground">
                {formatEur(benchmark.average_pre_money_eur)}
              </span>{' '}
              against five weighted defensibility factors (Bill Payne 2024).
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-foreground/55">
          {country} {stage.replace('_', ' ')} · {sector}
          {isFallback && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700">
              {locale === 'nl' ? 'offline' : 'offline'}
            </span>
          )}
        </p>
      </div>

      {STUDIO_SCORECARD_KEYS.map((key) => (
        <MilestoneCard
          key={key}
          milestoneKey={key}
          weightPct={SCORECARD_FACTORS[key].weight_pct}
          locale={locale}
        />
      ))}
    </div>
  )
}
