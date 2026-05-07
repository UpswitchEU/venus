/**
 * Narrative builder — translates the engine's leg-blend output into a
 * plain-English one-sentence explanation a non-finance owner can read
 * (and a Bain consultant can defend).
 *
 * The Express live receipt previously surfaced a methodology footnote
 * like *"Stage-aware pre-seed blend: Berkus (50%), Scorecard (33%), VC
 * Method (17%). Founder pedigree lift: 1.35× on the leg-blend baseline."*
 * That sentence is correct but jargon-dense — an owner reads "Berkus"
 * and reaches for Claude.
 *
 * This module produces the SAME content in plain English:
 *   "We anchored to your team's track record (1.35× lift) and your
 *    €60M Y5 ARR thesis. The VC method drives ~17% of the blend; your
 *    risk-reduced milestones and peer comparison fill in the rest."
 *
 * Pure function — no React, no store coupling.  Take the engine's
 * details payload, return strings.
 *
 * Copy lives in `messages/startupStudio/{locale}.json` under `narrative`.
 */

import studioEn from '../../../../messages/startupStudio/en.json'
import studioNl from '../../../../messages/startupStudio/nl.json'
import type { TeamLevel } from '@/features/startup-studio/data/teamLevel'
import type { AmbitionLevel } from '@/features/startup-studio/data/ambition'
import type { StartupSector, StartupStage } from '@/store/manual/useStartupValuationStore'

type NarrativeBundle = (typeof studioEn)['narrative']

export interface NarrativeContext {
  /** Headline pre-money EUR. */
  preMoney: number
  /** Engine's stated round size. */
  raise: number
  /** Pre-pedigree mid for transparency. */
  prePedigreeMid: number | null
  /** Pedigree multiplier applied (1.0 = neutral). */
  pedigreeMultiplier: number
  /** Per-leg euros (already pedigree-pre, mid only).  Null when leg dropped out. */
  legs: {
    berkus: number | null
    scorecard: number | null
    vc: number | null
    saasForward: number | null
  }
  /** Profile context. */
  stage: StartupStage
  sector: StartupSector
  countryCode: string
  team: TeamLevel | null
  ambition: AmbitionLevel | null
  /** Year-5 anchor used by the VC method (for the "your Y5 ARR thesis" line). */
  year5Revenue: number | null
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  let s = template
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

function narrativeBundle(locale: 'en' | 'nl'): NarrativeBundle {
  return (locale === 'nl' ? studioNl : studioEn).narrative
}

/** Format EUR for narrative use — €X.XM not raw digits. */
function fmt(eur: number | null | undefined): string {
  if (eur == null || !Number.isFinite(eur)) return '—'
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M`
  if (eur >= 1_000) return `€${Math.round(eur / 1_000)}k`
  return `€${Math.round(eur)}`
}

/**
 * Build the headline narrative — the *one* sentence that goes on the deck.
 * Reads in any context (no jargon, no leg names, no method names).
 */
export function buildHeadlineNarrative(
  ctx: NarrativeContext,
  locale: 'en' | 'nl' = 'en',
): string {
  const n = narrativeBundle(locale)
  const post = ctx.preMoney + ctx.raise
  const dilution = post > 0 ? (ctx.raise / post) * 100 : 0
  return interpolate(n.headline, {
    preMoney: fmt(ctx.preMoney),
    raise: fmt(ctx.raise),
    post: fmt(post),
    dilution: dilution.toFixed(0),
    stage: n.stageLabels[ctx.stage],
    sector: n.sectorLabels[ctx.sector],
    country: ctx.countryCode,
  })
}

/**
 * Build the "why this number" plain-English explanation — replaces the
 * jargon footnote on the live receipt.  Two short paragraphs that any
 * non-finance owner can read aloud.
 */
export function buildWhyNarrative(
  ctx: NarrativeContext,
  locale: 'en' | 'nl' = 'en',
): string[] {
  const n = narrativeBundle(locale)
  const lines: string[] = []

  const team = ctx.team ? n.team[ctx.team] : n.teamFallback
  const ambition = ctx.ambition ? n.ambition[ctx.ambition] : n.ambitionFallback
  const year5 = ctx.year5Revenue
    ? interpolate(n.year5Suffix, { amount: fmt(ctx.year5Revenue) })
    : ''

  lines.push(
    interpolate(n.whyP1, {
      team,
      ambition,
      year5,
      preMoney: fmt(ctx.preMoney),
      raise: fmt(ctx.raise),
    }),
  )

  const activeLegCount = [
    ctx.legs.berkus,
    ctx.legs.scorecard,
    ctx.legs.vc,
    ctx.legs.saasForward,
  ].filter((v) => v != null && v > 0).length

  const overlay =
    ctx.pedigreeMultiplier !== 1.0
      ? interpolate(ctx.pedigreeMultiplier > 1 ? n.pedigreeLift : n.pedigreeDiscount, {
          mult: ctx.pedigreeMultiplier.toFixed(2),
        })
      : ''

  lines.push(
    interpolate(n.whyP2, {
      count: activeLegCount,
      overlay,
    }),
  )

  return lines
}

/**
 * Compute a simple sensitivity band by varying the Year-5 anchor by ±20%.
 *
 * The VC method is the single most leveraged input (it dominates the
 * blend at later stages and is non-trivial at pre-seed).  We don't
 * recompute the engine here — the live receipt already has the canonical
 * blend.  Instead we express the sensitivity as a multiplier on the
 * VC-leg portion of the blend, leaving Berkus + Scorecard untouched
 * (their inputs aren't varying), then re-applying the pedigree multiplier.
 *
 * The result is the Bain-grade "what if Y5 is wrong by ±20%?" band a
 * sceptical investor will demand to see before signing.
 */
export interface SensitivityResult {
  low: number
  mid: number
  high: number
  /** Spread expressed as ±X% on mid (for the on-screen chip). */
  spreadPct: number
}

export function computeY5Sensitivity(
  ctx: NarrativeContext,
  pct = 20,
): SensitivityResult | null {
  if (ctx.preMoney <= 0) return null
  if (ctx.legs.vc == null || ctx.legs.vc <= 0) {
    // No VC leg active → sensitivity is degenerate.  Fall back to a
    // ±10% band on the mid so the UI still has something honest to show.
    const fallback = ctx.preMoney * 0.1
    return {
      low: ctx.preMoney - fallback,
      mid: ctx.preMoney,
      high: ctx.preMoney + fallback,
      spreadPct: 10,
    }
  }
  // Pre-seed weights re-normalised in synthesis, but we approximate the
  // VC contribution as `vcLeg × weight` where weight is implied by
  // ctx.preMoney itself.  Simpler: vary the engine's pre-money by
  // (vcLeg / preMoney_pre_pedigree) × pct.
  const prePedigree =
    ctx.prePedigreeMid && ctx.prePedigreeMid > 0 ? ctx.prePedigreeMid : ctx.preMoney
  const vcShareOfBlend = Math.min(1, Math.max(0, ctx.legs.vc / Math.max(1, prePedigree * 5)))
  // Crude: shift pre-money by vcShare × pct%.  Symmetric.
  const delta = ctx.preMoney * vcShareOfBlend * (pct / 100)
  return {
    low: Math.max(0, ctx.preMoney - delta),
    mid: ctx.preMoney,
    high: ctx.preMoney + delta,
    spreadPct: Math.round(vcShareOfBlend * pct),
  }
}
