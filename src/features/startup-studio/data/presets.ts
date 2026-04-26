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
    en: 'Example: Upswitch valuation',
    nl: 'Voorbeeld: Upswitch waardering',
  },
  subtitle: {
    en: "See the engine on a real example — Upswitch's own pre-seed valuation. Click to load the inputs and watch the numbers.",
    nl: 'Zie de engine op een echt voorbeeld — Upswitch eigen pre-seed waardering. Klik om inputs te laden en de cijfers te zien.',
  },
  highlights: {
    en: [
      'B2B marketplace · Benelux SME succession',
      'Production system shipped, pre-revenue',
      'Veteran team · category-defining ambition',
      '€1.5M pre-seed · ~€8.5M pre-money · ~15% dilution',
    ],
    nl: [
      'B2B marktplaats · Benelux KMO-overdracht',
      'Productiesysteem live, pre-revenue',
      'Veteraan team · categorie-definiërende ambitie',
      '€1.5M pre-seed · ~€8.5M pre-money · ~15% dilutie',
    ],
  },
  badge: { en: 'Example', nl: 'Voorbeeld' },

  stage: 'pre_seed',
  sector: 'marketplace',
  country_code: 'BE',
  investment_amount_sought: 1_500_000,
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

  // Veteran team pedigree — three substantiable claims:
  //   * domain_expert_10y    : 10+ yrs SME M&A / advisor experience
  //   * second_time_founder  : prior 2+ year venture
  //   * has_technical_cofounder : the multi-app system is owned end-to-end
  // Combined multiplier: 1.0 + 0.15 + 0.10 + 0.10 = 1.35×.  Three claims
  // are all defensible to a sceptical investor; a `prior_exit` or
  // `top_unicorn_alumnus` claim would push to 1.55×–1.60× but requires
  // specific provenance (Crunchbase exit, Adyen / Collibra / Showpad
  // tenure verifiable on LinkedIn).
  founder_pedigree: {
    prior_exit: false,
    top_unicorn_alumnus: false,
    domain_expert_10y: true,
    second_time_founder: true,
    has_technical_cofounder: true,
    solo_founder: false,
  },

  // Year 5: €60M ARR — category-defining marketplace × SaaS hybrid.
  // Defensible model:
  //   * 1.5%–2% take-rate × €2-3B Benelux SME succession GMV by Y5
  //     (~10% of Benelux annual flow given first-mover network effects)
  //   * + €15-30M advisor-SaaS ARR (~3-5k advisors × €400/mo)
  //   = €60M total revenue.
  // Exit 6× is the marketplace top-of-band; ROI 12× reflects strong-team
  // venture compression on a category-leader thesis.
  //
  // Engine math (with 1.35× veteran pedigree, €1.5M raise):
  //   VC pre   = (€60M × 6 ÷ 12) − €1.5M = €28.5M
  //   Blend    = 0.50×€1.95M + 0.333×€1.84M + 0.167×€28.5M ≈ €6.35M
  //   Headline = €6.35M × 1.35 ≈ €8.57M  → ~14.9% dilution at €1.5M
  //
  // This lands the deck-target dilution (15%) directly from the engine,
  // with three defensible founder-pedigree claims and a Y5 thesis that
  // any investor can stress-test against the published Benelux SME M&A
  // dataset.  Verified by `apps/valuation-iq/scripts/value_upswitch.py`.
  year5_revenue_projection: 60_000_000,
  exit_revenue_multiple: 6,
  target_roi_x: 12,

  tam_sam_som: {
    tam: 1_000_000_000_000, // €1T EU SME exit market
    sam: 50_000_000_000, // €50B Benelux annual GMV
    som: 750_000_000, // €750M realistic 3-yr Benelux GMV reachable post-€1.5M
  },
}

// ---------------------------------------------------------------------------
// Generic templates — sensible smart defaults per (sector, stage) pair.
// ---------------------------------------------------------------------------

export const B2B_MARKETPLACE_PRESEED_PRESET: StudioPreset = {
  key: 'b2b_marketplace_preseed',
  title: {
    en: 'B2B marketplace',
    nl: 'B2B marktplaats',
  },
  subtitle: {
    en: 'Two-sided platform with take-rate or SaaS revenue.  Smart defaults — pick your stage above and we adapt.',
    nl: 'Tweezijdig platform met take-rate of SaaS-omzet.  Smart defaults — kies je stage hierboven, wij passen aan.',
  },
  highlights: {
    en: ['Marketplace sector', 'Typical Y5 ARR anchor', 'Adapts to stage you pick'],
    nl: ['Marktplaats sector', 'Typisch Y5 ARR anker', 'Past aan op gekozen stage'],
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
  title: { en: 'B2B SaaS', nl: 'B2B SaaS' },
  subtitle: {
    en: 'Recurring revenue B2B software.  Smart defaults — pick your stage above and we adapt.',
    nl: 'Terugkerende B2B software-omzet.  Smart defaults — kies je stage hierboven, wij passen aan.',
  },
  highlights: {
    en: ['SaaS sector', 'Recurring revenue model', 'Adapts to stage you pick'],
    nl: ['SaaS sector', 'Recurring revenue model', 'Past aan op gekozen stage'],
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
  title: { en: 'Fintech', nl: 'Fintech' },
  subtitle: {
    en: 'Regulated financial services.  Higher exit multiples, longer rollout.',
    nl: 'Gereguleerde financiële diensten.  Hogere exit-multiples, langere uitrol.',
  },
  highlights: {
    en: ['Fintech sector · regulated moat', 'Higher exit multiple band', 'Adapts to stage you pick'],
    nl: ['Fintech sector · gereguleerde moat', 'Hogere exit-multiple band', 'Past aan op gekozen stage'],
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

/** Display-ordered list used by the picker UI.
 *
 * Generic templates come first because most founders running Express are
 * valuing their *own* company, not Upswitch.  The Upswitch demo card stays
 * in the picker (it's the self-demonstration / partner-pitch surface) but
 * is displayed last with a neutral "Example" framing so a real founder
 * doesn't accidentally pick it thinking it's a template for them. */
export const STUDIO_PRESET_ORDER: readonly PresetKey[] = [
  'b2b_saas_preseed',
  'b2b_marketplace_preseed',
  'fintech_preseed',
  'upswitch_demo',
] as const
