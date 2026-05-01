'use client'

/**
 * StartupFounderDashboard — method-agnostic live cap-table simulator
 * rendered above the ValuationIQ HTML/PDF report.
 *
 * Originally scoped to the ``startup_valuation`` method, the component
 * now mounts for any method whose response carries a
 * ``details.cap_table_simulator`` payload — including the SaaS / ARR
 * multiple method when the founder filled in capital history via the
 * ``CapitalHistorySection``.  ``ManualLayout`` decides whether to mount
 * by looking at the selected method's ``details`` block; the component
 * itself is fully decoupled from the method that produced its data.
 *
 * The cap-table slider is kept here (rather than in the static PDF)
 * because it is the one piece of content a printed report can't
 * deliver: drag the round size, watch the post-money + founder
 * dilution recompute against the engine's pre-money anchor (post-debt
 * equity for SaaS, leg-blend pre-money for startup) without re-running
 * the calculation.
 *
 * The component is *display-only*: no network, no Zustand writes.
 *
 * Filename kept for now (rename to ``CapTableSimulatorPanel`` deferred
 * to a follow-up cleanup task — out of scope for the Wintercircus
 * cap-table rollout).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import type { ValuationMethodResult } from '@/types/valuation'
import { trackFounderStartupWizardComplete } from '@/lib/analytics'

// ---------------------------------------------------------------------------
// Type adapters — engine emits Decimals as numbers (or strings on the
// JSON edge); we normalise to ``number | null`` once and forget about it.
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

interface CapTableSimulatorBlock {
  investment_amount: number
  pre_money: number
  post_money: number
  dilution_pct: number
  investor_dilution_pct?: number
  option_pool_pct?: number
  safe_dilution_pct?: number
  founder_dilution_pct?: number
  safe_total?: number
  source: string
}

interface ParsedDetails {
  blendedMid: number | null
  capTable: CapTableSimulatorBlock | null
  stage: string | null
  /** Default option pool % used by the simulator slider. */
  optionPoolPct: number
  /** Sum of outstanding SAFE principal — drives the SAFE drag on the slider. */
  safeTotal: number
}

function parseDetails(result: ValuationMethodResult | undefined | null): ParsedDetails {
  const empty: ParsedDetails = {
    blendedMid: null,
    capTable: null,
    stage: null,
    optionPoolPct: 0,
    safeTotal: 0,
  }
  const details = (result?.details ?? null) as Record<string, unknown> | null
  if (!details) return empty

  // Headline anchor — read the canonical block (single source of truth
  // across the advisor 4-leg + founder 3-leg blends).  Fall back to
  // MethodResult.value (which IS the canonical mid for new responses)
  // and finally the legacy founder_view for older engine responses.
  const canonical = details.canonical as Record<string, unknown> | undefined
  const fvRaw = details.founder_view as Record<string, unknown> | undefined
  const blendedMid =
    toNumber(canonical?.pre_money_mid) ??
    toNumber(result?.value) ??
    toNumber(fvRaw?.equity_value_mid)

  const capRaw = details.cap_table_simulator as Record<string, unknown> | null | undefined
  const capTable: CapTableSimulatorBlock | null = capRaw
    ? {
        investment_amount: toNumber(capRaw.investment_amount) ?? 0,
        pre_money: toNumber(capRaw.pre_money) ?? 0,
        post_money: toNumber(capRaw.post_money) ?? 0,
        dilution_pct: toNumber(capRaw.dilution_pct) ?? 0,
        investor_dilution_pct: toNumber(capRaw.investor_dilution_pct) ?? undefined,
        option_pool_pct: toNumber(capRaw.option_pool_pct) ?? undefined,
        safe_dilution_pct: toNumber(capRaw.safe_dilution_pct) ?? undefined,
        founder_dilution_pct: toNumber(capRaw.founder_dilution_pct) ?? undefined,
        safe_total: toNumber(capRaw.safe_total) ?? undefined,
        source: typeof capRaw.source === 'string' ? capRaw.source : 'investor_ask',
      }
    : null

  return {
    blendedMid,
    capTable,
    stage: typeof details.stage === 'string' ? (details.stage as string) : null,
    optionPoolPct: capTable?.option_pool_pct ?? 0,
    safeTotal: capTable?.safe_total ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Cap-table simulator — pure function used by the slider preview.
// Mirrors the Python implementation in cap_table.py one-for-one so the
// React preview and the report always show the same number for the same
// inputs.
// ---------------------------------------------------------------------------

interface SimResult {
  postMoney: number
  investorDilutionPct: number
  optionPoolPct: number
  safeDilutionPct: number
  founderDilutionPct: number
}

function simulate(
  preMoney: number,
  investmentAmount: number,
  optionPoolPct: number,
  safeTotal: number
): SimResult | null {
  if (preMoney <= 0 || investmentAmount <= 0) return null
  const postMoney = preMoney + investmentAmount
  if (postMoney <= 0) return null
  const investorDilutionPct = Math.min(100, Math.max(0, (investmentAmount / postMoney) * 100))
  const safeDilutionPct =
    safeTotal > 0 ? Math.min(100, Math.max(0, (safeTotal / postMoney) * 100)) : 0
  const opt = Math.min(100, Math.max(0, optionPoolPct))
  const founderDilutionPct = Math.min(
    100,
    Math.max(0, investorDilutionPct + safeDilutionPct + opt)
  )
  return {
    postMoney,
    investorDilutionPct,
    optionPoolPct: opt,
    safeDilutionPct,
    founderDilutionPct,
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface StartupFounderDashboardProps {
  /** ``valuation_results.startup_valuation`` from the engine response. */
  result: ValuationMethodResult | null | undefined
  /** Reserved for backwards-compatibility — the invite CTA now lives in
   *  the canonical Jinja report (`_startup_advisor_cta.html`). */
  inviteAccountantUrl?: string
  /** Optional className for the outer wrapper. */
  className?: string
}

export function StartupFounderDashboard({
  result,
  className,
}: StartupFounderDashboardProps) {
  const t = useTranslations('startupFounderDashboard')
  const locale = useLocale()
  const parsed = useMemo(() => parseDetails(result), [result])

  const formatEUR = useMemo(() => {
    const fmt = new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    })
    return (n: number) => fmt.format(n)
  }, [locale])

  // Local slider state for the live cap-table re-simulation.  Seeded
  // from the engine's investor_ask so the founder lands on the same
  // number they entered into the wizard, then can drag it.
  const seedRound = parsed.capTable?.investment_amount ?? 0
  const [roundSize, setRoundSize] = useState<number>(seedRound)
  // Re-seed whenever a fresh result lands — without this the slider
  // would stay frozen on a stale round size after the founder
  // re-Calculates with a different ask.
  useEffect(() => {
    setRoundSize(seedRound)
  }, [seedRound])

  // Funnel: emit `wizard_complete` once per result.  Re-fires when the
  // founder re-calculates so PostHog can de-dupe by report_id but still
  // count repeat runs for retention analysis.
  const completionFingerprintRef = useRef<string | null>(null)
  useEffect(() => {
    const reportId =
      (result as { report_id?: string } | null | undefined)?.report_id ?? null
    if (!parsed.blendedMid || parsed.blendedMid <= 0) return
    const fp = `${reportId ?? 'unknown'}:${parsed.blendedMid}`
    if (completionFingerprintRef.current === fp) return
    completionFingerprintRef.current = fp
    trackFounderStartupWizardComplete(
      reportId ?? 'unknown',
      (parsed.stage as 'pre_seed' | 'seed' | 'series_a' | undefined) ?? undefined,
    )
  }, [result, parsed.blendedMid, parsed.stage])

  if (!parsed.blendedMid || parsed.blendedMid <= 0) {
    // Engine returned no startup leg yet — render nothing.  The PDF
    // report below us already handles the "no results" empty state.
    return null
  }

  const liveSim = simulate(
    parsed.blendedMid,
    roundSize,
    parsed.optionPoolPct,
    parsed.safeTotal
  )

  // Cap the slider at 1.5× the engine's pre-money so a founder can
  // explore "what if we raised more?" without the chart blowing up.
  const sliderMax = Math.max(seedRound * 2, parsed.blendedMid * 1.5, 50_000)

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={['aurora-theme p-4', className].filter(Boolean).join(' ')}
      aria-label={t('capTableTitle')}
    >
      <section className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('capTableTitle')}
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {parsed.capTable?.source === 'last_round_proxy'
              ? t('capTableSourceProxy')
              : t('capTableSourceAsk')}
          </span>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="flex items-baseline justify-between text-xs">
              <span>{t('roundSizeLabel')}</span>
              <span className="font-mono font-semibold text-primary">
                {formatEUR(roundSize)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={Math.max(5_000, Math.round(sliderMax / 200))}
              value={roundSize}
              onChange={(e) => setRoundSize(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
              aria-label={t('roundSizeLabel')}
            />
          </label>
          {liveSim ? (
            <div className="rounded-lg border border-foreground/[0.06] bg-background/60 p-3">
              <p className="text-xs leading-relaxed">
                {t.rich('capTableSummary', {
                  amount: formatEUR(roundSize),
                  preMoney: formatEUR(parsed.blendedMid),
                  dilution: liveSim.founderDilutionPct.toFixed(1),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <table className="mt-3 w-full text-xs">
                <tbody>
                  <tr>
                    <td className="py-0.5">{t('preMoney')}</td>
                    <td className="py-0.5 text-right font-mono">
                      {formatEUR(parsed.blendedMid)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5">+ {t('roundLabel')}</td>
                    <td className="py-0.5 text-right font-mono">{formatEUR(roundSize)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-0.5">= {t('postMoney')}</td>
                    <td className="py-0.5 text-right font-mono">
                      {formatEUR(liveSim.postMoney)}
                    </td>
                  </tr>
                  {liveSim.optionPoolPct > 0 && (
                    <tr>
                      <td className="py-0.5">{t('optionPoolPct')}</td>
                      <td className="py-0.5 text-right font-mono">
                        {liveSim.optionPoolPct.toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {liveSim.safeDilutionPct > 0 && (
                    <tr>
                      <td className="py-0.5">{t('safeDrag')}</td>
                      <td className="py-0.5 text-right font-mono">
                        {liveSim.safeDilutionPct.toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  <tr className="font-semibold text-primary">
                    <td className="py-0.5">{t('founderDilution')}</td>
                    <td className="py-0.5 text-right font-mono">
                      {liveSim.founderDilutionPct.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('capTableEmpty')}</p>
          )}
        </div>
      </section>
    </motion.section>
  )
}

export default StartupFounderDashboard
