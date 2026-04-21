'use client'

/**
 * LiveReceipt
 * -----------
 *
 * Sticky right-rail panel that mirrors the engine's three-leg founder
 * triangulation in real-time.  Founders see the blended pre-money
 * range (low → mid → high), the per-leg breakdown (football field), a
 * one-sentence narrative, and the source of the regional benchmark.
 *
 * Math comes from `useLiveValuation`.  This component is render-only.
 */

import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import {
  type LiveValuation,
  formatEur,
} from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { cn } from '@/lib/utils'

interface LiveReceiptProps {
  valuation: LiveValuation
  benchmark: StartupBenchmarkRow
  isFallback: boolean
  publishedAt: string
  locale?: 'en' | 'nl'
}

const LEG_LABELS: Record<string, { en: string; nl: string }> = {
  berkus: { en: 'Risk reduction (Berkus)', nl: 'Risico-reductie (Berkus)' },
  vc: { en: 'VC method (exit story)', nl: 'VC-methode (exit-verhaal)' },
  saas_forward: { en: 'SaaS forward (ARR)', nl: 'SaaS forward (ARR)' },
  scorecard: { en: 'Scorecard (regional)', nl: 'Scorecard (regionaal)' },
}

function describeNarrative(value: LiveValuation, locale: 'en' | 'nl'): string {
  if (value.isEmpty || !value.blended) {
    return locale === 'nl'
      ? 'Vul de mijlpalen in om je live waardering te zien.'
      : 'Fill in the milestones to see your live valuation appear here.'
  }
  const { low, high } = value.blended
  if (locale === 'nl') {
    return `Op basis van wat je tot nu invulde, ligt een verdedigbare pre-money tussen ${formatEur(
      low,
    )} en ${formatEur(high)}.`
  }
  return `Based on what you've answered so far, a defensible pre-money sits between ${formatEur(
    low,
  )} and ${formatEur(high)}.`
}

export function LiveReceipt({
  valuation,
  benchmark,
  isFallback,
  publishedAt,
  locale = 'en',
}: LiveReceiptProps) {
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const formattedPublished = (() => {
    try {
      return new Date(publishedAt).toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return publishedAt.slice(0, 7)
    }
  })()

  const visibleLegs = valuation.legs.filter((l) => l.value != null)
  const maxAxis = Math.max(
    1,
    ...visibleLegs.map((l) => l.high ?? 0),
    valuation.blended?.high ?? 0,
  )

  return (
    <aside className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto rounded-2xl border border-foreground/10 bg-background/80 p-6 shadow-xl backdrop-blur">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
          {locale === 'nl' ? 'Live waardering' : 'Live valuation'}
        </p>
        <motion.p
          key={valuation.blended?.mid ?? 0}
          initial={{ opacity: 0.6, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1 text-3xl font-semibold tabular-nums text-foreground"
        >
          {valuation.blended ? formatEur(valuation.blended.mid) : '—'}
        </motion.p>
        {valuation.blended && (
          <p className="mt-0.5 text-sm text-foreground/60 tabular-nums">
            {formatEur(valuation.blended.low)} – {formatEur(valuation.blended.high)}{' '}
            <span className="text-foreground/45">
              {locale === 'nl' ? 'pre-money range' : 'pre-money range'}
            </span>
          </p>
        )}
      </header>

      {/* Football field — per-leg horizontal bars */}
      {visibleLegs.length > 0 && (
        <div className="space-y-3">
          {valuation.legs.map((leg) => {
            const label = LEG_LABELS[leg.key]?.[locale] ?? leg.label
            if (leg.value == null) {
              return (
                <div key={leg.key} className="opacity-50">
                  <p className="flex items-center justify-between text-xs text-foreground/55">
                    <span>{label}</span>
                    <span>{locale === 'nl' ? 'nog niet ingevuld' : 'not yet filled'}</span>
                  </p>
                  <div className="mt-1 h-2 rounded-full bg-foreground/[0.06]" />
                </div>
              )
            }
            const lowPct = ((leg.low ?? 0) / maxAxis) * 100
            const highPct = ((leg.high ?? 0) / maxAxis) * 100
            const midPct = ((leg.value ?? 0) / maxAxis) * 100
            return (
              <div key={leg.key}>
                <p className="flex items-center justify-between text-xs text-foreground/65">
                  <span>{label}</span>
                  <span className="tabular-nums text-foreground/80">{formatEur(leg.value)}</span>
                </p>
                <div className="relative mt-1 h-2 rounded-full bg-foreground/[0.06]">
                  <div
                    className={cn(
                      'absolute top-0 h-2 rounded-full',
                      leg.key === 'berkus'
                        ? 'bg-primary/70'
                        : leg.key === 'vc'
                          ? 'bg-secondary/80'
                          : 'bg-accent/80',
                    )}
                    style={{
                      left: `${lowPct}%`,
                      width: `${Math.max(2, highPct - lowPct)}%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/80"
                    style={{ left: `${midPct}%` }}
                  />
                </div>
                <p className="mt-0.5 flex justify-between text-[10px] text-foreground/45 tabular-nums">
                  <span>{formatEur(leg.low)}</span>
                  <span>{Math.round(leg.weight * 100)}% {locale === 'nl' ? 'gewicht' : 'weight'}</span>
                  <span>{formatEur(leg.high)}</span>
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Narrative */}
      <div className="rounded-xl bg-primary/5 p-4">
        <p className="text-sm leading-relaxed text-foreground/85">
          {describeNarrative(valuation, locale)}
        </p>
      </div>

      {/* Benchmark provenance */}
      <div className="border-t border-foreground/10 pt-4 text-xs text-foreground/55">
        <p className="flex items-center gap-1.5 font-medium text-foreground/65">
          <Info className="h-3.5 w-3.5" />
          {locale === 'nl' ? 'Regionale referentie' : 'Regional benchmark'}
        </p>
        <ul className="mt-2 space-y-1 tabular-nums">
          <li>
            {locale === 'nl' ? 'Regio' : 'Region'}: {country} · {stage} · {sector}
          </li>
          <li>
            {locale === 'nl' ? 'Mediaan pre-money' : 'Median pre-money'}:{' '}
            {formatEur(benchmark.average_pre_money_eur)}
          </li>
          <li>
            {locale === 'nl' ? 'Berkus per mijlpaal' : 'Berkus per milestone'}:{' '}
            {formatEur(benchmark.berkus_max_per_milestone_eur)}
          </li>
          <li>
            {locale === 'nl' ? 'Exit-multiple range' : 'Exit-multiple range'}:{' '}
            {benchmark.exit_multiple_low}× – {benchmark.exit_multiple_high}×
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-foreground/45">
          {isFallback
            ? locale === 'nl'
              ? 'Offline cijfers (statische fallback)'
              : 'Offline numbers (static fallback)'
            : `${locale === 'nl' ? 'Bijgewerkt' : 'Updated'} ${formattedPublished}`}{' '}
          · {benchmark.source}
        </p>
      </div>
    </aside>
  )
}
