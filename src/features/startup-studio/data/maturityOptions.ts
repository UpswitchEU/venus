/**
 * Studio v2 — Maturity option catalogue.
 *
 * Replaces the 0-100 sliders with discrete, evidence-based statements.
 * The founder picks the statement that best matches their reality;
 * `setMaturity` in `useStartupValuationStore` derives the 0-100 score
 * the Python engine consumes.
 *
 * One source of truth in EN + NL.  Tooltips and Benelux examples live
 * here too so the wizard never needs to hard-code copy.
 */

import type {
  MaturityLevel,
  StudioBerkusKey,
  StudioMilestoneKey,
  StudioScorecardKey,
} from '@/store/manual/useStartupValuationStore'

export type StudioLocale = 'en' | 'nl'

export interface MaturityOption {
  level: MaturityLevel
  /** Bilingual statement that describes the level in concrete terms. */
  label: { en: string; nl: string }
}

export interface MilestoneCopy {
  /** Wizard card title. */
  title: { en: string; nl: string }
  /** One-line subtitle that reminds founders what investors look for. */
  subtitle: { en: string; nl: string }
  /** "Why this matters" explanation, expandable. */
  why: { en: string; nl: string }
  /** Concrete Benelux examples (3 lines, bilingual). */
  examples: { en: string[]; nl: string[] }
  /** The four maturity options, ordered low → high. */
  options: MaturityOption[]
  /**
   * What evidence to type into the free-text box.  Becomes the
   * placeholder + investor-justification sentence in the report.
   */
  evidencePrompt: { en: string; nl: string }
}

// ---------------------------------------------------------------------------
// Berkus 2.0 — five risk-reduction milestones.
// ---------------------------------------------------------------------------

export const BERKUS_MILESTONES: Record<StudioBerkusKey, MilestoneCopy> = {
  sound_idea: {
    title: { en: 'Idea & problem-solution fit', nl: 'Idee & probleem-oplossing fit' },
    subtitle: {
      en: 'Defendable problem with proof of demand',
      nl: 'Verdedigbaar probleem met aantoonbare vraag',
    },
    why: {
      en: 'Berkus rewards a clear, painful problem with evidence that customers actually want a solution. LOIs, waitlists, customer interviews and quantified pain all count.',
      nl: 'Berkus beloont een helder, pijnlijk probleem met bewijs dat klanten echt een oplossing willen. LOIs, wachtlijsten, klantinterviews en gekwantificeerde pijn tellen allemaal mee.',
    },
    examples: {
      en: [
        'Showpad — clear B2B sales-enablement pain validated with 30+ interviews before any code.',
        'Henchman — Belgian legal-tech: 12 LOIs from law firms before MVP.',
        'Sortlist — quantified €X procurement pain in marketing-services sourcing.',
      ],
      nl: [
        'Showpad — duidelijke B2B sales-enablement pijn, gevalideerd met 30+ interviews voor één regel code.',
        'Henchman — Belgische legal-tech: 12 LOIs van advocatenkantoren voor MVP.',
        'Sortlist — gekwantificeerde €X procurement-pijn in marketing-services sourcing.',
      ],
    },
    options: [
      {
        level: 'none',
        label: {
          en: 'Just an idea — no customer conversations yet.',
          nl: 'Alleen een idee — nog geen klantgesprekken.',
        },
      },
      {
        level: 'basic',
        label: {
          en: '20+ interviews + written demand signals (LOIs, waitlist, surveys).',
          nl: '20+ interviews + schriftelijke vraagsignalen (LOIs, wachtlijst, surveys).',
        },
      },
      {
        level: 'strong',
        label: {
          en: '100–1,000 free users — first paying customers in the pipeline.',
          nl: '100–1.000 gratis gebruikers — eerste betalende klanten in de pijplijn.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Quantified ROI per customer + paid pre-orders or signed pilots.',
          nl: 'Gekwantificeerde ROI per klant + betaalde pre-orders of getekende pilots.',
        },
      },
    ],
    evidencePrompt: {
      en: 'Cite the strongest demand signal you have (e.g. "1,200 waitlist sign-ups + 8 paid pilots in Q4 2025").',
      nl: 'Noem het sterkste vraagsignaal dat je hebt (bv. "1.200 wachtlijst-aanmeldingen + 8 betaalde pilots in Q4 2025").',
    },
  },

  prototype_status: {
    title: { en: 'Prototype / MVP', nl: 'Prototype / MVP' },
    subtitle: {
      en: 'Working tech that removes core technical risk',
      nl: 'Werkende tech die kerntechnisch risico wegneemt',
    },
    why: {
      en: 'A demoable MVP — not a Figma — proves you can build it. Live customers using it weekly is the gold standard at pre-seed.',
      nl: 'Een demoable MVP — geen Figma — bewijst dat je het kunt bouwen. Live klanten die er wekelijks mee werken is de gouden standaard bij pre-seed.',
    },
    examples: {
      en: [
        'Theodo Apps — interactive prototype on TestFlight, used by 50 design partners weekly.',
        'Aikido Security — open-source SAST module deployable in <5 minutes.',
        'Henchman — Word add-in beta with 3 paying law firms.',
      ],
      nl: [
        'Theodo Apps — interactief prototype op TestFlight, wekelijks gebruikt door 50 design partners.',
        'Aikido Security — open-source SAST module in <5 minuten te deployen.',
        'Henchman — Word add-in bèta met 3 betalende advocatenkantoren.',
      ],
    },
    options: [
      {
        level: 'none',
        label: { en: 'Concept only — no build yet.', nl: 'Alleen concept — nog niets gebouwd.' },
      },
      {
        level: 'basic',
        label: {
          en: 'Clickable prototype (Figma/no-code) demoable in person.',
          nl: 'Klikbaar prototype (Figma/no-code) live demoable.',
        },
      },
      {
        level: 'strong',
        label: {
          en: 'Working MVP with 5+ design partners using it weekly.',
          nl: 'Werkende MVP met 5+ design partners die er wekelijks mee werken.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Production-grade MVP, multi-tenant, paying users.',
          nl: 'Productie-MVP, multi-tenant, betalende gebruikers.',
        },
      },
    ],
    evidencePrompt: {
      en: 'Describe what works today (e.g. "iOS app live in TestFlight, 80 weekly active users").',
      nl: 'Beschrijf wat vandaag werkt (bv. "iOS app live in TestFlight, 80 wekelijks actieve gebruikers").',
    },
  },

  management_strength: {
    title: { en: 'Founding team', nl: 'Founderteam' },
    subtitle: {
      en: 'Founder–market fit and proven execution',
      nl: 'Founder-market fit en bewezen executiekracht',
    },
    why: {
      en: 'Investors back people first at pre-seed. Complete teams (tech + commercial), domain expertise, and prior shipping history compound trust.',
      nl: 'Investeerders steken eerst geld in mensen bij pre-seed. Complete teams (tech + commercial), domeinexpertise en eerder shipping-track-record stapelen vertrouwen op.',
    },
    examples: {
      en: [
        'Showpad — co-founders had built and sold a previous SaaS together.',
        'Aikido — founders ex-Teamleader, ex-AppTweak: deep security + GTM domain.',
        'Sortlist — solo founder bootstrapped to €1M ARR before raising.',
      ],
      nl: [
        'Showpad — co-founders hadden samen al een eerdere SaaS gebouwd en verkocht.',
        'Aikido — founders ex-Teamleader, ex-AppTweak: diepe security + GTM domein.',
        'Sortlist — solo founder bootstrappte naar €1M ARR voor eerste ronde.',
      ],
    },
    options: [
      {
        level: 'none',
        label: {
          en: 'Solo founder, no co-founder yet.',
          nl: 'Solo founder, nog geen co-founder.',
        },
      },
      {
        level: 'basic',
        label: {
          en: 'Complete founding team (tech + commercial).',
          nl: 'Complete founding team (tech + commercial).',
        },
      },
      {
        level: 'strong',
        label: {
          en: 'Founders with 5+ yrs deep domain expertise in this market.',
          nl: 'Founders met 5+ jaar diepe domeinexpertise in deze markt.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Serial founders with prior successful exits.',
          nl: 'Serial founders met eerdere succesvolle exits.',
        },
      },
    ],
    evidencePrompt: {
      en: 'List the team and the most relevant credential per founder (e.g. "CTO ex-Aikido, 8 yrs in security").',
      nl: 'Som het team op met de sterkste credential per founder (bv. "CTO ex-Aikido, 8 jr security").',
    },
  },

  strategic_relationships: {
    title: { en: 'Strategic relationships', nl: 'Strategische relaties' },
    subtitle: {
      en: 'Signed LOIs, design partners, distribution deals',
      nl: 'Getekende LOIs, design partners, distributiedeals',
    },
    why: {
      en: 'Distribution > product at pre-seed. Signed letters of intent, design partners with real budget, and channel partners de-risk go-to-market for investors.',
      nl: 'Distributie > product bij pre-seed. Getekende LOIs, design partners met echte budgetten en kanaalpartners verlagen het GTM-risico voor investeerders.',
    },
    examples: {
      en: [
        'Henchman — Allen & Overy as paid pilot, signed LOI for rollout.',
        'Aikido — listed on Atlassian Marketplace day 1.',
        'Theodo — channel partnership with Imec.istart pre-launch.',
      ],
      nl: [
        'Henchman — Allen & Overy als betaalde pilot, getekende LOI voor uitrol.',
        'Aikido — vanaf dag 1 op de Atlassian Marketplace.',
        'Theodo — kanaalpartnerschap met Imec.istart pre-launch.',
      ],
    },
    options: [
      {
        level: 'none',
        label: { en: 'No partners or LOIs yet.', nl: 'Nog geen partners of LOIs.' },
      },
      {
        level: 'basic',
        label: {
          en: '1–2 informal design partners or named pilot conversations (no contract).',
          nl: '1–2 informele design partners of pilot-gesprekken (geen contract).',
        },
      },
      {
        level: 'strong',
        label: {
          en: '3+ signed LOIs or paid design partners with named enterprise pilots.',
          nl: '3+ getekende LOIs of betaalde design partners met benoemde enterprise-pilots.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Channel partnership / marketplace listing live with revenue from named accounts.',
          nl: 'Kanaalpartnerschap of marketplace-listing live, met omzet uit benoemde accounts.',
        },
      },
    ],
    evidencePrompt: {
      en: 'Name the partners and the commercial commitment (e.g. "3 LOIs from Belfius, KBC, Argenta").',
      nl: 'Noem de partners en de commerciële commitment (bv. "3 LOIs van Belfius, KBC, Argenta").',
    },
  },

  product_rollout: {
    title: { en: 'Rollout & first revenue', nl: 'Uitrol & eerste omzet' },
    subtitle: {
      en: 'Live customers, paid pilots or first ARR',
      nl: 'Live klanten, betaalde pilots of eerste ARR',
    },
    why: {
      en: 'Even small revenue is a step-change in valuation: it proves willingness to pay. Anything north of €1k MRR materially de-risks the round.',
      nl: 'Zelfs kleine omzet is een sprong in waardering: het bewijst betalingsbereidheid. Alles boven €1k MRR vermindert het risico van de ronde aanzienlijk.',
    },
    examples: {
      en: [
        'Henchman — €5k MRR from 3 paying law firms before seed.',
        'Sortlist — €15k MRR bootstrapped before first round.',
        'Theodo Apps — 12 paid pilots at €500/mo at pre-seed close.',
      ],
      nl: [
        'Henchman — €5k MRR van 3 betalende advocatenkantoren voor seed.',
        'Sortlist — €15k MRR gebootstrapt voor eerste ronde.',
        'Theodo Apps — 12 betaalde pilots à €500/mnd bij pre-seed close.',
      ],
    },
    options: [
      {
        level: 'none',
        label: { en: 'No revenue, no live customers.', nl: 'Geen omzet, geen live klanten.' },
      },
      {
        level: 'basic',
        label: {
          en: 'Free pilots running with 3+ users.',
          nl: 'Gratis pilots lopen met 3+ gebruikers.',
        },
      },
      {
        level: 'strong',
        label: {
          en: 'Paid pilots — €1k–€10k MRR or one big-ticket pilot.',
          nl: 'Betaalde pilots — €1k–€10k MRR of één big-ticket pilot.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: '€10k+ MRR with retention proof (>2 months).',
          nl: '€10k+ MRR met retentie-bewijs (>2 maanden).',
        },
      },
    ],
    evidencePrompt: {
      en: 'Quantify revenue and the retention story (e.g. "€8k MRR, all 5 pilots renewed").',
      nl: 'Kwantificeer omzet en het retentieverhaal (bv. "€8k MRR, alle 5 pilots verlengd").',
    },
  },
}

// ---------------------------------------------------------------------------
// Scorecard 2.0 — five Bill Payne weighted factors (team factor lives in
// Berkus.management_strength so we don't double count).
// ---------------------------------------------------------------------------

export const SCORECARD_FACTORS: Record<StudioScorecardKey, MilestoneCopy & { weight_pct: number }> =
  {
    opportunity_size: {
      weight_pct: 30,
      title: {
        en: 'Market opportunity (size & growth)',
        nl: 'Marktopportuniteit (omvang & groei)',
      },
      subtitle: {
        en: 'TAM, growth rate, and how much of it you can credibly capture',
        nl: 'TAM, groei, en hoeveel je geloofwaardig kunt veroveren',
      },
      why: {
        en: 'Bill Payne 2024: a defensible €1B+ TAM with double-digit growth tilts the Scorecard up by 25–30%. Smaller TAMs tilt it down sharply.',
        nl: 'Bill Payne 2024: een verdedigbare €1B+ TAM met dubbele-cijfer groei tilt de Scorecard 25–30% omhoog. Kleinere TAMs trekken hem scherp omlaag.',
      },
      examples: {
        en: [
          'European legal-tech: ~€8B TAM growing 12% — strong.',
          'Belgian only logistics SaaS: ~€80M TAM — below average.',
          'Global B2B AI tooling: €30B+ TAM — exceptional.',
        ],
        nl: [
          'Europese legal-tech: ~€8B TAM groei 12% — sterk.',
          'Alleen Belgische logistics SaaS: ~€80M TAM — beneden gemiddeld.',
          'Wereldwijde B2B AI tooling: €30B+ TAM — uitzonderlijk.',
        ],
      },
      options: [
        {
          level: 'none',
          label: {
            en: 'Niche market — TAM <€100M, flat growth.',
            nl: 'Nichemarkt — TAM <€100M, vlakke groei.',
          },
        },
        {
          level: 'basic',
          label: {
            en: 'Regional market — TAM €100M–€1B, single-digit growth.',
            nl: 'Regionale markt — TAM €100M–€1B, enkele-cijfer groei.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'European market — TAM €1B+, double-digit growth.',
            nl: 'Europese markt — TAM €1B+, dubbele-cijfer groei.',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Global category-defining market — TAM €10B+, 20%+ growth.',
            nl: 'Wereldwijde category-defining markt — TAM €10B+, 20%+ groei.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Quote your TAM source and growth rate (e.g. "Gartner 2025: €8B legal-tech, 12% YoY").',
        nl: 'Citeer je TAM-bron en groei (bv. "Gartner 2025: €8B legal-tech, 12% YoY").',
      },
    },

    competitive_environment: {
      weight_pct: 15,
      title: { en: 'Competitive environment', nl: 'Concurrentieomgeving' },
      subtitle: {
        en: 'Defensibility, IP, switching costs',
        nl: 'Verdedigbaarheid, IP, switching costs',
      },
      why: {
        en: 'A defensible moat (proprietary data, deep integrations, network effects, IP) increases the Scorecard. Crowded markets with no moat decrease it.',
        nl: 'Een verdedigbare moat (proprietary data, diepe integraties, netwerkeffecten, IP) verhoogt de Scorecard. Drukke markten zonder moat verlagen hem.',
      },
      examples: {
        en: [
          'Aikido — open-source distribution + tight Atlassian integration.',
          'Henchman — proprietary contract clause dataset.',
          'Generic CRM clone in 2026 — saturated, no moat.',
        ],
        nl: [
          'Aikido — open-source distributie + diepe Atlassian-integratie.',
          'Henchman — eigen dataset van contract-clausules.',
          'Generieke CRM-kloon in 2026 — verzadigd, geen moat.',
        ],
      },
      options: [
        {
          level: 'none',
          label: {
            en: 'Crowded market with strong incumbents and no obvious moat.',
            nl: 'Drukke markt met sterke incumbents en geen duidelijke moat.',
          },
        },
        {
          level: 'basic',
          label: {
            en: 'Some differentiation, weak moat.',
            nl: 'Enige differentiatie, zwakke moat.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'Defensible moat (data, integrations, distribution).',
            nl: 'Verdedigbare moat (data, integraties, distributie).',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Strong IP / network effects / category creator.',
            nl: 'Sterke IP / netwerkeffecten / category creator.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Name your moat in one sentence (e.g. "exclusive data partnership with X covering 70% of market").',
        nl: 'Beschrijf je moat in één zin (bv. "exclusieve datapartner X dekt 70% van de markt").',
      },
    },

    sales_marketing_channels: {
      weight_pct: 25,
      title: { en: 'Go-to-market & partnerships', nl: 'Go-to-market & partnerschappen' },
      subtitle: {
        en: 'Repeatable distribution and proof of CAC payback',
        nl: 'Herhaalbare distributie en bewijs van CAC payback',
      },
      why: {
        en: 'Repeatable, low-CAC distribution is the #1 differentiator at seed. PLG, channel, marketplace listings, or community-led GTM all count.',
        nl: 'Herhaalbare, lage-CAC distributie is het #1 verschil bij seed. PLG, channel, marketplace listings of community-led GTM tellen allemaal.',
      },
      examples: {
        en: [
          'Aikido — open-source funnel: free → team plan in 14 days.',
          'Linear — community-led waitlist with 50k signups.',
          'No GTM hypothesis = below average.',
        ],
        nl: [
          'Aikido — open-source funnel: gratis → team plan in 14 dagen.',
          'Linear — community-led wachtlijst met 50k inschrijvingen.',
          'Geen GTM-hypothese = beneden gemiddeld.',
        ],
      },
      options: [
        {
          level: 'none',
          label: { en: 'No clear GTM hypothesis.', nl: 'Geen duidelijke GTM-hypothese.' },
        },
        {
          level: 'basic',
          label: {
            en: 'One channel hypothesis being tested.',
            nl: 'Eén kanaal-hypothese wordt getest.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'One repeatable channel with measurable CAC.',
            nl: 'Eén herhaalbaar kanaal met meetbare CAC.',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Two repeatable channels + payback period < 12 months.',
            nl: 'Twee herhaalbare kanalen + payback < 12 maanden.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Describe your strongest channel and CAC (e.g. "PLG, CAC €280, payback 4 months").',
        nl: 'Beschrijf je sterkste kanaal en CAC (bv. "PLG, CAC €280, payback 4 maanden").',
      },
    },

    need_for_additional_funding: {
      weight_pct: 15,
      title: { en: 'Capital efficiency', nl: 'Kapitaalefficiëntie' },
      subtitle: {
        en: 'Runway, burn discipline, and the path to default-alive',
        nl: 'Runway, burn-discipline en het pad naar default-alive',
      },
      why: {
        en: '2026 funding climate: investors penalise teams that need 3+ rounds to break even. Capital-efficient growth (low burn, default-alive within 24 months) is rewarded.',
        nl: '2026 funding-klimaat: investeerders bestraffen teams die 3+ rondes nodig hebben om break-even te zijn. Kapitaal-efficiënte groei (lage burn, default-alive binnen 24 maanden) wordt beloond.',
      },
      examples: {
        en: [
          'Aikido — bootstrapped to €1M ARR with €0 raised.',
          'Henchman — €1M raise targets 24 months runway to break-even.',
          'Multi-round burn-heavy plan = below average in 2026.',
        ],
        nl: [
          'Aikido — gebootstrapt naar €1M ARR met €0 opgehaald.',
          'Henchman — €1M ronde mikt op 24 maanden runway naar break-even.',
          'Multi-round burn-heavy plan = beneden gemiddeld in 2026.',
        ],
      },
      options: [
        {
          level: 'none',
          label: {
            en: 'Plan needs 3+ rounds to reach break-even.',
            nl: 'Plan vereist 3+ rondes naar break-even.',
          },
        },
        {
          level: 'basic',
          label: {
            en: 'This round + Series A path to break-even.',
            nl: 'Deze ronde + Series A-pad naar break-even.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'This round = 24 months runway, break-even in sight.',
            nl: 'Deze ronde = 24 maanden runway, break-even in zicht.',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Default-alive — this round buys optionality, not survival.',
            nl: 'Default-alive — deze ronde koopt optionaliteit, geen overleven.',
          },
        },
      ],
      evidencePrompt: {
        en: 'State runway and break-even target (e.g. "24 months runway, break-even Q4 2027").',
        nl: 'Geef runway en break-even target (bv. "24 maanden runway, break-even Q4 2027").',
      },
    },

    other_factors: {
      weight_pct: 15,
      title: { en: 'Other defensibility factors', nl: 'Overige defensibility-factoren' },
      subtitle: {
        en: 'Regulation, geography, timing, brand',
        nl: 'Regulering, geografie, timing, merk',
      },
      why: {
        en: 'Catch-all for everything not in the other factors: regulatory advantages, geography, timing, brand, customer love, NPS, talent magnet status.',
        nl: 'Verzamelbak voor alles wat niet in de andere factoren past: regulatorische voordelen, geografie, timing, merk, klantliefde, NPS, talent magnet.',
      },
      examples: {
        en: [
          'EU AI Act tailwind for compliance-first AI startups.',
          'Belgian fintech licence already in flight = strong.',
          'No tailwind, generic timing = average.',
        ],
        nl: [
          'EU AI Act-meewind voor compliance-first AI startups.',
          'Belgische fintech-vergunning al in proces = sterk.',
          'Geen meewind, generieke timing = gemiddeld.',
        ],
      },
      options: [
        {
          level: 'none',
          label: { en: 'Headwinds (regulatory, timing).', nl: 'Tegenwind (regulering, timing).' },
        },
        {
          level: 'basic',
          label: { en: 'Neutral environment.', nl: 'Neutrale omgeving.' },
        },
        {
          level: 'strong',
          label: {
            en: 'One clear tailwind (regulation, timing, brand).',
            nl: 'Eén duidelijke meewind (regulering, timing, merk).',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Multiple compounding tailwinds.',
            nl: 'Meerdere stapelende meewinden.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Name the tailwind or moat-adjacent advantage (e.g. "EU AI Act tailwind, BE AI grant approved").',
        nl: 'Noem de meewind of moat-adjacent voordeel (bv. "EU AI Act-meewind, BE AI-subsidie goedgekeurd").',
      },
    },
  }

export const STUDIO_MILESTONES: Record<StudioMilestoneKey, MilestoneCopy> = {
  ...BERKUS_MILESTONES,
  ...SCORECARD_FACTORS,
}

/** Localised label resolver — keeps cards locale-aware in one place. */
export function getMilestoneCopy(
  key: StudioMilestoneKey,
  locale: StudioLocale
): {
  title: string
  subtitle: string
  why: string
  examples: string[]
  options: { level: MaturityLevel; label: string }[]
  evidencePrompt: string
} {
  const m = STUDIO_MILESTONES[key]
  return {
    title: m.title[locale],
    subtitle: m.subtitle[locale],
    why: m.why[locale],
    examples: m.examples[locale],
    options: m.options.map((o) => ({ level: o.level, label: o.label[locale] })),
    evidencePrompt: m.evidencePrompt[locale],
  }
}
