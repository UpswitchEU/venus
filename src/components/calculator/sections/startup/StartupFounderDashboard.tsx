'use client'

/**
 * StartupFounderDashboard
 *
 * React-native founder output dashboard — the live counterpart to the
 * static "Fundraising One-Pager" PDF rendered by ValuationIQ.  Surfaces
 * the 3-leg founder triangulation (Berkus + SaaS Forward + VC method)
 * the moment Calculate completes, and lets the founder slide their
 * round size to re-simulate dilution against the *blended* pre-money
 * without re-running the engine.
 *
 * Sections (top → bottom, designed to read like a one-pager):
 *
 *   1. Hero          — blended pre-money (founder_view) + low/high range
 *   2. Football field — three legs on a shared axis (SVG bar chart)
 *   3. Cap-table     — interactive simulator: round size slider →
 *                       post-money + founder dilution, recomputed locally
 *   4. Defensibility — top defensibility rows from the engine details
 *   5. Invite CTA    — viral hook to the accountant certification flow
 *
 * KISS: no Recharts dependency — a single hand-crafted SVG mirrors the
 * report's football-field layout and stays tree-shake-friendly.
 *
 * The component is *display-only*: it does not hit the network and
 * does not write to Zustand.  Re-renders on every results change are
 * cheap (no animations beyond Framer's already-imported motion).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import type { ValuationMethodResult } from '@/types/valuation'
import {
  trackFounderStartupInvite,
  trackFounderStartupWizardComplete,
} from '@/lib/analytics'

// ---------------------------------------------------------------------------
// Type adapters — engine emits Decimals as numbers (or strings on the
// JSON edge); we normalise to ``number | null`` once and forget about it.
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

interface FounderViewBlock {
  equity_value_mid: number
  equity_value_low: number
  equity_value_high: number
  weights: Record<string, number>
  contributors: string[]
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

interface DefensibilityRow {
  label: string
  value: string
}

interface ParsedDetails {
  founder: FounderViewBlock | null
  /** Per-leg pre-money values used to draw the football-field bars. */
  legs: { key: string; label: string; preMoney: number | null }[]
  blendedMid: number | null
  blendedLow: number | null
  blendedHigh: number | null
  capTable: CapTableSimulatorBlock | null
  defensibility: DefensibilityRow[]
  narrative: string | null
  stage: string | null
  /** Default option pool % used by the simulator slider. */
  optionPoolPct: number
  /** Sum of outstanding SAFE principal — drives the SAFE drag on the slider. */
  safeTotal: number
}

function parseDetails(result: ValuationMethodResult | undefined | null): ParsedDetails {
  const empty: ParsedDetails = {
    founder: null,
    legs: [],
    blendedMid: null,
    blendedLow: null,
    blendedHigh: null,
    capTable: null,
    defensibility: [],
    narrative: null,
    stage: null,
    optionPoolPct: 0,
    safeTotal: 0,
  }
  const details = (result?.details ?? null) as Record<string, unknown> | null
  if (!details) return empty

  const fvRaw = details.founder_view as Record<string, unknown> | undefined
  const founder: FounderViewBlock | null = fvRaw
    ? {
        equity_value_mid: toNumber(fvRaw.equity_value_mid) ?? 0,
        equity_value_low: toNumber(fvRaw.equity_value_low) ?? 0,
        equity_value_high: toNumber(fvRaw.equity_value_high) ?? 0,
        weights: Object.fromEntries(
          Object.entries((fvRaw.weights as Record<string, unknown>) ?? {}).map(([k, v]) => [
            k,
            toNumber(v) ?? 0,
          ])
        ),
        contributors: Array.isArray(fvRaw.contributors)
          ? (fvRaw.contributors as string[])
          : [],
      }
    : null

  // Headline anchor — prefer the founder triangulation, fall back to the
  // engine's advisor blend so older payloads (no founder_view) still
  // render a sensible dashboard.
  const blendedMid =
    founder?.equity_value_mid ?? toNumber(result?.value) ?? null
  const blendedLow = founder?.equity_value_low ?? toNumber(details.equity_value_low)
  const blendedHigh = founder?.equity_value_high ?? toNumber(details.equity_value_high)

  const berkus = details.berkus as Record<string, unknown> | undefined
  const vc = details.vc as Record<string, unknown> | undefined
  const saas = details.saas_forward as Record<string, unknown> | undefined

  // Translation labels are resolved at render time; we only carry stable
  // i18n keys here so the parser stays pure.
  const legs = [
    { key: 'berkus', label: 'legBerkus', preMoney: toNumber(berkus?.pre_money) },
    { key: 'saas_forward', label: 'legSaasForward', preMoney: toNumber(saas?.pre_money) },
    { key: 'vc', label: 'legVc', preMoney: toNumber(vc?.pre_money) },
  ]

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

  const defensibilityRaw = details.defensibility
  const defensibility: DefensibilityRow[] = Array.isArray(defensibilityRaw)
    ? defensibilityRaw
        .map((row) => row as Record<string, unknown>)
        .filter((r) => typeof r?.label === 'string' && typeof r?.value === 'string')
        .map((r) => ({ label: String(r.label), value: String(r.value) }))
    : []

  return {
    founder,
    legs,
    blendedMid,
    blendedLow,
    blendedHigh,
    capTable,
    defensibility,
    narrative: typeof details.narrative === 'string' ? (details.narrative as string) : null,
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
// SVG Football Field — three horizontal bars on a shared axis with the
// blended mid drawn as a vertical dashed reference line.  No external
// chart library needed: the entire chart is ~80 lines of declarative
// JSX, the same shape the report HTML uses.
// ---------------------------------------------------------------------------

interface FootballFieldProps {
  legs: { key: string; label: string; preMoney: number | null }[]
  blendedMid: number
  blendedLow: number | null
  blendedHigh: number | null
  /** Locale-aware euro formatter, passed in from the parent so we don't
   * re-instantiate Intl.NumberFormat per render. */
  formatEUR: (n: number) => string
}

function FootballField({
  legs,
  blendedMid,
  blendedLow,
  blendedHigh,
  formatEUR,
}: FootballFieldProps) {
  const values = legs.map((l) => l.preMoney ?? 0).concat([blendedHigh ?? 0])
  const axisMax = Math.max(...values, blendedMid)
  if (axisMax <= 0) return null

  // Layout in viewBox px units.  Tall enough to give each bar room +
  // an axis baseline + a blended-mid chip at the bottom.
  const width = 720
  const padL = 130
  const padR = 24
  const padT = 16
  const barH = 22
  const rowGap = 18
  const trackW = width - padL - padR
  const height = padT + legs.length * (barH + rowGap) + 36

  const xFor = (v: number) => padL + (Math.max(v, 0) / axisMax) * trackW

  const lowX = blendedLow != null && blendedLow > 0 ? xFor(blendedLow) : null
  const highX = blendedHigh != null && blendedHigh > 0 ? xFor(blendedHigh) : null
  const blendX = xFor(blendedMid)
  const lastBarBottom = padT + legs.length * (barH + rowGap)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Football field"
      className="block w-full text-foreground"
    >
      {lowX != null && highX != null && highX > lowX && (
        <rect
          x={lowX}
          y={padT - 4}
          width={highX - lowX}
          height={lastBarBottom - padT + 8}
          fill="currentColor"
          opacity="0.06"
        />
      )}

      {legs.map((leg, idx) => {
        const y = padT + idx * (barH + rowGap)
        const v = leg.preMoney ?? 0
        const valueX = v > 0 ? xFor(v) : padL
        return (
          <g key={leg.key}>
            <text
              x={padL - 10}
              y={y + barH * 0.7}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
            >
              {leg.label}
            </text>
            <rect
              x={padL}
              y={y}
              rx={4}
              ry={4}
              width={trackW}
              height={barH}
              fill="currentColor"
              opacity={0.08}
            />
            {v > 0 ? (
              <>
                <rect
                  x={padL}
                  y={y}
                  rx={4}
                  ry={4}
                  width={Math.max(0, valueX - padL)}
                  height={barH}
                  className="fill-primary"
                  opacity={1 - idx * 0.18}
                />
                <text
                  x={valueX + 6}
                  y={y + barH * 0.7}
                  fontSize="10"
                  fill="currentColor"
                  className="font-mono"
                >
                  {formatEUR(v)}
                </text>
              </>
            ) : (
              <text
                x={padL + 6}
                y={y + barH * 0.7}
                fontSize="10"
                fill="currentColor"
                opacity={0.5}
                className="font-mono"
              >
                — n/a
              </text>
            )}
          </g>
        )
      })}

      <line
        x1={blendX}
        y1={padT - 6}
        x2={blendX}
        y2={lastBarBottom + 6}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="4 3"
        opacity="0.65"
      />
      <g transform={`translate(${blendX - 60}, ${height - 12})`}>
        <rect
          x={0}
          y={-12}
          rx={3}
          ry={3}
          width={120}
          height={14}
          fill="currentColor"
          opacity="0.85"
        />
        <text
          x={60}
          y={-2}
          textAnchor="middle"
          fontSize="9"
          fill="white"
          className="font-mono"
        >
          {`Blend ${formatEUR(blendedMid)}`}
        </text>
      </g>

      <line
        x1={padL}
        y1={lastBarBottom + 16}
        x2={width - padR}
        y2={lastBarBottom + 16}
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.4"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface StartupFounderDashboardProps {
  /** ``valuation_results.startup_valuation`` from the engine response. */
  result: ValuationMethodResult | null | undefined
  /** Where the viral CTA should deep-link to (Mercury client dashboard
   * with `action=invite_accountant` is the canonical target). */
  inviteAccountantUrl?: string
  /** Optional className for the outer wrapper. */
  className?: string
}

export function StartupFounderDashboard({
  result,
  inviteAccountantUrl,
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
    // Engine returned no startup leg yet — hide the dashboard rather
    // than render an empty hero (the parent already handles the
    // "no results yet" placeholder).
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

  const cta = inviteAccountantUrl ?? '/client/dashboard?action=invite_accountant'

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={['aurora-theme space-y-4 p-4', className].filter(Boolean).join(' ')}
      aria-label={t('sectionLabel')}
    >
      {/* Hero — blended pre-money + range + narrative */}
      <header className="rounded-xl border border-foreground/[0.08] bg-background/40 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('heroLabel')}
        </p>
        <p className="mt-1 text-4xl font-semibold leading-none text-primary">
          {formatEUR(parsed.blendedMid)}
        </p>
        {parsed.blendedLow != null && parsed.blendedHigh != null && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('heroRange', {
              low: formatEUR(parsed.blendedLow),
              high: formatEUR(parsed.blendedHigh),
            })}
          </p>
        )}
        {parsed.narrative && (
          <p className="mt-3 max-w-prose text-xs leading-relaxed text-foreground/80">
            {parsed.narrative}
          </p>
        )}
      </header>

      {/* Football field */}
      {parsed.legs.some((l) => (l.preMoney ?? 0) > 0) && (
        <section className="rounded-xl border border-foreground/[0.06] bg-background/40 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              {t('footballFieldTitle')}
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {t('footballFieldHint')}
            </span>
          </div>
          <FootballField
            legs={parsed.legs.map((l) => ({ ...l, label: t(l.label) }))}
            blendedMid={parsed.blendedMid}
            blendedLow={parsed.blendedLow}
            blendedHigh={parsed.blendedHigh}
            formatEUR={formatEUR}
          />
        </section>
      )}

      {/* Cap-table simulator (interactive slider) */}
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

      {/* Defensibility */}
      {parsed.defensibility.length > 0 && (
        <section className="rounded-xl border border-foreground/[0.06] bg-background/40 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/80">
            {t('defensibilityTitle')}
          </h3>
          <table className="w-full text-xs">
            <tbody>
              {parsed.defensibility.slice(0, 6).map((row) => (
                <tr
                  key={`${row.label}-${row.value}`}
                  className="border-b border-foreground/[0.05] last:border-b-0"
                >
                  <td className="py-1 text-foreground/85">{row.label}</td>
                  <td className="py-1 text-right font-mono">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Viral CTA — Invite my Accountant */}
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/[0.06] p-4">
        <div className="min-w-[18rem] flex-1 space-y-1">
          <p className="text-sm font-semibold">{t('inviteTitle')}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('inviteDescription')}
          </p>
        </div>
        <a
          href={cta}
          onClick={() => trackFounderStartupInvite('cta')}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t('inviteCta')}
        </a>
      </section>
    </motion.section>
  )
}

export default StartupFounderDashboard
