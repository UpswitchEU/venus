/**
 * Studio v2 — One-click preset catalogue.
 *
 * The single biggest friction in the wizard is the "blank canvas" problem:
 * a founder lands on Step 0, faces 8 steps + ~30 inputs, and stalls.
 * Presets pre-fill a defensible baseline so the founder can:
 *
 *   1. See a defensible pre-money number on first paint (0 cognitive load)
 *   2. Tune the inputs that actually differ from the typical case
 *   3. Skip the steps where the preset is right
 *
 * Each preset is a *partial* state diff applied through `applyPreset` on
 * the store.  Fields the founder has already entered are preserved when
 * `mergeMode='preserve_user_data'` — which is the default so a returning
 * user's session is never blown away.
 */

import type {
  FounderPedigreeKey,
  MaturityLevel,
  StartupSector,
  StartupStage,
  StudioBerkusKey,
  StudioScorecardKey,
} from '@/store/manual/useStartupValuationStore'

export type PresetKey =
  | 'upswitch_demo'
  | 'b2b_marketplace_preseed'
  | 'b2b_saas_preseed'
  | 'fintech_preseed'

export interface StudioPreset {
  /** Stable machine key — used for analytics + persisted "last applied" tag. */
  key: PresetKey
  /** Card title shown in the picker (EN / NL). */
  title: { en: string; nl: string }
  /** One-line subtitle. */
  subtitle: { en: string; nl: string }
  /** Short list of attributes (chips on the picker card). */
  highlights: { en: string[]; nl: string[] }
  /** Optional badge — e.g. "Demo", "Recommended". */
  badge?: { en: string; nl: string }

  // ---- The actual state diff ----
  stage: StartupStage
  sector: StartupSector
  country_code: string
  investment_amount_sought: number
  description?: string
  company_name?: string

  /** Berkus + Scorecard maturity picks. */
  maturity: Record<StudioBerkusKey | StudioScorecardKey, MaturityLevel>
  /** Optional evidence sentences pre-filled per milestone. */
  evidence_notes?: Partial<Record<StudioBerkusKey | StudioScorecardKey, string>>

  /** Founder pedigree flags. */
  founder_pedigree: Record<FounderPedigreeKey, boolean>

  /** VC method inputs. */
  year5_revenue_projection?: number
  exit_revenue_multiple?: number
  target_roi_x?: number

  /** Optional TAM/SAM/SOM trio. */
  tam_sam_som?: { tam: number; sam: number; som: number }
}

// ---------------------------------------------------------------------------
// The Upswitch demo preset — uses the system to value the system.
// ---------------------------------------------------------------------------

export const UPSWITCH_DEMO_PRESET: StudioPreset = {
  key: 'upswitch_demo',
  title: {
    en: 'Demo: Value Upswitch',
    nl: 'Demo: Upswitch waarderen',
  },
  subtitle: {
    en: 'Watch the engine value its own company — pre-revenue B2B marketplace, BE pre-seed.',
    nl: 'Zie de engine zichzelf waarderen — pre-revenue B2B marktplaats, BE pre-seed.',
  },
  highlights: {
    en: [
      'B2B marketplace · Benelux SME succession',
      'Production system shipped, pre-revenue',
      'Strong domain + technical team',
      '€750k raise',
    ],
    nl: [
      'B2B marktplaats · Benelux KMO-overdracht',
      'Productiesysteem live, pre-revenue',
      'Sterk domein- + technisch team',
      '€750k ronde',
    ],
  },
  badge: { en: 'Demo', nl: 'Demo' },

  stage: 'pre_seed',
  sector: 'marketplace',
  country_code: 'BE',
  investment_amount_sought: 750_000,
  company_name: 'Upswitch',
  description:
    'Upswitch — two-sided marketplace for Benelux SME succession. Connects business ' +
    'owners planning a sale with vetted M&A advisors. Live KBO/KVK registry ' +
    'enrichment, AI-powered valuation engine, and accountancy partner integrations.',

  maturity: {
    // Berkus
    sound_idea: 'exceptional',
    prototype_status: 'exceptional',
    management_strength: 'strong',
    strategic_relationships: 'strong',
    product_rollout: 'basic',
    // Scorecard
    opportunity_size: 'exceptional',
    competitive_environment: 'strong',
    sales_marketing_channels: 'basic',
    need_for_additional_funding: 'strong',
    other_factors: 'strong',
  },

  evidence_notes: {
    sound_idea:
      '200k+ Benelux SMEs changing hands by 2030. €1T+ EU SME exit market. ' +
      'A GDP-grade succession crisis with no Benelux-native solution today.',
    prototype_status:
      'Full multi-app production system live: Mercury (advisor), Venus (valuation), ' +
      'Titan API, ValuationIQ engine, Athena MDM, Delphi registry enrichment.',
    strategic_relationships:
      'Live KBO (BE) + KVK (NL) registry integrations; accountancy partner platform; ' +
      'sector-aware NACE enrichment.',
    opportunity_size: '€1T+ EU SME exit market; Benelux SOM €50–500M annual GMV.',
    competitive_environment:
      'Drooms / Datasite are enterprise-only; Pitchbook is data-only. ' +
      'No Benelux-native two-sided marketplace at this scale.',
  },

  // Conservative pedigree — domain expertise + technical cofounder. Adjust
  // if a prior exit applies; the engine will lift the multiplier accordingly.
  founder_pedigree: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: true,
    second_time_founder: false,
    has_technical_cofounder: true,
    solo_founder: false,
  },

  // Year 5: €10M ARR (mix of marketplace take-rate at 1.5% on €500M GMV +
  // SaaS subscriptions for ~1k advisors at €200/mo).  Exit multiple 5×
  // reflects the SaaS-marketplace hybrid nature.  Target ROI 15× is the
  // strong-team rate (down from the punitive 30× pre-seed default).
  year5_revenue_projection: 10_000_000,
  exit_revenue_multiple: 5,
  target_roi_x: 15,

  tam_sam_som: {
    tam: 1_000_000_000_000, // €1T EU SME exit market
    sam: 50_000_000_000, // €50B Benelux annual GMV
    som: 500_000_000, // €500M realistic 3-yr Benelux GMV reachable
  },
}

// ---------------------------------------------------------------------------
// Generic templates — sensible smart defaults per (sector, stage) pair.
// ---------------------------------------------------------------------------

export const B2B_MARKETPLACE_PRESEED_PRESET: StudioPreset = {
  key: 'b2b_marketplace_preseed',
  title: {
    en: 'B2B marketplace · pre-seed',
    nl: 'B2B marktplaats · pre-seed',
  },
  subtitle: {
    en: 'Two-sided platform with take-rate or SaaS revenue.  Smart defaults for a typical Benelux pre-seed.',
    nl: 'Tweezijdig platform met take-rate of SaaS-omzet.  Smart defaults voor een typische Benelux pre-seed.',
  },
  highlights: {
    en: ['Marketplace · 4× exit multiple', 'Y5: €8M ARR (typical)', '€500k raise default'],
    nl: ['Marktplaats · 4× exit multiple', 'Y5: €8M ARR (typisch)', '€500k ronde default'],
  },

  stage: 'pre_seed',
  sector: 'marketplace',
  country_code: 'BE',
  investment_amount_sought: 500_000,

  maturity: {
    sound_idea: 'strong',
    prototype_status: 'basic',
    management_strength: 'strong',
    strategic_relationships: 'basic',
    product_rollout: 'basic',
    opportunity_size: 'strong',
    competitive_environment: 'basic',
    sales_marketing_channels: 'basic',
    need_for_additional_funding: 'strong',
    other_factors: 'basic',
  },

  founder_pedigree: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: false,
    second_time_founder: false,
    has_technical_cofounder: true,
    solo_founder: false,
  },

  year5_revenue_projection: 8_000_000,
  exit_revenue_multiple: 4,
  target_roi_x: 25,
}

export const B2B_SAAS_PRESEED_PRESET: StudioPreset = {
  key: 'b2b_saas_preseed',
  title: { en: 'B2B SaaS · pre-seed', nl: 'B2B SaaS · pre-seed' },
  subtitle: {
    en: 'Recurring revenue B2B software.  Smart defaults for a typical Benelux pre-seed.',
    nl: 'Terugkerende B2B software-omzet.  Smart defaults voor een typische Benelux pre-seed.',
  },
  highlights: {
    en: ['SaaS · 6× exit multiple', 'Y5: €5M ARR (typical)', '€500k raise default'],
    nl: ['SaaS · 6× exit multiple', 'Y5: €5M ARR (typisch)', '€500k ronde default'],
  },

  stage: 'pre_seed',
  sector: 'saas',
  country_code: 'BE',
  investment_amount_sought: 500_000,

  maturity: {
    sound_idea: 'strong',
    prototype_status: 'strong',
    management_strength: 'strong',
    strategic_relationships: 'basic',
    product_rollout: 'basic',
    opportunity_size: 'strong',
    competitive_environment: 'strong',
    sales_marketing_channels: 'basic',
    need_for_additional_funding: 'strong',
    other_factors: 'basic',
  },

  founder_pedigree: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: false,
    second_time_founder: false,
    has_technical_cofounder: true,
    solo_founder: false,
  },

  year5_revenue_projection: 5_000_000,
  exit_revenue_multiple: 6,
  target_roi_x: 25,
}

export const FINTECH_PRESEED_PRESET: StudioPreset = {
  key: 'fintech_preseed',
  title: { en: 'Fintech · pre-seed', nl: 'Fintech · pre-seed' },
  subtitle: {
    en: 'Regulated financial services.  Higher exit multiples, longer rollout.',
    nl: 'Gereguleerde financiële diensten.  Hogere exit-multiples, langere uitrol.',
  },
  highlights: {
    en: ['Fintech · 8× exit multiple', 'Y5: €6M ARR', '€750k raise default'],
    nl: ['Fintech · 8× exit multiple', 'Y5: €6M ARR', '€750k ronde default'],
  },

  stage: 'pre_seed',
  sector: 'fintech',
  country_code: 'BE',
  investment_amount_sought: 750_000,

  maturity: {
    sound_idea: 'strong',
    prototype_status: 'basic',
    management_strength: 'strong',
    strategic_relationships: 'strong',
    product_rollout: 'basic',
    opportunity_size: 'strong',
    competitive_environment: 'strong',
    sales_marketing_channels: 'basic',
    need_for_additional_funding: 'basic',
    other_factors: 'strong',
  },

  founder_pedigree: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: true,
    second_time_founder: false,
    has_technical_cofounder: true,
    solo_founder: false,
  },

  year5_revenue_projection: 6_000_000,
  exit_revenue_multiple: 8,
  target_roi_x: 20,
}

export const STUDIO_PRESETS: Record<PresetKey, StudioPreset> = {
  upswitch_demo: UPSWITCH_DEMO_PRESET,
  b2b_marketplace_preseed: B2B_MARKETPLACE_PRESEED_PRESET,
  b2b_saas_preseed: B2B_SAAS_PRESEED_PRESET,
  fintech_preseed: FINTECH_PRESEED_PRESET,
}

/** Display-ordered list used by the picker UI. */
export const STUDIO_PRESET_ORDER: readonly PresetKey[] = [
  'upswitch_demo',
  'b2b_marketplace_preseed',
  'b2b_saas_preseed',
  'fintech_preseed',
] as const
