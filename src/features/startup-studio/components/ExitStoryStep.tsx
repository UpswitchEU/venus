'use client'

/**
 * Step 4 — Exit Story (the VC-method narrative).
 *
 * Three controls:
 *   1. TAM / SAM / SOM funnel  → grounds the exit narrative.
 *   2. Year-5 revenue projection → either typed manually or seeded
 *      from a "growth curve" picker (3×, 5×, 8× SOM by Y5).
 *   3. Exit multiple — dual lens between sector default and a public
 *      comp slider (low / median / high) sourced from Athena.
 */

import { TrendingUp } from 'lucide-react'
import { useEffect } from 'react'
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
  locale?: 'en' | 'nl'
}

type GrowthCurve = '3x' | '5x' | '8x'

const GROWTH_MULTIPLIERS: Record<GrowthCurve, number> = {
  '3x': 3,
  '5x': 5,
  '8x': 8,
}

export function ExitStoryStep({ locale = 'en' }: ExitStoryStepProps) {
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const tamSamSom = useStartupValuationStore((s) => s.tam_sam_som)
  const setTamSamSom = useStartupValuationStore((s) => s.setTamSamSom)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const targetRoi = useStartupValuationStore((s) => s.target_roi_x)
  const setField = useStartupValuationStore((s) => s.setField)

  const { benchmark, isFallback } = useStartupBenchmark(country, stage, sector)

  // Source-of-truth for the exit multiple is the regional benchmark
  // (Athena Q1 2026 dataset, keyed on country × stage × sector).  We
  // auto-pin `exit_revenue_multiple` to the benchmark median so the
  // founder doesn't see a fiddly Low/Median/High picker that begs to
  // be over-thought.  Power users can still override via the small
  // "Adjust" affordance below if their benchmark genuinely differs.
  const benchmarkMidMultiple = Math.round(
    (benchmark.exit_multiple_low + benchmark.exit_multiple_high) / 2
  )

  // Stage-aware default ROI so the founder never sees an empty field.
  // Mirrors `regional_data.py`'s `default_target_roi_x` (pre-seed 30×,
  // seed 20×, series A 10×).  Without this auto-seed the VC-method leg
  // silently dropped out of the blend any time the founder skipped the
  // "Expected VC ROI" input, producing a misleading low pre-money.
  const stageDefaultRoi = getRegionalBaseline(country, stage).default_target_roi_x

  // Stage-aware default Y5 revenue used as a no-friction fallback when
  // the founder hasn't filled TAM/SAM/SOM yet.  The `applyGrowthCurve`
  // and `applySectorDefaultY5` helpers below let them tune precisely;
  // this auto-seed just guarantees the VC leg has a number to anchor.
  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[sector] ?? 5_000_000

  // One-shot prefill on mount + when the (country, stage, sector) tuple
  // changes.  We never override a value the founder has explicitly set
  // (the engine treats their typed numbers as canonical).
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

  const applyGrowthCurve = (curve: GrowthCurve) => {
    if (!tamSamSom.som || tamSamSom.som <= 0) return
    setField('year5_revenue_projection', Math.round(tamSamSom.som * GROWTH_MULTIPLIERS[curve]))
  }

  const applySectorDefaultY5 = () => {
    setField('year5_revenue_projection', sectorDefaultY5)
  }

  const effectiveMultiple = exitMultiple ?? benchmarkMidMultiple
  const previewY5 = y5 ?? 0
  const previewExit = previewY5 * effectiveMultiple

  return (
    <div className="space-y-5">
      {/* TAM / SAM / SOM funnel ------------------------------------- */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          {locale === 'nl' ? 'Marktgrootte (TAM / SAM / SOM)' : 'Market size (TAM / SAM / SOM)'}
        </h3>
        <p className="mb-5 text-sm text-foreground/60">
          {locale === 'nl'
            ? 'De funnel waarin investeerders je exit-verhaal toetsen — van totaal aanspreekbare markt tot het stuk dat realistisch jouw klant wordt.'
            : 'The funnel investors use to stress-test your exit narrative — from total addressable to the realistic obtainable slice.'}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <CurrencyInput
            label={`TAM (€ ${locale === 'nl' ? 'jaaromzet' : 'annual revenue'})`}
            value={tamSamSom.tam ?? undefined}
            onChange={(value) => setTamSamSom({ tam: value ?? null })}
            placeholder="50000000000"
            size="sm"
            truncateLabel={false}
            description={
              locale === 'nl'
                ? 'Totale jaaromzet wereldwijd in jouw categorie — typisch miljarden (Gartner / Statista). Voorbeeld: €50.000.000.000 = €50 miljard.'
                : 'Total annual revenue worldwide in your category — typically billions (Gartner / Statista). Example: €50,000,000,000 = €50 billion.'
            }
          />
          <CurrencyInput
            label="SAM (€)"
            value={tamSamSom.sam ?? undefined}
            onChange={(value) => setTamSamSom({ sam: value ?? null })}
            placeholder="2000000000"
            size="sm"
            truncateLabel={false}
            description={
              locale === 'nl'
                ? 'Het stuk van TAM dat je realistisch kunt bedienen vanuit je huidige geografie en kanaal. Voorbeeld: €2.000.000.000 = €2 miljard.'
                : 'The slice of TAM you can realistically reach with your current geography and channel. Example: €2,000,000,000 = €2 billion.'
            }
          />
          <CurrencyInput
            label={locale === 'nl' ? 'SOM (€) — 3jr realistisch' : 'SOM (€) — 3yr realistic'}
            value={tamSamSom.som ?? undefined}
            onChange={(value) => setTamSamSom({ som: value ?? null })}
            placeholder="50000000"
            size="sm"
            truncateLabel={false}
            description={
              locale === 'nl'
                ? 'Wat je in 3 jaar realistisch kunt veroveren — typisch 1–5% van SAM. Voorbeeld: €50.000.000 = €50 miljoen.'
                : "What you can realistically capture in 3 years — typically 1–5% of SAM. Example: €50,000,000 = €50 million."
            }
          />
        </div>

        {tamSamSom.tam && tamSamSom.sam && tamSamSom.som && (
          <div className="mt-4 flex items-center gap-2 text-xs text-foreground/60">
            <TrendingUp className="h-3.5 w-3.5" />
            {locale === 'nl' ? 'SOM = ' : 'SOM = '}
            <span className="font-semibold text-foreground">
              {((tamSamSom.som / tamSamSom.tam) * 100).toFixed(2)}%
            </span>
            {locale === 'nl' ? ' van TAM' : ' of TAM'}
          </div>
        )}
      </div>

      {/* Growth curve picker ---------------------------------------- */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          {locale === 'nl' ? 'Groeicurve naar Year 5' : 'Growth curve to Year 5'}
        </h3>
        <p className="mb-4 text-sm text-foreground/60">
          {locale === 'nl'
            ? 'Kies een groeicurve om je Y5 omzet voor te stellen, of vul handmatig in.'
            : 'Pick a growth curve to suggest your Y5 revenue, or enter it manually.'}
        </p>

        {tamSamSom.som && tamSamSom.som > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {(['3x', '5x', '8x'] as const).map((curve) => {
              const som = tamSamSom.som ?? 0
              return (
                <button
                  key={curve}
                  type="button"
                  onClick={() => applyGrowthCurve(curve)}
                  className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-xs font-medium text-foreground/80 transition hover:border-primary hover:bg-primary/5"
                >
                  {curve} SOM → {formatEur(som * GROWTH_MULTIPLIERS[curve])}
                </button>
              )
            })}
          </div>
        ) : (
          /* No SOM yet — let the founder one-click the conservative
             sector-default Y5 revenue so the VC method leg never silently
             drops out of the blend. */
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applySectorDefaultY5}
              className="rounded-lg border border-primary/40 bg-primary/[0.04] px-3 py-2 text-xs font-medium text-primary transition hover:border-primary hover:bg-primary/[0.08]"
            >
              {locale === 'nl'
                ? `Gebruik sector-default · ${formatEur(sectorDefaultY5)}`
                : `Use sector default · ${formatEur(sectorDefaultY5)}`}
            </button>
            <span className="text-[11px] text-foreground/55">
              {locale === 'nl'
                ? `(typisch Y5 ARR voor ${sector} pre-seed)`
                : `(typical Y5 ARR for ${sector} pre-seed)`}
            </span>
          </div>
        )}

        <CurrencyInput
          label={locale === 'nl' ? 'Year-5 omzet (€)' : 'Year-5 revenue (€)'}
          value={y5 ?? undefined}
          onChange={(value) => setField('year5_revenue_projection', value ?? null)}
          placeholder="1.500.000"
          size="sm"
          truncateLabel={false}
        />
      </div>

      {/* VC's target return — the only input on this card.  At pre-seed
          founders consistently misread "Expected VC ROI" as their own
          ROI; we rename to make the subject explicit and give a stage-
          aware default in the help text.  The sector multiple now lives
          at the bottom of the card as a read-only footnote, not a peer
          tile, so the input is unambiguously the only thing to fill. */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          {locale === 'nl' ? 'Wat zoekt de investeerder?' : "The investor's required return"}
        </h3>
        <p className="mb-4 text-sm text-foreground/60">
          {locale === 'nl'
            ? "Welke return-multiple moet de fund zien om de check te schrijven? Dit is de fund-side hurdle, niet jouw ROI."
            : "What return multiple does the fund need to justify the check? This is the fund-side hurdle, not your own ROI."}
        </p>

        <AdaptivePercentInput
          label={
            locale === 'nl'
              ? 'Doelrendement van de investeerder (×)'
              : "VC's target return multiple (×)"
          }
          value={targetRoi ?? undefined}
          onChange={(value) => setField('target_roi_x', value ?? null)}
          placeholder={String(stageDefaultRoi)}
          size="sm"
          truncateLabel={false}
          description={
            locale === 'nl'
              ? `Hoe hoger het cijfer, hoe lager jouw pre-money. ${stageDefaultRoi}× betekent: de investeerder wil €${stageDefaultRoi} terug per €1 die ze nu storten — typisch 7–10 jaar later, na meerdere rondes verwatering. Pre-seed ~30×, seed ~20×, Series A ~10×. We hebben ${stageDefaultRoi}× ingevuld voor ${stage.replace('_', ' ')}.`
              : `The higher the number, the lower your pre-money. ${stageDefaultRoi}× means the investor wants €${stageDefaultRoi} back for every €1 they put in today — typically 7–10 years later, after several rounds of dilution. Pre-seed ~30×, seed ~20×, Series A ~10×. We pre-filled ${stageDefaultRoi}× for ${stage.replace('_', ' ')}.`
          }
        />

        {previewExit > 0 && (
          <div className="mt-4 rounded-xl bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-foreground/55">
              {locale === 'nl' ? 'Geïmpliceerde exit EV' : 'Implied exit EV'}
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
              {formatEur(previewExit)}
            </p>
            <p className="mt-1 text-[11px] text-foreground/55">
              {formatEur(previewY5)} × {effectiveMultiple}×
            </p>
          </div>
        )}

        {/* Sector multiple footnote — read-only, dropped to the bottom
            so it reads as audit context, not an additional input. */}
        <p className="mt-4 border-t border-foreground/10 pt-3 text-[11px] text-foreground/55">
          {locale === 'nl' ? 'Sector exit-multiple: ' : 'Sector exit multiple: '}
          <span className="font-medium tabular-nums text-foreground">{effectiveMultiple}×</span>
          {' · '}
          {locale === 'nl' ? 'range ' : 'range '}
          {benchmark.exit_multiple_low}–{benchmark.exit_multiple_high}× · {sector}
          {' · '}
          {locale === 'nl' ? 'Athena Q1 2026' : 'Athena Q1 2026'}
          {isFallback && (locale === 'nl' ? ' · offline' : ' · offline')}
        </p>
      </div>
    </div>
  )
}
