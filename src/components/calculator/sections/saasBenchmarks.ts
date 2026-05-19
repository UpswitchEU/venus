/**
 * Sector benchmarks for the standard SaaS valuation method's
 * current-state metrics (gross margin, monthly growth, monthly churn,
 * NRR).  These are NOT exit multiples or Y5 projections — that maths
 * lives in the startup-valuation store.  These are the typical
 * "current state" numbers a Benelux founder coming in fresh would
 * accept as a starting point and then tune to their own data.
 *
 * Used by `SaasMetricsSection` to soft-prefill empty fields when the
 * KBO/KVK NACE → sector inference resolves to a known sector.  Each
 * filled value is tagged in the UI so the founder sees clearly that
 * the number is a benchmark, not their own.
 *
 * Sources (Q1 2026 references):
 *   - KeyBanc / OpenView SaaS Survey 2024 — gross margin medians
 *   - Bessemer State of the Cloud 2024 — NRR + monthly growth bands
 *   - SaaS Capital Index 2024 — monthly churn medians by stage
 *   - PitchBook Benelux fintech / hardware 2024 — sector adjustments
 *
 * Discipline:
 *   - Numbers are MEDIANS, not aspirational top-quartile.
 *   - Anything we can't defensibly benchmark stays absent (CAC,
 *     S&M spend, ARR — too company-specific to fake a default).
 */

import type { StartupSector } from '@/store/manual/useStartupValuationStore'

export interface SaasSectorBenchmark {
  /** Gross margin %, sector median (e.g. 78 for SaaS). */
  gross_margin_pct: number
  /** Annual gross revenue churn %, sector median (e.g. 3 for SaaS).
   *  Feeds `saas_churn_pct` directly. */
  monthly_churn_pct: number
  /** Annual logo / customer churn %, sector median.  Typically runs
   *  1.2-1.5x revenue churn for SMB SaaS (smaller accounts churn
   *  faster), ~1x for enterprise / regulated verticals (biotech,
   *  fintech).  Feeds `saas_customer_churn_pct`. */
  customer_churn_pct: number
  /** Net revenue retention %, sector median (e.g. 110 for SaaS). */
  nrr_pct: number
  /** Annual ARR growth %, sector median for early-stage Benelux SMEs.
   *  Canonical: feeds `saas_arr_growth_pct` which the engine reads as an
   *  annual fraction (Rule of 40 = annual_growth + gross_margin). */
  annual_growth_pct: number
  /** Expansion revenue %, sector median.  Derived from the NRR identity
   *  (NRR ≈ 100 + expansion - gross_churn) so the seeded value is
   *  internally consistent with the other prefilled metrics.  Feeds
   *  `saas_expansion_revenue_pct`. */
  expansion_revenue_pct: number
}

export const SAAS_SECTOR_DEFAULTS: Record<StartupSector, SaasSectorBenchmark> = {
  saas: {
    gross_margin_pct: 78,
    monthly_churn_pct: 3,
    customer_churn_pct: 5,
    nrr_pct: 110,
    annual_growth_pct: 60,
    expansion_revenue_pct: 13,
  },
  marketplace: {
    gross_margin_pct: 25,
    monthly_churn_pct: 5,
    customer_churn_pct: 8,
    nrr_pct: 100,
    annual_growth_pct: 80,
    expansion_revenue_pct: 5,
  },
  fintech: {
    gross_margin_pct: 65,
    monthly_churn_pct: 2,
    customer_churn_pct: 3,
    nrr_pct: 105,
    annual_growth_pct: 50,
    expansion_revenue_pct: 7,
  },
  biotech_healthtech: {
    gross_margin_pct: 70,
    monthly_churn_pct: 2,
    customer_churn_pct: 2,
    nrr_pct: 105,
    annual_growth_pct: 35,
    expansion_revenue_pct: 7,
  },
  deeptech_ai: {
    gross_margin_pct: 65,
    monthly_churn_pct: 3,
    customer_churn_pct: 5,
    nrr_pct: 115,
    annual_growth_pct: 80,
    expansion_revenue_pct: 18,
  },
  vertical_ai: {
    // Vertical-AI workflow benchmarks (Casetext / Harvey / AlphaSense
    // band). Higher gross margin than generic deeptech_ai because the
    // workflow surface is software-priced; lower churn than consumer
    // SaaS because customers anchor on workflow lock-in.
    gross_margin_pct: 72,
    monthly_churn_pct: 2,
    customer_churn_pct: 4,
    nrr_pct: 125,
    annual_growth_pct: 100,
    expansion_revenue_pct: 22,
  },
  consumer: {
    gross_margin_pct: 35,
    monthly_churn_pct: 7,
    customer_churn_pct: 10,
    nrr_pct: 95,
    annual_growth_pct: 45,
    expansion_revenue_pct: 2,
  },
  hardware: {
    gross_margin_pct: 35,
    monthly_churn_pct: 2,
    customer_churn_pct: 2,
    nrr_pct: 100,
    annual_growth_pct: 30,
    expansion_revenue_pct: 2,
  },
  other: {
    gross_margin_pct: 60,
    monthly_churn_pct: 4,
    customer_churn_pct: 6,
    nrr_pct: 100,
    annual_growth_pct: 45,
    expansion_revenue_pct: 4,
  },
}
