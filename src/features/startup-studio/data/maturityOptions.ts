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

export type StudioLocale = 'en' | 'nl' | 'fr'

export interface MaturityOption {
  level: MaturityLevel
  /** Bilingual statement that describes the level in concrete terms. */
  label: { en: string; nl: string; fr: string }
}

export interface MilestoneCopy {
  /** Wizard card title. */
  title: { en: string; nl: string; fr: string }
  /** One-line subtitle that reminds founders what investors look for. */
  subtitle: { en: string; nl: string; fr: string }
  /** "Why this matters" explanation, expandable. */
  why: { en: string; nl: string; fr: string }
  /** Concrete Benelux examples (3 lines, bilingual). */
  examples: { en: string[]; nl: string[]; fr: string[] }
  /** The four maturity options, ordered low → high. */
  options: MaturityOption[]
  /**
   * What evidence to type into the free-text box.  Becomes the
   * placeholder + investor-justification sentence in the report.
   */
  evidencePrompt: { en: string; nl: string; fr: string }
}

// ---------------------------------------------------------------------------
// Berkus 2.0 — five risk-reduction milestones.
// ---------------------------------------------------------------------------

export const BERKUS_MILESTONES: Record<StudioBerkusKey, MilestoneCopy> = {
  sound_idea: {
    title: { en: 'Idea & problem-solution fit', nl: 'Idee & probleem-oplossing fit', fr: 'Idée et adéquation problème-solution' },
    subtitle: {
      en: 'Defendable problem with proof of demand',
      nl: 'Verdedigbaar probleem met aantoonbare vraag',
      fr: 'Problème défendable avec preuve de demande',
    },
    why: {
      en: 'Berkus rewards a clear, painful problem with evidence that customers actually want a solution. LOIs, waitlists, customer interviews and quantified pain all count.',
      nl: 'Berkus beloont een helder, pijnlijk probleem met bewijs dat klanten echt een oplossing willen. LOIs, wachtlijsten, klantinterviews en gekwantificeerde pijn tellen allemaal mee.',
      fr: 'Berkus récompense un problème évident et douloureux en démontrant que les clients souhaitent réellement une solution. Les lettres d’intention, les listes d’attente, les entretiens avec les clients et les difficultés quantifiées comptent tous.',
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
      fr: [
        'Showpad - une douleur claire en matière d\'aide à la vente B2B validée avec plus de 30 entretiens avant tout code.',
        'Henchman — Legal-tech belge : 12 lettres d\'intention de cabinets d\'avocats avant MVP.',
        'Sortlist - a quantifié X € de difficulté d\'approvisionnement dans l\'approvisionnement en services marketing.',
      ],
    },
    options: [
      {
        level: 'none',
        label: {
          en: 'Just an idea — no customer conversations yet.',
          nl: 'Alleen een idee — nog geen klantgesprekken.',
          fr: 'Juste une idée – pas encore de conversations avec les clients.',
        },
      },
      {
        level: 'basic',
        label: {
          en: '20+ interviews + written demand signals (LOIs, waitlist, surveys).',
          nl: '20+ interviews + schriftelijke vraagsignalen (LOIs, wachtlijst, surveys).',
          fr: 'Plus de 20 entretiens + signaux de demande écrits (LOI, liste d\'attente, enquêtes).',
        },
      },
      {
        level: 'strong',
        label: {
          en: '100–1,000 free users — first paying customers in the pipeline.',
          nl: '100–1.000 gratis gebruikers — eerste betalende klanten in de pijplijn.',
          fr: '100 à 1 000 utilisateurs gratuits – premiers clients payants en préparation.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Quantified ROI per customer + paid pre-orders or signed pilots.',
          nl: 'Gekwantificeerde ROI per klant + betaalde pre-orders of getekende pilots.',
          fr: 'ROI quantifié par client + précommandes payantes ou pilotes signés.',
        },
      },
    ],
    evidencePrompt: {
      en: 'Cite the strongest demand signal you have (e.g. "1,200 waitlist sign-ups + 8 paid pilots in Q4 2025").',
      nl: 'Noem het sterkste vraagsignaal dat je hebt (bv. "1.200 wachtlijst-aanmeldingen + 8 betaalde pilots in Q4 2025").',
      fr: 'Citez le signal de demande le plus fort dont vous disposez (par exemple « 1 200 inscriptions sur liste d\'attente + 8 pilotes rémunérés au quatrième trimestre 2025 »).',
    },
  },

  prototype_status: {
    title: { en: 'Prototype / MVP', nl: 'Prototype / MVP', fr: 'Prototype / MVP' },
    subtitle: {
      en: 'Working tech that removes core technical risk',
      nl: 'Werkende tech die kerntechnisch risico wegneemt',
      fr: 'Une technologie fonctionnelle qui élimine les principaux risques techniques',
    },
    why: {
      en: 'A demoable MVP — not a Figma — proves you can build it. Live customers using it weekly is the gold standard at pre-seed.',
      nl: 'Een demoable MVP — geen Figma — bewijst dat je het kunt bouwen. Live klanten die er wekelijks mee werken is de gouden standaard bij pre-seed.',
      fr: 'Un MVP démontable – pas un Figma – prouve que vous pouvez le construire. Les clients en direct qui l\'utilisent chaque semaine sont la référence en matière de pré-amorçage.',
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
      fr: [
        'Theodo Apps — prototype interactif sur TestFlight, utilisé chaque semaine par 50 partenaires de conception.',
        'Aikido Security – module SAST open source déployable en <5 minutes.',
        'Henchman – Complément Word bêta avec 3 cabinets d’avocats payants.',
      ],
    },
    options: [
      {
        level: 'none',
        label: { en: 'Concept only — no build yet.', nl: 'Alleen concept — nog niets gebouwd.', fr: 'Concept uniquement – ​​pas encore de construction.' },
      },
      {
        level: 'basic',
        label: {
          en: 'Clickable prototype (Figma/no-code) demoable in person.',
          nl: 'Klikbaar prototype (Figma/no-code) live demoable.',
          fr: 'Prototype cliquable (Figma/no-code) démontrable en personne.',
        },
      },
      {
        level: 'strong',
        label: {
          en: 'Working MVP with 5+ design partners using it weekly.',
          nl: 'Werkende MVP met 5+ design partners die er wekelijks mee werken.',
          fr: 'Travailler MVP avec plus de 5 partenaires de conception qui l\'utilisent chaque semaine.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Production-grade MVP, multi-tenant, paying users.',
          nl: 'Productie-MVP, multi-tenant, betalende gebruikers.',
          fr: 'MVP de qualité production, multi-locataires et utilisateurs payants.',
        },
      },
    ],
    evidencePrompt: {
      en: 'Describe what works today (e.g. "iOS app live in TestFlight, 80 weekly active users").',
      nl: 'Beschrijf wat vandaag werkt (bv. "iOS app live in TestFlight, 80 wekelijks actieve gebruikers").',
      fr: 'Décrivez ce qui fonctionne aujourd\'hui (par exemple "Application iOS en direct dans TestFlight, 80 utilisateurs actifs par semaine").',
    },
  },

  management_strength: {
    title: { en: 'Founding team', nl: 'Founderteam', fr: 'Équipe fondatrice' },
    subtitle: {
      en: 'Founder–market fit and proven execution',
      nl: 'Founder-market fit en bewezen executiekracht',
      fr: 'Adaptation du fondateur au marché et exécution éprouvée',
    },
    why: {
      en: 'Investors back people first at pre-seed. Complete teams (tech + commercial), domain expertise, and prior shipping history compound trust.',
      nl: 'Investeerders steken eerst geld in mensen bij pre-seed. Complete teams (tech + commercial), domeinexpertise en eerder shipping-track-record stapelen vertrouwen op.',
      fr: 'Les investisseurs soutiennent d’abord les gens dès le pré-amorçage. Des équipes complètes (technologiques + commerciales), une expertise dans le domaine et un historique d\'expédition antérieur renforcent la confiance.',
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
      fr: [
        'Showpad – les co-fondateurs avaient construit et vendu ensemble un précédent SaaS.',
        'Aïkido — fondateurs ex-Teamleader, ex-AppTweak : sécurité profonde + domaine GTM.',
        'Sortlist – le fondateur solo a démarré à 1 M € ARR avant de lever.',
      ],
    },
    options: [
      {
        level: 'none',
        label: {
          en: 'Solo founder, no co-founder yet.',
          nl: 'Solo founder, nog geen co-founder.',
          fr: 'Fondateur solo, pas encore co-fondateur.',
        },
      },
      {
        level: 'basic',
        label: {
          en: 'Complete founding team (tech + commercial).',
          nl: 'Complete founding team (tech + commercial).',
          fr: 'Équipe fondatrice complète (tech + commercial).',
        },
      },
      {
        level: 'strong',
        label: {
          en: 'Founders with 5+ yrs deep domain expertise in this market.',
          nl: 'Founders met 5+ jaar diepe domeinexpertise in deze markt.',
          fr: 'Fondateurs avec plus de 5 ans d’expertise approfondie dans ce domaine.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Serial founders with prior successful exits.',
          nl: 'Serial founders met eerdere succesvolle exits.',
          fr: 'Fondateurs en série avec des sorties réussies antérieures.',
        },
      },
    ],
    evidencePrompt: {
      en: 'List the team and the most relevant credential per founder (e.g. "CTO ex-Aikido, 8 yrs in security").',
      nl: 'Som het team op met de sterkste credential per founder (bv. "CTO ex-Aikido, 8 jr security").',
      fr: 'Répertoriez l\'équipe et les informations d\'identification les plus pertinentes par fondateur (par exemple "CTO ex-Aïkido, 8 ans en sécurité").',
    },
  },

  strategic_relationships: {
    title: { en: 'Strategic relationships', nl: 'Strategische relaties', fr: 'Relations stratégiques' },
    subtitle: {
      en: 'Signed LOIs, design partners, distribution deals',
      nl: 'Getekende LOIs, design partners, distributiedeals',
      fr: 'Lettres d\'intention signées, partenaires de conception, accords de distribution',
    },
    why: {
      en: 'Distribution > product at pre-seed. Signed letters of intent, design partners with real budget, and channel partners de-risk go-to-market for investors.',
      nl: 'Distributie > product bij pre-seed. Getekende LOIs, design partners met echte budgetten en kanaalpartners verlagen het GTM-risico voor investeerders.',
      fr: 'Distribution > produit en pré-amorçage. Des lettres d\'intention signées, des partenaires de conception dotés d\'un budget réel et des partenaires de distribution réduisent les risques de mise sur le marché pour les investisseurs.',
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
      fr: [
        'Homme de main – Allen & Overy en tant que pilote rémunéré, a signé une lettre d\'intention pour le déploiement.',
        'Aikido – répertorié sur Atlassian Marketplace jour 1.',
        'Theodo — partenariat de distribution avec le pré-lancement Imec.istart.',
      ],
    },
    options: [
      {
        level: 'none',
        label: { en: 'No partners or LOIs yet.', nl: 'Nog geen partners of LOIs.', fr: 'Pas de partenaires ni de lettres d\'intention pour l\'instant.' },
      },
      {
        level: 'basic',
        label: {
          en: '1–2 informal design partners or named pilot conversations (no contract).',
          nl: '1–2 informele design partners of pilot-gesprekken (geen contract).',
          fr: '1 à 2 partenaires de conception informels ou conversations pilotes nommées (pas de contrat).',
        },
      },
      {
        level: 'strong',
        label: {
          en: '3+ signed LOIs or paid design partners with named enterprise pilots.',
          nl: '3+ getekende LOIs of betaalde design partners met benoemde enterprise-pilots.',
          fr: 'Plus de 3 lettres d\'intention signées ou partenaires de conception payants avec des pilotes d\'entreprise nommés.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: 'Channel partnership / marketplace listing live with revenue from named accounts.',
          nl: 'Kanaalpartnerschap of marketplace-listing live, met omzet uit benoemde accounts.',
          fr: 'Partenariat de distribution / liste de places de marché en direct avec les revenus des comptes nommés.',
        },
      },
    ],
    evidencePrompt: {
      en: 'Name the partners and the commercial commitment (e.g. "3 LOIs from Belfius, KBC, Argenta").',
      nl: 'Noem de partners en de commerciële commitment (bv. "3 LOIs van Belfius, KBC, Argenta").',
      fr: 'Nommez les partenaires et l\'engagement commercial (par exemple "3 LOI de Belfius, KBC, Argenta").',
    },
  },

  product_rollout: {
    title: { en: 'Rollout & first revenue', nl: 'Uitrol & eerste omzet', fr: 'Déploiement et premiers revenus' },
    subtitle: {
      en: 'Live customers, paid pilots or first ARR',
      nl: 'Live klanten, betaalde pilots of eerste ARR',
      fr: 'Clients réels, pilotes payants ou premier ARR',
    },
    why: {
      en: 'Even small revenue is a step-change in valuation: it proves willingness to pay. Anything north of €1k MRR materially de-risks the round.',
      nl: 'Zelfs kleine omzet is een sprong in waardering: het bewijst betalingsbereidheid. Alles boven €1k MRR vermindert het risico van de ronde aanzienlijk.',
      fr: 'Même un petit revenu constitue un changement radical dans la valorisation : il prouve la volonté de payer. Tout ce qui se situe au-dessus de 1 000 € MRR réduit considérablement les risques du tour.',
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
      fr: [
        'Homme de main – 5 000 € MRR de 3 cabinets d’avocats payants avant l’amorçage.',
        'Liste de tri – 15 000 € MRR amorcés avant le premier tour.',
        'Theodo Apps — 12 pilotes rémunérés à 500 €/mois à la clôture du pré-amorçage.',
      ],
    },
    options: [
      {
        level: 'none',
        label: { en: 'No revenue, no live customers.', nl: 'Geen omzet, geen live klanten.', fr: 'Pas de revenus, pas de clients en direct.' },
      },
      {
        level: 'basic',
        label: {
          en: 'Free pilots running with 3+ users.',
          nl: 'Gratis pilots lopen met 3+ gebruikers.',
          fr: 'Pilotes gratuits fonctionnant avec 3+ utilisateurs.',
        },
      },
      {
        level: 'strong',
        label: {
          en: 'Paid pilots — €1k–€10k MRR or one big-ticket pilot.',
          nl: 'Betaalde pilots — €1k–€10k MRR of één big-ticket pilot.',
          fr: 'Pilotes rémunérés – 1 000 € à 10 000 € MRR ou un pilote coûteux.',
        },
      },
      {
        level: 'exceptional',
        label: {
          en: '€10k+ MRR with retention proof (>2 months).',
          nl: '€10k+ MRR met retentie-bewijs (>2 maanden).',
          fr: '10 000 €+ MRR avec preuve de rétention (>2 mois).',
        },
      },
    ],
    evidencePrompt: {
      en: 'Quantify revenue and the retention story (e.g. "€8k MRR, all 5 pilots renewed").',
      nl: 'Kwantificeer omzet en het retentieverhaal (bv. "€8k MRR, alle 5 pilots verlengd").',
      fr: 'Quantifiez les revenus et l\'historique de fidélisation (par exemple « 8 000 € de MRR, les 5 pilotes renouvelés »).',
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
        fr: 'Opportunité de marché (taille et croissance)',
      },
      subtitle: {
        en: 'TAM, growth rate, and how much of it you can credibly capture',
        nl: 'TAM, groei, en hoeveel je geloofwaardig kunt veroveren',
        fr: 'TAM, taux de croissance et quantité que vous pouvez capturer de manière crédible',
      },
      why: {
        en: 'Bill Payne 2024: a defensible €1B+ TAM with double-digit growth tilts the Scorecard up by 25–30%. Smaller TAMs tilt it down sharply.',
        nl: 'Bill Payne 2024: een verdedigbare €1B+ TAM met dubbele-cijfer groei tilt de Scorecard 25–30% omhoog. Kleinere TAMs trekken hem scherp omlaag.',
        fr: 'Bill Payne 2024 : un TAM défendable de plus d\'un milliard d\'euros avec une croissance à deux chiffres fait grimper le tableau de bord de 25 à 30 %. Les TAM plus petits l\'inclinent fortement vers le bas.',
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
        fr: [
          'Technologie juridique européenne : ~ 8 milliards d\'euros de TAM en croissance de 12 % – forte.',
          'SaaS logistique uniquement belge : ~80 M€ TAM — en dessous de la moyenne.',
          'Outils d\'IA B2B mondiaux : 30 milliards d\'euros + TAM – exceptionnel.',
        ],
      },
      options: [
        {
          level: 'none',
          label: {
            en: 'Niche market — TAM <€100M, flat growth.',
            nl: 'Nichemarkt — TAM <€100M, vlakke groei.',
            fr: 'Marché de niche — TAM < 100 M€, croissance stable.',
          },
        },
        {
          level: 'basic',
          label: {
            en: 'Regional market — TAM €100M–€1B, single-digit growth.',
            nl: 'Regionale markt — TAM €100M–€1B, enkele-cijfer groei.',
            fr: 'Marché régional — TAM 100 M€ – 1 Md€, croissance à un chiffre.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'European market — TAM €1B+, double-digit growth.',
            nl: 'Europese markt — TAM €1B+, dubbele-cijfer groei.',
            fr: 'Marché européen — TAM 1 Md€+, croissance à deux chiffres.',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Global category-defining market — TAM €10B+, 20%+ growth.',
            nl: 'Wereldwijde category-defining markt — TAM €10B+, 20%+ groei.',
            fr: 'Marché mondial définissant la catégorie – TAM 10 milliards d\'euros +, croissance de plus de 20 %.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Quote your TAM source and growth rate (e.g. "Gartner 2025: €8B legal-tech, 12% YoY").',
        nl: 'Citeer je TAM-bron en groei (bv. "Gartner 2025: €8B legal-tech, 12% YoY").',
        fr: 'Citez votre source TAM et votre taux de croissance (par exemple « Gartner 2025 : 8 milliards d\'euros de technologie juridique, 12 % en glissement annuel »).',
      },
    },

    competitive_environment: {
      weight_pct: 15,
      title: { en: 'Competitive environment', nl: 'Concurrentieomgeving', fr: 'Environnement compétitif' },
      subtitle: {
        en: 'Defensibility, IP, switching costs',
        nl: 'Verdedigbaarheid, IP, switching costs',
        fr: 'Défense, propriété intellectuelle, coûts de changement',
      },
      why: {
        en: 'A defensible moat (proprietary data, deep integrations, network effects, IP) increases the Scorecard. Crowded markets with no moat decrease it.',
        nl: 'Een verdedigbare moat (proprietary data, diepe integraties, netwerkeffecten, IP) verhoogt de Scorecard. Drukke markten zonder moat verlagen hem.',
        fr: 'Un fossé défendable (données propriétaires, intégrations profondes, effets de réseau, IP) augmente le scorecard. Les marchés bondés et sans fossé la diminuent.',
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
        fr: [
          'Aikido — distribution open source + intégration étroite d\'Atlassian.',
          'Henchman – ensemble de données de clauses contractuelles exclusives.',
          'Clone générique du CRM en 2026 – saturé, sans fossé.',
        ],
      },
      options: [
        {
          level: 'none',
          label: {
            en: 'Crowded market with strong incumbents and no obvious moat.',
            nl: 'Drukke markt met sterke incumbents en geen duidelijke moat.',
            fr: 'Marché encombré avec des opérateurs historiques puissants et sans fossé évident.',
          },
        },
        {
          level: 'basic',
          label: {
            en: 'Some differentiation, weak moat.',
            nl: 'Enige differentiatie, zwakke moat.',
            fr: 'Une certaine différenciation, des fossés faibles.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'Defensible moat (data, integrations, distribution).',
            nl: 'Verdedigbare moat (data, integraties, distributie).',
            fr: 'Fossé défendable (données, intégrations, distribution).',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Strong IP / network effects / category creator.',
            nl: 'Sterke IP / netwerkeffecten / category creator.',
            fr: 'Fort IP/effets de réseau/créateur de catégorie.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Name your moat in one sentence (e.g. "exclusive data partnership with X covering 70% of market").',
        nl: 'Beschrijf je moat in één zin (bv. "exclusieve datapartner X dekt 70% van de markt").',
        fr: 'Nommez votre fossé en une phrase (par exemple « partenariat de données exclusif avec X couvrant 70 % du marché »).',
      },
    },

    sales_marketing_channels: {
      weight_pct: 25,
      title: { en: 'Go-to-market & partnerships', nl: 'Go-to-market & partnerschappen', fr: 'Mise sur le marché et partenariats' },
      subtitle: {
        en: 'Repeatable distribution and proof of CAC payback',
        nl: 'Herhaalbare distributie en bewijs van CAC payback',
        fr: 'Distribution reproductible et preuve de remboursement du CAC',
      },
      why: {
        en: 'Repeatable, low-CAC distribution is the #1 differentiator at seed. PLG, channel, marketplace listings, or community-led GTM all count.',
        nl: 'Herhaalbare, lage-CAC distributie is het #1 verschil bij seed. PLG, channel, marketplace listings of community-led GTM tellen allemaal.',
        fr: 'La distribution reproductible et à faible teneur en CAC est le différenciateur n°1 à la graine. PLG, chaînes, listes de marchés ou GTM dirigé par la communauté comptent tous.',
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
        fr: [
          'Aïkido — entonnoir open source : gratuit → plan d\'équipe en 14 jours.',
          'Linéaire : liste d\'attente gérée par la communauté avec 50 000 inscriptions.',
          'Pas d\'hypothèse GTM = en dessous de la moyenne.',
        ],
      },
      options: [
        {
          level: 'none',
          label: { en: 'No clear GTM hypothesis.', nl: 'Geen duidelijke GTM-hypothese.', fr: 'Aucune hypothèse GTM claire.' },
        },
        {
          level: 'basic',
          label: {
            en: 'One channel hypothesis being tested.',
            nl: 'Eén kanaal-hypothese wordt getest.',
            fr: 'Hypothèse d’un canal en cours de test.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'One repeatable channel with measurable CAC.',
            nl: 'Eén herhaalbaar kanaal met meetbare CAC.',
            fr: 'Un canal reproductible avec CAC mesurable.',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Two repeatable channels + payback period < 12 months.',
            nl: 'Twee herhaalbare kanalen + payback < 12 maanden.',
            fr: 'Deux canaux répétables + période de retour sur investissement < 12 mois.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Describe your strongest channel and CAC (e.g. "PLG, CAC €280, payback 4 months").',
        nl: 'Beschrijf je sterkste kanaal en CAC (bv. "PLG, CAC €280, payback 4 maanden").',
        fr: 'Décrivez votre canal le plus puissant et votre CAC (par exemple "PLG, CAC 280 €, retour sur investissement 4 mois").',
      },
    },

    need_for_additional_funding: {
      weight_pct: 15,
      title: { en: 'Capital efficiency', nl: 'Kapitaalefficiëntie', fr: 'Efficacité du capital' },
      subtitle: {
        en: 'Runway, burn discipline, and the path to default-alive',
        nl: 'Runway, burn-discipline en het pad naar default-alive',
        fr: 'Piste, discipline de brûlage et chemin vers la vie par défaut',
      },
      why: {
        en: '2026 funding climate: investors penalise teams that need 3+ rounds to break even. Capital-efficient growth (low burn, default-alive within 24 months) is rewarded.',
        nl: '2026 funding-klimaat: investeerders bestraffen teams die 3+ rondes nodig hebben om break-even te zijn. Kapitaal-efficiënte groei (lage burn, default-alive binnen 24 maanden) wordt beloond.',
        fr: 'Climat de financement 2026 : les investisseurs pénalisent les équipes qui ont besoin de plus de 3 tours pour atteindre le seuil de rentabilité. Une croissance efficace en capital (faible combustion, défaut de paiement dans les 24 mois) est récompensée.',
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
        fr: [
          'Aïkido — amorcé à 1 M€ ARR avec 0 € collecté.',
          'Homme de main – Augmentation de 1 M€ de l’objectif de 24 mois pour atteindre le seuil de rentabilité.',
          'Plan de brûlage intensif à plusieurs tours = inférieur à la moyenne en 2026.',
        ],
      },
      options: [
        {
          level: 'none',
          label: {
            en: 'Plan needs 3+ rounds to reach break-even.',
            nl: 'Plan vereist 3+ rondes naar break-even.',
            fr: 'Le plan a besoin de plus de 3 tours pour atteindre le seuil de rentabilité.',
          },
        },
        {
          level: 'basic',
          label: {
            en: 'This round + Series A path to break-even.',
            nl: 'Deze ronde + Series A-pad naar break-even.',
            fr: 'Ce tour + Série A chemin vers le seuil de rentabilité.',
          },
        },
        {
          level: 'strong',
          label: {
            en: 'This round = 24 months runway, break-even in sight.',
            nl: 'Deze ronde = 24 maanden runway, break-even in zicht.',
            fr: 'Ce cycle = 24 mois de piste, seuil de rentabilité en vue.',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Default-alive — this round buys optionality, not survival.',
            nl: 'Default-alive — deze ronde koopt optionaliteit, geen overleven.',
            fr: 'Vivant par défaut : ce cycle achète des options, pas la survie.',
          },
        },
      ],
      evidencePrompt: {
        en: 'State runway and break-even target (e.g. "24 months runway, break-even Q4 2027").',
        nl: 'Geef runway en break-even target (bv. "24 maanden runway, break-even Q4 2027").',
        fr: 'Indiquer la piste et l\'objectif d\'équilibre (par exemple « piste de 24 mois, seuil de rentabilité au quatrième trimestre 2027 »).',
      },
    },

    other_factors: {
      weight_pct: 15,
      title: { en: 'Other defensibility factors', nl: 'Overige defensibility-factoren', fr: 'Autres facteurs de défense' },
      subtitle: {
        en: 'Regulation, geography, timing, brand',
        nl: 'Regulering, geografie, timing, merk',
        fr: 'Réglementation, géographie, timing, marque',
      },
      why: {
        en: 'Catch-all for everything not in the other factors: regulatory advantages, geography, timing, brand, customer love, NPS, talent magnet status.',
        nl: 'Verzamelbak voor alles wat niet in de andere factoren past: regulatorische voordelen, geografie, timing, merk, klantliefde, NPS, talent magnet.',
        fr: 'Un fourre-tout qui ne tient pas compte des autres facteurs : avantages réglementaires, géographie, timing, marque, amour des clients, NPS, statut d\'aimant à talents.',
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
        fr: [
          'L’EU AI Act est favorable aux startups d’IA axées sur la conformité.',
          'Licence fintech belge déjà en vol = fort.',
          'Pas de vent arrière, timing générique = moyen.',
        ],
      },
      options: [
        {
          level: 'none',
          label: { en: 'Headwinds (regulatory, timing).', nl: 'Tegenwind (regulering, timing).', fr: 'Vents contraires (réglementaire, timing).' },
        },
        {
          level: 'basic',
          label: { en: 'Neutral environment.', nl: 'Neutrale omgeving.', fr: 'Environnement neutre.' },
        },
        {
          level: 'strong',
          label: {
            en: 'One clear tailwind (regulation, timing, brand).',
            nl: 'Eén duidelijke meewind (regulering, timing, merk).',
            fr: 'Un vent favorable clair (réglementation, timing, marque).',
          },
        },
        {
          level: 'exceptional',
          label: {
            en: 'Multiple compounding tailwinds.',
            nl: 'Meerdere stapelende meewinden.',
            fr: 'Plusieurs vents favorables cumulatifs.',
          },
        },
      ],
      evidencePrompt: {
        en: 'Name the tailwind or moat-adjacent advantage (e.g. "EU AI Act tailwind, BE AI grant approved").',
        nl: 'Noem de meewind of moat-adjacent voordeel (bv. "EU AI Act-meewind, BE AI-subsidie goedgekeurd").',
        fr: 'Nommez le vent arrière ou l’avantage adjacent aux douves (par exemple « vent arrière de la loi européenne sur l’IA, subvention BE AI approuvée »).',
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
