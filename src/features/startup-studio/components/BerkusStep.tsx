'use client'

/**
 * Step 1 — Berkus 2.0 (Risk-Reduction Scorecard).
 *
 * 5 milestone cards with 4 evidence-based maturity options each.
 * Replaces the legacy 0–100 sliders that gave every founder a
 * misleading €1.7M baseline before any thinking.
 */

import { MilestoneCard } from './MilestoneCard'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STUDIO_BERKUS_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'

interface BerkusStepProps {
  locale?: 'en' | 'nl'
}

export function BerkusStep({ locale = 'en' }: BerkusStepProps) {
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
              Investeerders waarderen pre-seed rondes op{' '}
              <span className="font-medium text-foreground">hoeveel uitvoeringsrisico je hebt
              weggenomen</span>. Score vijf kwalitatieve mijlpalen — elke keuze ontgrendelt een
              stuk van de regionale baseline.
            </>
          ) : (
            <>
              Investors price pre-seed rounds on{' '}
              <span className="font-medium text-foreground">how much execution risk you've
              removed</span>. Score five qualitative milestones — each pick unlocks a slice of the
              regional baseline.
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-foreground/55">
          {locale === 'nl' ? 'Tot ' : 'Up to '}
          <span className="font-medium tabular-nums text-foreground">
            {formatEur(benchmark.berkus_max_per_milestone_eur * 5)}
          </span>{' '}
          {locale === 'nl' ? 'over 5 mijlpalen · ' : 'across 5 milestones · '}
          {formatEur(benchmark.berkus_max_per_milestone_eur)}
          {locale === 'nl' ? ' per mijlpaal — ' : ' per milestone — '}
          {country} {stage.replace('_', ' ')} {locale === 'nl' ? 'benchmark' : 'benchmark'}
          {isFallback && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700">
              {locale === 'nl' ? 'offline' : 'offline'}
            </span>
          )}
        </p>
      </div>

      {STUDIO_BERKUS_KEYS.map((key) => (
        <MilestoneCard
          key={key}
          milestoneKey={key}
          maxPerMilestoneEur={benchmark.berkus_max_per_milestone_eur}
          locale={locale}
        />
      ))}
    </div>
  )
}
