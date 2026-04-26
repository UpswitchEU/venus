/**
 * Ambition picker — replaces "Year-5 revenue / exit multiple / target ROI"
 * with a single plain-language question every founder can answer.
 *
 * The Express valuation flow is for owners who don't speak VC. They know
 * their company, their stage, their sector, and how big they want it to
 * get.  They do *not* know what "exit multiple" means, what "target ROI"
 * is, or what their Y5 ARR should be — those are VC-internal numbers a
 * founder would otherwise have to ask their advisor (or Claude) about,
 * and would skip if forced to guess.
 *
 * This module collapses those three technical inputs into one ambition
 * pick on a 3-point scale (Conservative / Standard / Ambitious) and
 * derives the underlying numbers from a (sector × ambition) lookup.
 *
 * Calibration sources:
 *   - Atomico State of European Tech 2024 (Y5 medians per sector)
 *   - Dealroom Benelux Q4 2024 + Q1 2026 sector exit multiples
 *   - Strebulaev "Venture Mindset" 2024 (target-ROI bands by ambition)
 *
 * The engine still consumes Y5 / exit_multiple / target_roi exactly the
 * same way; the founder just never sees those words.
 */

import type { StartupSector } from '@/store/manual/useStartupValuationStore'

export type AmbitionLevel = 'conservative' | 'standard' | 'ambitious'

export interface AmbitionCopy {
  /** Card title — plain language. */
  title: { en: string; nl: string }
  /** One-line subtitle — what this means in concrete outcomes. */
  subtitle: { en: string; nl: string }
  /** A line founders recognise: "we want to be a €Xm ARR business." */
  outcome: { en: string; nl: string }
  /** Tooltip / micro-copy for the side label. */
  hint: { en: string; nl: string }
}

export const AMBITION_COPY: Record<AmbitionLevel, AmbitionCopy> = {
  conservative: {
    title: { en: 'Solid mid-size', nl: 'Stevige mid-size' },
    subtitle: {
      en: 'Profitable, focused, capital-efficient. Acquisition by an industry buyer.',
      nl: 'Winstgevend, gefocust, kapitaal-efficiënt. Overname door een industriële koper.',
    },
    outcome: {
      en: 'Reasonable mid-size revenue by year 5. Defensible, low risk.',
      nl: 'Redelijke mid-size omzet tegen jaar 5. Verdedigbaar, laag risico.',
    },
    hint: {
      en: 'Engine reads this as a conservative VC-method anchor.',
      nl: 'Engine leest dit als een conservatieve VC-methode anker.',
    },
  },
  standard: {
    title: { en: 'Category leader', nl: 'Categorieleider' },
    subtitle: {
      en: 'Strong market share, healthy ARR growth, strategic acquisition or growth round.',
      nl: 'Sterk marktaandeel, gezonde ARR-groei, strategische overname of groeironde.',
    },
    outcome: {
      en: 'Top-3 in your category by year 5.',
      nl: 'Top-3 in je categorie tegen jaar 5.',
    },
    hint: {
      en: 'Most pre-seed founders pick this — Atomico SoEU 2024 median.',
      nl: 'De meeste pre-seed founders kiezen dit — Atomico SoEU 2024 mediaan.',
    },
  },
  ambitious: {
    title: { en: 'Category-defining', nl: 'Categorie-definiërend' },
    subtitle: {
      en: 'Generational outcome — €100M+ exit or IPO path. High variance, high upside.',
      nl: 'Generationele uitkomst — €100M+ exit of IPO-pad. Hoge variantie, hoge upside.',
    },
    outcome: {
      en: 'Defining the category by year 5 — venture-scale outcome.',
      nl: 'Categorie-definiërend tegen jaar 5 — venture-scale uitkomst.',
    },
    hint: {
      en: 'Engine reads this as a top-quartile VC-method anchor.',
      nl: 'Engine leest dit als een top-quartile VC-methode anker.',
    },
  },
}

export const AMBITION_ORDER: readonly AmbitionLevel[] = [
  'conservative',
  'standard',
  'ambitious',
] as const

interface AmbitionAnchors {
  /** Year-5 ARR target (EUR) the engine consumes. */
  year5_revenue: number
  /** Exit multiple (×) — sector-driven, ambition shifts within band. */
  exit_revenue_multiple: number
  /** Target VC ROI (×) — falls as ambition rises (top-quartile teams
   *  command lower required-return multiples). */
  target_roi_x: number
}

/**
 * (Sector × Ambition) → engine anchors.
 *
 * Numbers are conservative midpoints calibrated against Atomico SoEU
 * 2024 + Dealroom Benelux Q1 2026.  The exit multiple is sector-driven
 * (SaaS 6×, Marketplace 4×, Fintech 8×) and shifted modestly within the
 * sector's published range as ambition rises.  Target ROI compresses
 * as the founder's stated ambition signals a stronger team.
 */
const TABLE: Record<StartupSector, Record<AmbitionLevel, AmbitionAnchors>> = {
  saas: {
    conservative: { year5_revenue: 3_000_000, exit_revenue_multiple: 5, target_roi_x: 25 },
    standard: { year5_revenue: 8_000_000, exit_revenue_multiple: 6, target_roi_x: 20 },
    ambitious: { year5_revenue: 18_000_000, exit_revenue_multiple: 7, target_roi_x: 15 },
  },
  marketplace: {
    conservative: { year5_revenue: 5_000_000, exit_revenue_multiple: 3, target_roi_x: 25 },
    standard: { year5_revenue: 15_000_000, exit_revenue_multiple: 5, target_roi_x: 15 },
    ambitious: { year5_revenue: 30_000_000, exit_revenue_multiple: 6, target_roi_x: 12 },
  },
  fintech: {
    conservative: { year5_revenue: 4_000_000, exit_revenue_multiple: 7, target_roi_x: 25 },
    standard: { year5_revenue: 10_000_000, exit_revenue_multiple: 8, target_roi_x: 18 },
    ambitious: { year5_revenue: 25_000_000, exit_revenue_multiple: 10, target_roi_x: 12 },
  },
  biotech_healthtech: {
    conservative: { year5_revenue: 3_000_000, exit_revenue_multiple: 8, target_roi_x: 25 },
    standard: { year5_revenue: 6_000_000, exit_revenue_multiple: 10, target_roi_x: 18 },
    ambitious: { year5_revenue: 15_000_000, exit_revenue_multiple: 12, target_roi_x: 12 },
  },
  deeptech_ai: {
    conservative: { year5_revenue: 3_000_000, exit_revenue_multiple: 7, target_roi_x: 25 },
    standard: { year5_revenue: 8_000_000, exit_revenue_multiple: 9, target_roi_x: 18 },
    ambitious: { year5_revenue: 20_000_000, exit_revenue_multiple: 11, target_roi_x: 12 },
  },
  consumer: {
    conservative: { year5_revenue: 5_000_000, exit_revenue_multiple: 2, target_roi_x: 25 },
    standard: { year5_revenue: 12_000_000, exit_revenue_multiple: 3, target_roi_x: 20 },
    ambitious: { year5_revenue: 30_000_000, exit_revenue_multiple: 4, target_roi_x: 15 },
  },
  hardware: {
    conservative: { year5_revenue: 6_000_000, exit_revenue_multiple: 2, target_roi_x: 25 },
    standard: { year5_revenue: 15_000_000, exit_revenue_multiple: 3, target_roi_x: 20 },
    ambitious: { year5_revenue: 30_000_000, exit_revenue_multiple: 4, target_roi_x: 15 },
  },
  other: {
    conservative: { year5_revenue: 3_000_000, exit_revenue_multiple: 4, target_roi_x: 25 },
    standard: { year5_revenue: 8_000_000, exit_revenue_multiple: 5, target_roi_x: 20 },
    ambitious: { year5_revenue: 18_000_000, exit_revenue_multiple: 6, target_roi_x: 15 },
  },
}

export function getAmbitionAnchors(
  sector: StartupSector,
  ambition: AmbitionLevel,
): AmbitionAnchors {
  const sectorRow = TABLE[sector] ?? TABLE.other
  return sectorRow[ambition]
}

/**
 * Reverse-lookup — given current Y5 / exit / ROI in the store, infer
 * which ambition bucket the founder is currently sitting in.  Used so a
 * founder coming back from the Demo preset (which sets explicit numbers)
 * sees the matching ambition card highlighted.
 *
 * Falls back to "standard" when no row matches exactly — the picker UI
 * will then show no active card, which is the right signal: the values
 * came from an external source (preset, manual override, advisor input)
 * and the founder can pick a card to overwrite them.
 */
export function inferAmbition(
  sector: StartupSector,
  y5: number | null,
  exit: number | null,
  roi: number | null,
): AmbitionLevel | null {
  if (y5 == null || exit == null || roi == null) return null
  const sectorRow = TABLE[sector] ?? TABLE.other
  for (const level of AMBITION_ORDER) {
    const a = sectorRow[level]
    // Tolerant match — within €100k for revenue and within 0.5 for the
    // multipliers so a founder who tweaked one number by hand still sees
    // the closest bucket lit up.
    if (
      Math.abs(a.year5_revenue - y5) <= 100_000 &&
      Math.abs(a.exit_revenue_multiple - exit) <= 0.5 &&
      Math.abs(a.target_roi_x - roi) <= 0.5
    ) {
      return level
    }
  }
  return null
}
