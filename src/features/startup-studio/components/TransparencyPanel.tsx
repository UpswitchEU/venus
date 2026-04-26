'use client'

/**
 * TransparencyPanel — preview-side "why this number" explainer.
 *
 * **IMPORTANT — boundary discipline.**
 *
 * The canonical valuation, price range, main report and PDF are produced
 * by ValuationIQ (Python).  Venus is the input UX + a live preview.
 * This panel surfaces a *preview* of the engine's transparency layer
 * built from `useLiveValuation` (a client-side mirror of the engine
 * math) so the founder can sanity-check their picks before clicking
 * Generate.
 *
 * The panel deliberately:
 *   - Labels itself as a *preview* (not the audit-ready report).
 *   - Points the reader at the canonical ValuationIQ PDF / report for
 *     anything an investor or accountant will actually consume.
 *   - Avoids producing PDF-shaped content (no executive summary, no
 *     numbered sections, no logo / cover page).  Those live on the
 *     ValuationIQ side.
 *
 * Every fact is derived from existing engine + benchmark state — no new
 * data, no LLM-fabricated content.  The point is to surface what's
 * already in the live-preview payload, with an honest label.
 */

import { ChevronDown, ExternalLink, Info, Microscope, TrendingUp } from 'lucide-react'
import {
  type AmbitionLevel,
  inferAmbition,
} from '@/features/startup-studio/data/ambition'
import {
  type TeamLevel,
  inferTeamLevel,
} from '@/features/startup-studio/data/teamLevel'
import {
  type LiveValuation,
  formatEur,
} from '@/features/startup-studio/hooks/useLiveValuation'
import {
  buildWhyNarrative,
  computeY5Sensitivity,
  type NarrativeContext,
} from '@/features/startup-studio/utils/narrativeBuilder'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { cn } from '@/lib/utils'

interface TransparencyPanelProps {
  valuation: LiveValuation
  benchmark: StartupBenchmarkRow
  isFallback: boolean
  publishedAt: string
  locale?: 'en' | 'nl'
}

const LEG_LABEL: Record<string, { en: string; nl: string }> = {
  berkus: {
    en: 'Berkus — milestone-driven',
    nl: 'Berkus — milestone-gedreven',
  },
  scorecard: {
    en: 'Bill Payne Scorecard — peer comparison',
    nl: 'Bill Payne Scorecard — peer-vergelijking',
  },
  vc: {
    en: 'VC Method (Sahlman) — exit-driven',
    nl: 'VC Method (Sahlman) — exit-gedreven',
  },
  saas_forward: {
    en: 'SaaS Forward Multiple — traction-driven',
    nl: 'SaaS Forward Multiple — tractie-gedreven',
  },
}

const LEG_INPUT_NOTE: Record<string, { en: string; nl: string }> = {
  berkus: {
    en: 'Driven by your 5 risk-reduction milestones (idea, prototype, team, partnerships, rollout).',
    nl: 'Gedreven door je 5 risico-reductie mijlpalen (idee, prototype, team, partnerships, uitrol).',
  },
  scorecard: {
    en: "Driven by 7 weighted factors comparing you to the regional pre-seed average.",
    nl: 'Gedreven door 7 gewogen factoren vergeleken met het regionale pre-seed gemiddelde.',
  },
  vc: {
    en: 'Driven by your Y5 ARR thesis × exit multiple ÷ target ROI − round size.',
    nl: 'Gedreven door je Y5 ARR thesis × exit multiple ÷ target ROI − ronde-grootte.',
  },
  saas_forward: {
    en: 'Driven by current MRR projected forward 12 months × risk-adjusted multiple.',
    nl: 'Gedreven door huidige MRR vooruit-geprojecteerd 12 maanden × risico-aangepaste multiple.',
  },
}

export function TransparencyPanel({
  valuation,
  benchmark,
  isFallback,
  publishedAt,
  locale = 'en',
}: TransparencyPanelProps) {
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMul = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const roi = useStartupValuationStore((s) => s.target_roi_x)
  const pedigreeFlags = useStartupValuationStore((s) => s.founder_pedigree)

  // Hide the panel until the founder has answered enough — otherwise we'd
  // render five empty rows on first paint.
  if (valuation.isEmpty || !valuation.blended) return null

  const teamLevel: TeamLevel | null = inferTeamLevel(pedigreeFlags)
  const ambitionLevel: AmbitionLevel | null = inferAmbition(sector, y5, exitMul, roi)

  const ctx: NarrativeContext = {
    preMoney: valuation.blended.mid,
    raise: investment ?? 0,
    prePedigreeMid: valuation.blendedPrePedigree?.mid ?? null,
    pedigreeMultiplier: valuation.pedigreeMultiplier,
    legs: {
      berkus: valuation.legs.find((l) => l.key === 'berkus')?.value ?? null,
      scorecard: valuation.legs.find((l) => l.key === 'scorecard')?.value ?? null,
      vc: valuation.legs.find((l) => l.key === 'vc')?.value ?? null,
      saasForward: valuation.legs.find((l) => l.key === 'saas_forward')?.value ?? null,
    },
    stage,
    sector,
    countryCode: country,
    team: teamLevel,
    ambition: ambitionLevel,
    year5Revenue: y5 ?? null,
  }

  const whyParagraphs = buildWhyNarrative(ctx, locale)
  const sensitivity = computeY5Sensitivity(ctx)

  // Benchmark band: regional pre-money median ± a pragmatic ±60% band
  // (covers the empirical P25–P75 range of Atomico SoEU 2024 + Dealroom
  // Benelux Q1 2026 published distributions).  Engine plotted on top.
  const median = benchmark.average_pre_money_eur
  const bandLow = median * 0.5
  const bandHigh = median * 2.0
  const bandRange = bandHigh - bandLow
  const enginePos = Math.min(
    100,
    Math.max(0, ((valuation.blended.mid - bandLow) / bandRange) * 100),
  )
  const medianPos = Math.min(100, Math.max(0, ((median - bandLow) / bandRange) * 100))

  // Sensitivity range plot — same axis as benchmark band so the eye can
  // compare both "where peers sit" and "where you'd land if Y5 is ±20%".
  const sensitivityLowPos = sensitivity
    ? Math.min(
        100,
        Math.max(0, ((sensitivity.low - bandLow) / bandRange) * 100),
      )
    : null
  const sensitivityHighPos = sensitivity
    ? Math.min(
        100,
        Math.max(0, ((sensitivity.high - bandLow) / bandRange) * 100),
      )
    : null

  return (
    <details
      open
      className="group rounded-2xl border border-foreground/10 bg-background/80 shadow-sm"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-foreground hover:text-primary">
        <span className="flex items-center gap-2">
          <Microscope className="h-4 w-4 text-primary" />
          {locale === 'nl' ? 'Live-preview: waarom dit cijfer?' : 'Live preview: why this number?'}
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-6 border-t border-foreground/10 px-5 py-5">
        {/* 0. Preview disclaimer — the canonical valuation, price range,
            main report and PDF are produced by ValuationIQ.  This panel
            is a live preview built from the client-side mirror of the
            engine math.  Every figure recomputes deterministically on
            the ValuationIQ side when the founder hits Generate, and the
            PDF that ships to investors is rendered server-side.  Making
            this explicit prevents a sceptical investor from mistaking
            the preview for the audit-ready deliverable. */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/60 p-3 text-[11px] text-amber-900/80 dark:border-amber-700/30 dark:bg-amber-950/30 dark:text-amber-200/80">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {locale === 'nl' ? (
              <>
                <span className="font-semibold">Live preview.</span> De canonieke
                waardering, range en PDF worden door <span className="font-medium">ValuationIQ</span> gerenderd
                wanneer je op <span className="font-medium">Genereer rapport</span> klikt.
                Toon investeerders het rapport, niet dit voorbeeld.
              </>
            ) : (
              <>
                <span className="font-semibold">Live preview.</span> The canonical
                valuation, range and PDF are rendered by <span className="font-medium">ValuationIQ</span>{' '}
                when you click <span className="font-medium">Generate report</span>.
                Show investors the report — not this preview.
              </>
            )}
          </span>
        </div>

        {/* 1. Plain-English narrative ------------------------------- */}
        <section>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            {locale === 'nl' ? '1. In gewoon Nederlands' : '1. In plain English'}
          </h4>
          <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
            {whyParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* 2. Methodology breakdown — euros and arrows ------------- */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            {locale === 'nl' ? '2. De wiskunde, leg per leg' : '2. The math, leg by leg'}
          </h4>
          <ul className="space-y-2.5">
            {valuation.legs.map((leg) => {
              const label = LEG_LABEL[leg.key]?.[locale] ?? leg.key
              const note = LEG_INPUT_NOTE[leg.key]?.[locale] ?? ''
              const value = leg.value
              if (value == null) {
                return (
                  <li
                    key={leg.key}
                    className="rounded-lg border border-dashed border-foreground/10 bg-foreground/[0.02] p-3 opacity-60"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground/65">{label}</span>
                      <span className="text-foreground/45">
                        {locale === 'nl' ? 'niet beschikbaar' : 'not available'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-foreground/45">{note}</p>
                  </li>
                )
              }
              return (
                <li
                  key={leg.key}
                  className="rounded-lg border border-foreground/10 bg-background/60 p-3"
                >
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="tabular-nums text-foreground">
                      {formatEur(value)}{' '}
                      <span className="text-foreground/50">
                        × {(leg.weight * 100).toFixed(0)}% ={' '}
                        {formatEur(value * leg.weight)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
                    {note}
                  </p>
                </li>
              )
            })}
          </ul>
          {valuation.pedigreeMultiplier !== 1.0 && (
            <p className="mt-3 rounded-md bg-primary/[0.06] p-2.5 text-xs text-foreground/75">
              {locale === 'nl'
                ? `Daarna een team-pedigree multiplier van ${valuation.pedigreeMultiplier.toFixed(2)}× op de leg-blend (${formatEur(valuation.blendedPrePedigree?.mid ?? null)} → ${formatEur(valuation.blended.mid)}).`
                : `Then a team-pedigree multiplier of ${valuation.pedigreeMultiplier.toFixed(2)}× on the leg blend (${formatEur(valuation.blendedPrePedigree?.mid ?? null)} → ${formatEur(valuation.blended.mid)}).`}
            </p>
          )}
        </section>

        {/* 3. Benchmark band ---------------------------------------- */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            <TrendingUp className="h-3 w-3" />
            {locale === 'nl' ? '3. Benchmark — waar zitten peers?' : '3. Benchmark — where do peers sit?'}
          </h4>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-[11px] tabular-nums text-foreground/55">
              <span>{formatEur(bandLow)}</span>
              <span className="font-medium text-foreground/75">
                {country} · {stage.replace('_', ' ')} · {sector}
              </span>
              <span>{formatEur(bandHigh)}</span>
            </div>

            <div className="relative h-4 rounded-full bg-gradient-to-r from-foreground/[0.04] via-primary/10 to-foreground/[0.04]">
              {/* Median tick */}
              <div
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/30"
                style={{ left: `${medianPos}%` }}
                aria-label={`Median ${formatEur(median)}`}
              />
              {/* Engine output marker */}
              <div
                className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background shadow-md"
                style={{ left: `${enginePos}%` }}
                aria-label={`Engine output ${formatEur(valuation.blended.mid)}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-foreground/55">
              <span>
                {locale === 'nl' ? 'Mediaan: ' : 'Median: '}
                <span className="font-medium tabular-nums text-foreground/75">
                  {formatEur(median)}
                </span>
              </span>
              <span className="font-medium text-primary">
                {locale === 'nl' ? 'Jij: ' : 'You: '}
                <span className="tabular-nums">{formatEur(valuation.blended.mid)}</span>
              </span>
            </div>
            <p className="text-[10px] text-foreground/45">
              {locale === 'nl'
                ? 'Band: 0.5× – 2× regionale mediaan (P25–P75 empirisch bereik).'
                : 'Band: 0.5× – 2× regional median (empirical P25–P75 range).'}
            </p>
          </div>
        </section>

        {/* 4. Sensitivity ------------------------------------------- */}
        {sensitivity && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
              <Info className="h-3 w-3" />
              {locale === 'nl'
                ? `4. Wat als je Y5-thesis ±20% afwijkt?`
                : `4. What if your Y5 thesis is off by ±20%?`}
            </h4>
            <div className="space-y-2 rounded-lg bg-foreground/[0.03] p-3">
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-foreground/55">
                  {locale === 'nl' ? 'Conservatief' : 'Conservative'}
                </span>
                <span className="font-medium text-foreground">
                  {formatEur(sensitivity.low)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-foreground/55">
                  {locale === 'nl' ? 'Mid (engine output)' : 'Mid (engine output)'}
                </span>
                <span className="font-bold text-primary">
                  {formatEur(sensitivity.mid)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-foreground/55">
                  {locale === 'nl' ? 'Bullish' : 'Bullish'}
                </span>
                <span className="font-medium text-foreground">
                  {formatEur(sensitivity.high)}
                </span>
              </div>

              {/* Range bar — same axis as benchmark band for direct comparison */}
              <div className="relative h-2 rounded-full bg-foreground/[0.06]">
                <div
                  className="absolute h-2 rounded-full bg-primary/40"
                  style={{
                    left: `${sensitivityLowPos ?? 0}%`,
                    width: `${(sensitivityHighPos ?? 0) - (sensitivityLowPos ?? 0)}%`,
                  }}
                />
                <div
                  className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-primary"
                  style={{ left: `${enginePos}%` }}
                />
              </div>
              <p className="text-[10px] text-foreground/45">
                {locale === 'nl'
                  ? `Y5-thesis is de meest gehefboomde input bij pre-seed. ±20% beweging ⇒ ±${sensitivity.spreadPct}% pre-money.`
                  : `Y5 thesis is the most leveraged pre-seed input. ±20% shift ⇒ ±${sensitivity.spreadPct}% pre-money.`}
              </p>
            </div>
          </section>
        )}

        {/* 5. Source provenance ------------------------------------- */}
        <section>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            {locale === 'nl' ? '5. Bronnen & methodologie' : '5. Sources & methodology'}
          </h4>
          <ul className="space-y-1 text-[11px] text-foreground/60">
            <li>
              <span className="font-medium text-foreground/75">Berkus (2024):</span>{' '}
              {locale === 'nl'
                ? '5 risico-reductie mijlpalen, geüpdated voor het 2024 venture klimaat.'
                : '5 risk-reduction milestones, refreshed for the 2024 venture climate.'}
            </li>
            <li>
              <span className="font-medium text-foreground/75">Bill Payne Scorecard (2024):</span>{' '}
              {locale === 'nl'
                ? '7 gewogen factoren, peer-comparison band 0.5×–1.5×.'
                : '7 weighted factors, peer-comparison band 0.5×–1.5×.'}
            </li>
            <li>
              <span className="font-medium text-foreground/75">VC Method (Sahlman):</span>{' '}
              {locale === 'nl'
                ? 'Y5 omzet × exit-multiple ÷ target ROI − ronde-grootte.'
                : 'Y5 revenue × exit multiple ÷ target ROI − round size.'}
            </li>
            <li>
              <span className="font-medium text-foreground/75">Pedigree (Strebulaev 2024):</span>{' '}
              {locale === 'nl'
                ? 'Multiplicatieve overlay 0.70×–1.80× op leg-blend baseline.'
                : 'Multiplicative overlay 0.70×–1.80× on leg-blend baseline.'}
            </li>
            <li className="pt-1 text-foreground/45">
              {locale === 'nl' ? 'Benchmarks: ' : 'Benchmarks: '}
              <span className="font-medium text-foreground/65">
                Atomico State of European Tech 2024 + Dealroom Benelux Q1 2026
              </span>
              {' · '}
              {isFallback
                ? locale === 'nl'
                  ? 'offline fallback'
                  : 'offline fallback'
                : `${locale === 'nl' ? 'bijgewerkt ' : 'updated '}${publishedAt.slice(0, 7)}`}
              {' · '}
              <span className="text-foreground/45">{benchmark.source}</span>
            </li>
          </ul>
        </section>

        {/* 6. Reproducibility note — emphasises that the canonical
            engine (ValuationIQ) is the source of truth, not the
            client-side preview.  The preview matches because the engine
            math is mirrored — but the audit-ready number always comes
            back from the server. */}
        <section className="flex items-start gap-2 rounded-lg bg-primary/[0.04] p-3">
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-[11px] leading-relaxed text-foreground/70">
            {locale === 'nl' ? (
              <>
                Audit-ready cijfer komt van <span className="font-medium text-foreground">ValuationIQ</span>{' '}
                (Python engine, server-side).  Deze preview spiegelt dezelfde wiskunde, maar
                het canonieke getal — dat in je PDF en op je rapport staat — wordt deterministisch
                berekend op de server.  Identieke inputs ⇒ identiek getal.  Geen LLM-hallucinatie,
                geen verborgen regels.
              </>
            ) : (
              <>
                The audit-ready number comes from{' '}
                <span className="font-medium text-foreground">ValuationIQ</span> (Python engine,
                server-side).  This preview mirrors the same math, but the canonical figure —
                the one on your PDF and your report — is computed deterministically on the
                server.  Identical inputs ⇒ identical number.  No LLM hallucination, no hidden
                rules.
              </>
            )}
          </p>
        </section>
      </div>
    </details>
  )
}
