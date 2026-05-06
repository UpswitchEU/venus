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

import { ChevronDown, Compass, ExternalLink, Info, Microscope, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
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

interface TransparencyPanelProps {
  valuation: LiveValuation
  benchmark: StartupBenchmarkRow
  isFallback: boolean
  publishedAt: string
}

function studioLocale(locale: string): 'en' | 'nl' {
  return locale === 'nl' ? 'nl' : 'en'
}

export function TransparencyPanel({
  valuation,
  benchmark,
  isFallback,
  publishedAt,
}: TransparencyPanelProps) {
  const locale = studioLocale(useLocale())
  const t = useTranslations('startupStudio.transparency')
  const tCommon = useTranslations('startupStudio.common')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')

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
    ? Math.min(100, Math.max(0, ((sensitivity.low - bandLow) / bandRange) * 100))
    : null
  const sensitivityHighPos = sensitivity
    ? Math.min(100, Math.max(0, ((sensitivity.high - bandLow) / bandRange) * 100))
    : null

  const multStr = valuation.inceptionLensMultiplier.toFixed(2)
  const bandPct = String(Math.round(valuation.inceptionLensBandWidenPct * 100))

  return (
    <details
      open
      className="group rounded-2xl border border-foreground/10 bg-background/80 shadow-sm"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-foreground hover:text-primary">
        <span className="flex items-center gap-2">
          <Microscope className="h-4 w-4 text-primary" />
          {t('summaryTitle')}
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
            <span className="font-semibold">{t('disclaimerBold')}</span>{' '}
            {t('disclaimerP1')}
            <span className="font-medium text-foreground">{t('valuationIq')}</span>
            {t('disclaimerP2')}
            <span className="font-medium text-foreground">{t('generateCta')}</span>
            {t('disclaimerP3')}
          </span>
        </div>

        {/* 1. Plain-English narrative ------------------------------- */}
        <section>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            {t('sectionPlain')}
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
            {t('sectionMath')}
          </h4>
          <ul className="space-y-2.5">
            {valuation.legs.map((leg) => {
              const label = t(`legLabels.${leg.key}` as never)
              const note = t(`legNotes.${leg.key}` as never)
              const value = leg.value
              if (value == null) {
                return (
                  <li
                    key={leg.key}
                    className="rounded-lg border border-dashed border-foreground/10 bg-foreground/[0.02] p-3 opacity-60"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground/65">{label}</span>
                      <span className="text-foreground/45">{t('notAvailable')}</span>
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
              {t('pedigreeMultiplier', {
                mult: valuation.pedigreeMultiplier.toFixed(2),
                from: formatEur(valuation.blendedPrePedigree?.mid ?? null),
                to: formatEur(valuation.blendedPreLens?.mid ?? valuation.blended.mid),
              })}
            </p>
          )}
        </section>

        {/* 2.5. Inception lens — surfaced ONLY when the founder picked
            a non-default lens.  Critical for transparency: when the
            band suddenly widens dramatically, the panel must explain
            why (multiplier + band-widening + named lens rationale)
            instead of leaving a Bain consultant guessing. */}
        {valuation.inceptionLens !== 'milestones_driven' && (
          <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.05] to-primary/[0.02] p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Compass className="h-3 w-3" />
              {t('inceptionSection')}
            </h4>
            <p className="text-xs leading-relaxed text-foreground/80">
              <span className="font-semibold text-foreground">
                {valuation.inceptionLens === 'momentum_driven'
                  ? t('lensMomentum')
                  : t('lensBet')}
              </span>
              {' — '}
              {valuation.inceptionLens === 'momentum_driven'
                ? t('inceptionMomentumRest', { mult: multStr, band: bandPct })
                : t('inceptionBetRest', { mult: multStr, band: bandPct })}
            </p>
            {valuation.blendedPreLens && (
              <p className="mt-2 text-[11px] tabular-nums text-foreground/65">
                {t('preLens')}
                <span className="font-medium text-foreground">
                  {formatEur(valuation.blendedPreLens.mid)}
                </span>
                {' → '}
                {t('afterLens')}
                <span className="font-medium text-foreground">
                  {formatEur(valuation.blended.mid)}
                </span>
              </p>
            )}
          </section>
        )}

        {/* 3. Benchmark band ---------------------------------------- */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            <TrendingUp className="h-3 w-3" />
            {t('benchmark')}
          </h4>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-[11px] tabular-nums text-foreground/55">
              <span>{formatEur(bandLow)}</span>
              <span className="font-medium text-foreground/75">
                {country} · {tStageLabels(stage)} · {tSectorLabels(sector)}
              </span>
              <span>{formatEur(bandHigh)}</span>
            </div>

            <div className="relative h-4 rounded-full bg-gradient-to-r from-foreground/[0.04] via-primary/10 to-foreground/[0.04]">
              {/* Median tick */}
              <div
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/30"
                style={{ left: `${medianPos}%` }}
                aria-label={t('medianAria', { amount: formatEur(median) })}
              />
              {/* Engine output marker */}
              <div
                className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background shadow-md"
                style={{ left: `${enginePos}%` }}
                aria-label={t('engineAria', { amount: formatEur(valuation.blended.mid) })}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-foreground/55">
              <span>
                {t('medianLabel')}
                <span className="font-medium tabular-nums text-foreground/75">
                  {formatEur(median)}
                </span>
              </span>
              <span className="font-medium text-primary">
                {t('youLabel')}
                <span className="tabular-nums">{formatEur(valuation.blended.mid)}</span>
              </span>
            </div>
            <p className="text-[10px] text-foreground/45">{t('bandCaption')}</p>
          </div>
        </section>

        {/* 4. Sensitivity ------------------------------------------- */}
        {sensitivity && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
              <Info className="h-3 w-3" />
              {t('sensitivityTitle')}
            </h4>
            <div className="space-y-2 rounded-lg bg-foreground/[0.03] p-3">
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-foreground/55">{tCommon('conservative')}</span>
                <span className="font-medium text-foreground">
                  {formatEur(sensitivity.low)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-foreground/55">{tCommon('midEngine')}</span>
                <span className="font-bold text-primary">
                  {formatEur(sensitivity.mid)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-foreground/55">{tCommon('bullish')}</span>
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
                {t('sensitivityFoot', { spreadPct: sensitivity.spreadPct })}
              </p>
            </div>
          </section>
        )}

        {/* 5. Source provenance ------------------------------------- */}
        <section>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
            {t('sourcesHeading')}
          </h4>
          <ul className="space-y-1 text-[11px] text-foreground/60">
            <li>
              <span className="font-medium text-foreground/75">{t('sourceBerkusTitle')}</span>{' '}
              {t('sourceBerkus')}
            </li>
            <li>
              <span className="font-medium text-foreground/75">{t('sourceScorecardTitle')}</span>{' '}
              {t('sourceScorecard')}
            </li>
            <li>
              <span className="font-medium text-foreground/75">{t('sourceVcTitle')}</span>{' '}
              {t('sourceVc')}
            </li>
            <li>
              <span className="font-medium text-foreground/75">{t('sourcePedigreeTitle')}</span>{' '}
              {t('sourcePedigree')}
            </li>
            <li>
              <span className="font-medium text-foreground/75">{t('sourceInceptionTitle')}</span>{' '}
              {t('sourceInception')}
            </li>
            <li className="pt-1 text-foreground/45">
              {t('benchmarksLabel')}{' '}
              <span className="font-medium text-foreground/65">
                Atomico State of European Tech 2024 + Dealroom Benelux Q1 2026
              </span>
              {' · '}
              {isFallback
                ? t('offlineFallback')
                : `${t('updatedPrefix')}${publishedAt.slice(0, 7)}`}
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
            {t.rich('repro', {
              viq: () => (
                <span className="font-medium text-foreground">{t('valuationIq')}</span>
              ),
            })}
          </p>
        </section>
      </div>
    </details>
  )
}
