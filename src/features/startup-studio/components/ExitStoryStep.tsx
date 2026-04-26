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
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { AdaptivePercentInput } from '@/components/calculator/sections/AdaptivePercentInput'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STARTUP_SECTOR_EXIT_MULTIPLES,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'

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

  const { benchmark } = useStartupBenchmark(country, stage, sector)

  const sectorDefaultMultiple = STARTUP_SECTOR_EXIT_MULTIPLES[sector] ?? 6
  const benchmarkMidMultiple = Math.round(
    (benchmark.exit_multiple_low + benchmark.exit_multiple_high) / 2,
  )

  const applyGrowthCurve = (curve: GrowthCurve) => {
    if (!tamSamSom.som || tamSamSom.som <= 0) return
    setField('year5_revenue_projection', Math.round(tamSamSom.som * GROWTH_MULTIPLIERS[curve]))
  }

  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[sector] ?? 5_000_000
  const applySectorDefaultY5 = () => {
    setField('year5_revenue_projection', sectorDefaultY5)
  }

  const previewY5 = y5 ?? 0
  const previewExit = previewY5 * (exitMultiple ?? sectorDefaultMultiple)

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
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">
              TAM (€ {locale === 'nl' ? 'jaaromzet' : 'annual revenue'})
            </label>
            <CurrencyInput
              value={tamSamSom.tam ?? undefined}
              onChange={(value) => setTamSamSom({ tam: value ?? null })}
              placeholder="50.000.000.000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">SAM (€)</label>
            <CurrencyInput
              value={tamSamSom.sam ?? undefined}
              onChange={(value) => setTamSamSom({ sam: value ?? null })}
              placeholder="2.000.000.000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/70">
              SOM (€) <span className="text-foreground/40">— 3yr realistic</span>
            </label>
            <CurrencyInput
              value={tamSamSom.som ?? undefined}
              onChange={(value) => setTamSamSom({ som: value ?? null })}
              placeholder="50.000.000"
            />
          </div>
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

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground/70">
            {locale === 'nl' ? 'Year-5 omzet (€)' : 'Year-5 revenue (€)'}
          </label>
          <CurrencyInput
            value={y5 ?? undefined}
            onChange={(value) => setField('year5_revenue_projection', value ?? null)}
            placeholder="1.500.000"
          />
        </div>
      </div>

      {/* Exit multiple — dual lens ---------------------------------- */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          {locale === 'nl' ? 'Exit-multiple (EV / omzet)' : 'Exit multiple (EV / revenue)'}
        </h3>
        <p className="mb-4 text-sm text-foreground/60">
          {locale === 'nl'
            ? `Sector-default voor ${sector}: ${sectorDefaultMultiple}× · Athena Q1 2026 range: ${benchmark.exit_multiple_low}–${benchmark.exit_multiple_high}× (mediaan ${benchmarkMidMultiple}×).`
            : `Sector default for ${sector}: ${sectorDefaultMultiple}× · Athena Q1 2026 range: ${benchmark.exit_multiple_low}–${benchmark.exit_multiple_high}× (median ${benchmarkMidMultiple}×).`}
        </p>

        <div className="mb-4">
          <SegmentedControl
            options={[
              {
                value: 'low',
                label: `Low (${benchmark.exit_multiple_low}×)`,
              },
              {
                value: 'mid',
                label: `Median (${benchmarkMidMultiple}×)`,
              },
              {
                value: 'high',
                label: `High (${benchmark.exit_multiple_high}×)`,
              },
            ]}
            value={
              exitMultiple === benchmark.exit_multiple_low
                ? 'low'
                : exitMultiple === benchmark.exit_multiple_high
                  ? 'high'
                  : 'mid'
            }
            onChange={(v) =>
              setField(
                'exit_revenue_multiple',
                v === 'low'
                  ? benchmark.exit_multiple_low
                  : v === 'high'
                    ? benchmark.exit_multiple_high
                    : benchmarkMidMultiple,
              )
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <AdaptivePercentInput
              label={locale === 'nl' ? 'Custom multiple (×)' : 'Custom multiple (×)'}
              value={exitMultiple ?? undefined}
              onChange={(value) => setField('exit_revenue_multiple', value ?? null)}
              placeholder={`${benchmarkMidMultiple}`}
            />
          </div>
          <div>
            <AdaptivePercentInput
              label={locale === 'nl' ? 'Verwachte VC ROI (×)' : 'Expected VC ROI (×)'}
              value={targetRoi ?? undefined}
              onChange={(value) => setField('target_roi_x', value ?? null)}
              placeholder="15"
            />
          </div>
        </div>

        {previewExit > 0 && (
          <div className="mt-4 rounded-xl bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-foreground/55">
              {locale === 'nl' ? 'Geïmpliceerde exit EV' : 'Implied exit EV'}
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
              {formatEur(previewExit)}
            </p>
            <p className="mt-1 text-[11px] text-foreground/55">
              {formatEur(previewY5)} × {exitMultiple ?? sectorDefaultMultiple}×
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
