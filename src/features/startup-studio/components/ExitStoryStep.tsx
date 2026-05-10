'use client'

/**
 * Step 4 — Exit Story (the VC-method narrative).
 *
 * Three controls — together they ARE the EV/Revenue spine that drives
 * the headline pre-money:
 *   1. Year-5 revenue projection — typed manually or seeded from the
 *      sector default for the founder's stage.
 *   2. Exit EV/Revenue multiple — pre-filled from the sector benchmark
 *      (Athena Q1 2026); editable with an inline "rationale" prompt
 *      that lands verbatim on the investor PDF.
 *   3. Investor's required return (target ROI multiple).
 *
 * TAM/SAM/SOM was removed 2026-05-08: the engine never read it, the
 * report never rendered it, and the only mechanical use was a 3×/5×/8×
 * SOM helper button that's now superseded by the sector-default Y5
 * seed.
 */

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo } from 'react'
import { CurrencyInput } from '@/components/calculator/CurrencyInput'
import { PrefillBadge } from '@/features/startup-studio/components/PrefillBadge'
import { XMultiplierInput } from '@/features/startup-studio/components/XMultiplierInput'
import { getRegionalBaseline } from '@/components/calculator/sections/startup/regionalBaseline'
import { InceptionLensPicker } from '@/features/startup-studio/components/InceptionLensPicker'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

/**
 * Stage-anchored target-ROI presets.  Mirrors the per-stage defaults
 * in `regional_data.py` (`default_target_roi_x`) so the chip values
 * always match what the engine assumes for an empty input.  Pre-seed
 * funds want ~30× to back into a 10-year fund return; the multiple
 * compresses with stage as the risk shrinks.
 */
const ROI_PRESETS: ReadonlyArray<{ stage: StartupStage; value: number }> = [
  { stage: 'pre_seed', value: 30 },
  { stage: 'seed', value: 20 },
  { stage: 'series_a', value: 10 },
] as const

interface ExitStoryStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

export function ExitStoryStep(_props: ExitStoryStepProps) {
  const t = useTranslations('startupStudio.exitStory')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const locale = useLocale()
  const intlFmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 0,
        useGrouping: true,
      }),
    [locale],
  )
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const targetRoi = useStartupValuationStore((s) => s.target_roi_x)
  const setField = useStartupValuationStore((s) => s.setField)
  // Traction signals — fed in only to drive the Y5 sanity check.
  // The engine separately reads MRR/ARR for the SaaS forward leg.
  const mrr = useStartupValuationStore((s) => s.mrr)
  const arr = useStartupValuationStore((s) => s.arr)

  const { benchmark, isFallback } = useStartupBenchmark(country, stage, sector)
  const stageLabel = tStageLabels(stage)

  const benchmarkMidMultiple = Math.round(
    (benchmark.exit_multiple_low + benchmark.exit_multiple_high) / 2,
  )
  const stageDefaultRoi = getRegionalBaseline(country, stage).default_target_roi_x
  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[sector] ?? 5_000_000
  // Placeholder shows the *sector-anchored* default so the empty state
  // matches the "Use sector default" button below — the previous
  // hardcoded €1.5M was wrong for biotech (€4M default), consumer
  // (€10M default), etc.  Founder briefly seeing an empty input on
  // first paint (before the seed effect fires) shouldn't see a number
  // that disagrees with what the store will fill in.
  const y5Placeholder = useMemo(
    () => intlFmt.format(sectorDefaultY5),
    [intlFmt, sectorDefaultY5],
  )

  // Pre-fill targetRoi and y5 only — the exit multiple is owned by the
  // ExitMultipleOverride subcomponent below (its own effect seeds the
  // sector benchmark and persists overrides + rationale).
  useEffect(() => {
    if (targetRoi == null) {
      setField('target_roi_x', stageDefaultRoi)
    }
    if (y5 == null) {
      setField('year5_revenue_projection', sectorDefaultY5)
    }
  }, [
    targetRoi,
    y5,
    stageDefaultRoi,
    sectorDefaultY5,
    setField,
  ])

  const applySectorDefaultY5 = () => {
    setField('year5_revenue_projection', sectorDefaultY5)
  }

  const effectiveMultiple = exitMultiple ?? benchmarkMidMultiple
  const previewY5 = y5 ?? 0
  const previewExit = previewY5 * effectiveMultiple

  // Y5 sanity guards — three failure modes:
  //   1. Impossible growth (post-revenue): Y5/ARR > 100× implies
  //      sustained ~12+%/mo compounding for 60 months. Top-quartile
  //      EU SaaS = 8–12%/mo.
  //   2. Y5 below current (post-revenue): Y5 < 0.5× current ARR is
  //      almost certainly a data error (one-off vs recurring, etc.)
  //      and produces a nonsensical pre-money once the multiple is
  //      applied.
  //   3. Above sector P95 (pre-revenue): pre-revenue founders never
  //      tripped the post-revenue guards — a pre-seed biotech typing
  //      €500M Y5 saw zero friction. The absolute ceiling fires when
  //      Y5 exceeds 5× the sector default (rough P95 anchor for
  //      pre-revenue cohorts) so audacious-but-undefended numbers
  //      surface BEFORE the report renders a fragile headline.
  const currentArrSignal =
    typeof arr === 'number' && arr > 0
      ? arr
      : typeof mrr === 'number' && mrr > 0
        ? mrr * 12
        : null
  // Sector-default-anchored ceiling for pre-revenue founders. 5× the
  // sector default approximates the P95 for that stage — anything
  // above this needs a separate "moonshot" rationale or it'll look
  // like a typo to investors.
  const PRE_REVENUE_Y5_CEILING_MULT = 5
  const preRevenueCeiling = sectorDefaultY5 * PRE_REVENUE_Y5_CEILING_MULT
  let y5SanityState:
    | 'impossible'
    | 'below_current'
    | 'pre_revenue_too_high'
    | null = null
  let y5SanityRatio = 0
  let y5SanityMonthlyGrowth = 0
  if (currentArrSignal != null && previewY5 > 0) {
    const ratio = previewY5 / currentArrSignal
    if (ratio < 0.5) {
      y5SanityState = 'below_current'
      y5SanityRatio = ratio
    } else if (ratio > 100) {
      y5SanityState = 'impossible'
      y5SanityRatio = ratio
      // 5 years = 60 months; required monthly growth = ratio^(1/60) - 1
      y5SanityMonthlyGrowth = (Math.pow(ratio, 1 / 60) - 1) * 100
    }
  } else if (previewY5 > preRevenueCeiling) {
    // Pre-revenue path. Only fires when no MRR/ARR is present so we
    // never double-warn over the post-revenue guards.
    y5SanityState = 'pre_revenue_too_high'
    y5SanityRatio = previewY5 / sectorDefaultY5
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('y5Title')}</h3>
        <p className="mb-4 text-sm text-foreground/60">{t('y5Lead')}</p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applySectorDefaultY5}
            className="rounded-lg border border-primary/40 bg-primary/[0.04] px-3 py-2 text-xs font-medium text-primary transition hover:border-primary hover:bg-primary/[0.08]"
          >
            {t('sectorDefaultBtn', { amount: formatEur(sectorDefaultY5) })}
          </button>
          <span className="text-[11px] text-foreground/55">
            {t('sectorDefaultHint', { sector: tSectorLabels(sector) })}
          </span>
        </div>

        <CurrencyInput
          label={t('y5Label')}
          value={y5 ?? undefined}
          onChange={(value) => setField('year5_revenue_projection', value ?? null)}
          placeholder={y5Placeholder}
          size="sm"
          truncateLabel={false}
          description={t('y5Desc')}
        />
        {/* Provenance badge — tells the founder whether the field is
            still on the sector default or whether they've moved off
            it. Without this the silent prefill made it impossible to
            tell which numbers were defaults and which were typed. */}
        <div className="mt-2">
          <PrefillBadge
            variant={
              y5 == null || y5 === sectorDefaultY5 ? 'sector_default' : 'your_override'
            }
          />
        </div>

        {/* Y5 sanity guards — surface impossible-growth / below-current
            errors as soon as the founder enters a Y5 the engine can't
            defend. Catching these in the UI is far cheaper than the
            engine flagging "fragile headline" 6 sections later. */}
        {y5SanityState === 'impossible' && currentArrSignal != null && (
          <div className="mt-3 rounded-lg border border-rose-300/50 bg-rose-50/60 p-3 text-[11px] leading-relaxed text-rose-900 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold">
              {t('y5SanityImpossibleGrowthTitle', {
                ratio: y5SanityRatio < 1000 ? y5SanityRatio.toFixed(0) : '1000+',
              })}
            </p>
            <p className="mt-1">
              {t('y5SanityImpossibleGrowthBody', {
                currentArr: formatEur(currentArrSignal),
                y5: formatEur(previewY5),
                monthlyGrowth: y5SanityMonthlyGrowth.toFixed(0),
              })}
            </p>
          </div>
        )}
        {y5SanityState === 'below_current' && currentArrSignal != null && (
          <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">{t('y5SanityBelowCurrentTitle')}</p>
            <p className="mt-1">
              {t('y5SanityBelowCurrentBody', {
                currentArr: formatEur(currentArrSignal),
                y5: formatEur(previewY5),
              })}
            </p>
          </div>
        )}
        {/* Pre-revenue absolute ceiling — fires only when the founder
            has no MRR/ARR, so we never double-warn alongside the
            post-revenue guards above. */}
        {y5SanityState === 'pre_revenue_too_high' && (
          <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">
              {t('y5SanityPreRevenueTooHighTitle', {
                ratio: y5SanityRatio.toFixed(1),
              })}
            </p>
            <p className="mt-1">
              {t('y5SanityPreRevenueTooHighBody', {
                y5: formatEur(previewY5),
                sectorDefault: formatEur(sectorDefaultY5),
                sector: tSectorLabels(sector),
              })}
            </p>
          </div>
        )}
      </div>

      {/* Exit EV/Revenue multiple — the most-leveraged input on the
          report. Pre-filled from the sector benchmark (Athena Q1 2026)
          but fully editable with a "why this multiple?" rationale that
          lands verbatim on the investor PDF. Was previously a
          read-only footnote — see the inline comment removed in
          2026-05-10 for the rationale. */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('multipleOverrideTitle')}</h3>
        <p className="mb-4 text-sm text-foreground/60">{t('multipleOverrideLead')}</p>
        <ExitMultipleOverride
          stage={stage}
          country={country}
          sector={sector}
        />
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-1 text-lg font-semibold text-foreground">{t('investorAskTitle')}</h3>
        <p className="mb-4 text-sm text-foreground/60">{t('investorAskLead')}</p>

        {/* Stage-anchored ROI presets — typed entry is preserved (the
            input below stays editable for advisors fine-tuning a number)
            but the no-brainer path is one tap.  Defaults come from
            `regional_data.py` via `getRegionalBaseline`. */}
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground/55">
            {t('targetRoiPresetLabel')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ROI_PRESETS.map(({ stage: presetStage, value }) => {
              const isActive = targetRoi != null && Math.abs(targetRoi - value) < 0.01
              return (
                <button
                  key={presetStage}
                  type="button"
                  onClick={() => setField('target_roi_x', value)}
                  className={[
                    'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition tabular-nums',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-foreground/15 bg-background text-foreground/75 hover:border-primary/50 hover:text-primary',
                  ].join(' ')}
                >
                  {tStageLabels(presetStage)} · {value}×
                </button>
              )
            })}
          </div>
        </div>

        <XMultiplierInput
          label={t('targetRoiLabel')}
          value={targetRoi ?? undefined}
          onChange={(value) => setField('target_roi_x', value ?? null)}
          placeholder={String(stageDefaultRoi)}
          description={t('targetRoiDesc', {
            roi: String(stageDefaultRoi),
            stage: stageLabel,
          })}
        />
        {/* ROI provenance — same pattern as Y5. The stage-default ROI
            is the venture-fund hurdle that the engine assumes when
            the founder hasn't picked one (pre-seed ~30×, seed ~20×,
            Series A ~10×). */}
        <div className="mt-2">
          <PrefillBadge
            variant={
              targetRoi == null || Math.abs(targetRoi - stageDefaultRoi) < 0.01
                ? 'stage_default'
                : 'your_override'
            }
          />
        </div>

        {/* Inline derived-value feedback — small confirmation that
            the inputs above produce a sensible exit EV. Kept terse:
            this panel collects data; the report explains the method.
            The full Y5 × multiple ÷ ROI walkthrough lives on the
            method-breakdown page in the ValuationIQ report. */}
        {previewExit > 0 && (
          <div className="mt-4 rounded-xl bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-wide text-foreground/55">
              {t('impliedExit')}
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
              {formatEur(previewExit)}
            </p>
            <p className="mt-1 text-[11px] text-foreground/55">
              {formatEur(previewY5)} × {effectiveMultiple}×
            </p>
          </div>
        )}

        {/* The "Sector exit multiple: X× · range Y–Z" footnote that
            used to live here moved into the editable
            ExitMultipleOverride card above. Keeping it here would have
            shown the same number twice and confused QA. The offline-
            fallback signal still surfaces — fully localised via
            ``exitFooterOffline``, no hardcoded English fragments
            (audit issue #11). */}
        {isFallback && (
          <p className="mt-4 border-t border-foreground/10 pt-3 text-[11px] text-foreground/55">
            {t('exitFooterOffline', {
              mult: String(effectiveMultiple),
              low: String(benchmark.exit_multiple_low),
              high: String(benchmark.exit_multiple_high),
              sector: tSectorLabels(sector),
            })}
          </p>
        )}
      </div>

      {/* Inception lens — opt-in academic overlay (Hampus Jakobsson 2024
          + Atomico SoEU 2024) for the three traps milestone-track methods
          miss: moat-blindness, TAM tyranny, edge premium.  Default state
          is `milestones_driven` (no engine effect) so typical pre-seed
          founders see it, recognise the framework, and scroll past.
          Ambitious founders pick `momentum_driven` or `inception_bet`
          to lift the mid AND widen the variance band — honest variance
          accounting, not just upside.  Lives at the bottom of Exit Story
          because the lens is a thesis-level overlay on the EV/Revenue
          spine that this section drives. */}
      <InceptionLensPicker />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExitMultipleOverride — pre-filled from the sector benchmark, editable
// with a "why this multiple?" rationale that lands verbatim on the
// investor PDF. Out-of-band picks (P25–P75) trigger an inline warning so
// the founder knows investors will challenge the number.
// ---------------------------------------------------------------------------

interface ExitMultipleOverrideProps {
  stage: StartupStage
  country: string
  sector: import('@/store/manual/useStartupValuationStore').StartupSector
}

function ExitMultipleOverride({ stage, country, sector }: ExitMultipleOverrideProps) {
  const t = useTranslations('startupStudio.exitStory')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const rationale = useStartupValuationStore((s) => s.exit_revenue_multiple_rationale) ?? ''
  const setField = useStartupValuationStore((s) => s.setField)
  const { benchmark } = useStartupBenchmark(country, stage, sector)

  const benchmarkMid = Math.round(
    (benchmark.exit_multiple_low + benchmark.exit_multiple_high) / 2,
  )
  const sectorLabel = tSectorLabels(sector)

  // Prefill aggressively — first paint always shows the sector
  // benchmark. Without this the UI rendered a blank multiple and the
  // user had to hunt for "what should I put here?". Mirrors the
  // existing prefill on the parent for backwards compat.
  useEffect(() => {
    if (exitMultiple == null) {
      setField('exit_revenue_multiple', benchmarkMid)
    }
  }, [benchmarkMid, exitMultiple, setField])

  const applied = exitMultiple ?? benchmarkMid
  const isOverridden = Math.abs(applied - benchmarkMid) > 0.01
  const outOfBand =
    applied < benchmark.exit_multiple_low - 0.01 ||
    applied > benchmark.exit_multiple_high + 0.01

  return (
    <div className="space-y-4">
      {/* Multiple input — uses the explicit ``×``-suffixed control so the
          founder never wonders whether they're typing a percentage or a
          multiplier.  Was previously an AdaptivePercentInput (technically
          correct, no `%` glyph) but the sibling-of-percent rhythm
          signalled the wrong unit at a glance — same audit issue #10
          fix the ROI input shipped, applied here for consistency. */}
      <XMultiplierInput
        label={t('multipleLabel')}
        value={exitMultiple ?? undefined}
        onChange={(value) => setField('exit_revenue_multiple', value ?? null)}
        placeholder={String(benchmarkMid)}
        description={
          isOverridden
            ? t('multipleDescOverridden', {
                mid: String(benchmarkMid),
                applied: String(applied),
              })
            : t('multipleDescDefault', {
                sector: sectorLabel,
                mid: String(benchmarkMid),
                low: String(benchmark.exit_multiple_low),
                high: String(benchmark.exit_multiple_high),
              })
        }
      />

      {outOfBand && (
        <div className="rounded-md border border-amber-400/50 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
          {t('multipleOutOfBandWarn', {
            low: String(benchmark.exit_multiple_low),
            high: String(benchmark.exit_multiple_high),
          })}
        </div>
      )}

      {/* Rationale textarea is always rendered — the field that lands
          verbatim on the investor PDF deserves the prompt even when the
          founder accepts the sector default.  Previously gated on
          isOverridden, which meant most founders skipped it and the
          report carried no defensibility text under the multiple. */}
      <div>
        <label
          htmlFor="exit-multiple-rationale"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-foreground/55"
        >
          {isOverridden
            ? t('multipleRationaleLabel')
            : t('multipleRationaleOptionalLabel')}
        </label>
        <textarea
          id="exit-multiple-rationale"
          rows={2}
          value={rationale}
          onChange={(e) => setField('exit_revenue_multiple_rationale', e.target.value)}
          placeholder={t('multipleRationalePlaceholder')}
          maxLength={280}
          className="block w-full resize-none rounded-md border border-foreground/15 bg-background/80 px-3 py-2 text-sm leading-relaxed placeholder:text-foreground/40 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p className="mt-1 text-[11px] text-foreground/55">
          {t('multipleRationaleHint')}
        </p>
      </div>

      {isOverridden && (
        <button
          type="button"
          onClick={() => {
            setField('exit_revenue_multiple', benchmarkMid)
            setField('exit_revenue_multiple_rationale', null)
          }}
          className="rounded-md border border-foreground/15 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground/75 transition hover:border-primary/50 hover:text-primary"
        >
          {t('multipleResetBtn', { mid: String(benchmarkMid) })}
        </button>
      )}
    </div>
  )
}

// ``XMultiplierInput`` was previously defined inline here; it has moved
// to its own file (``./XMultiplierInput.tsx``) so it can be tested in
// isolation and reused for any other multiplier-shaped input. The import
// at the top of this file picks it up.

