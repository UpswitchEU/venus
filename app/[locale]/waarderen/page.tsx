import type { Metadata } from 'next'
import Link from 'next/link'
import {
  UPSWITCH_BRAND_OG_IMAGE,
  UPSWITCH_BRAND_TWITTER_IMAGE,
} from '../../../src/lib/brand-og-image'

export const dynamic = 'force-static'

interface Props {
  params: Promise<{ locale: string }>
}

type PageLocale = 'en' | 'nl' | 'fr'

const GHENT_PARTNERS = [
  'imec.istart',
  'Start it @KBC Ghent',
  'UGent TTO',
  'Volta Ventures',
  'BAN Vlaanderen',
  'The Beacon',
]

const PAGE_COPY = {
  en: {
    meta: {
      title: 'Startup Valuation — Upswitch · Free pre-revenue valuation',
      description:
        'Build an investor-ready startup valuation in 7 minutes. Berkus + Scorecard + VC method, Q1 2026 Benelux benchmarks, no historical financials required.',
    },
    eyebrow: 'Startup valuation engine · Q1 2026',
    headline: 'Investor-ready startup valuation in 7 minutes.',
    intro:
      'Berkus, Scorecard and the VC method in one wizard. No historical financials, no abstract sliders, no guesswork. Just a PDF your angel or investor can take seriously.',
    primaryCta: 'Start free valuation',
    secondaryCta: 'Classic flow (advisors)',
    trustLine: 'No credit card · No account required for the first run · GDPR-compliant',
    partnerHeading: 'Used by Ghent founders and partners',
    featuresHeading: 'Why this is better than another spreadsheet',
    features: [
      {
        title: 'No guesswork',
        body: 'Milestone cards with 4 evidence-based options — choose what best matches your reality and see the pre-money impact immediately.',
      },
      {
        title: 'Live valuation',
        body: 'A 3-leg blend (Berkus + SaaS Forward + VC method) updates live in the receipt — no more “click to calculate”.',
      },
      {
        title: 'Investor-ready PDF',
        body: 'Exit narrative, method-by-method football field, cap-table preview and all your evidence — ready to share with angels.',
      },
      {
        title: 'Q1 2026 Benelux benchmarks',
        body: 'Live benchmark data from PitchBook and Dealroom. The engine moves with the market — no stale 2024 numbers.',
      },
    ],
    stepsHeading: '7 steps, 7 minutes',
    stepsIntro:
      'One card per step, one evidence field to support your answer. The live receipt shows how every choice moves the valuation.',
    stepLabel: 'Step',
    steps: [
      { n: '1', title: 'Profile', body: 'Stage, sector, round size and one-line pitch.' },
      { n: '2', title: 'Risk reduction', body: '5 milestone cards (Berkus 2024).' },
      { n: '3', title: 'Defensibility', body: '5 weighted Bill Payne factors.' },
      { n: '4', title: 'Traction', body: 'MRR toggle with live unit economics.' },
      { n: '5', title: 'Exit story', body: 'TAM/SAM/SOM and growth curve.' },
      { n: '6', title: 'Round simulator', body: 'SAFE or priced round, live cap table.' },
      { n: '7', title: 'Report', body: 'PDF + share link, ready for your angels.' },
    ],
    methodologyHeading: 'Methodology',
    methodology: [
      {
        title: 'Berkus 2024 refresh',
        body: 'Risk-reduction scorecard with regionally adjusted caps (€500k-€750k per milestone in BE/NL/LU).',
      },
      {
        title: 'Bill Payne Scorecard 2024',
        body: 'Five weighted factors anchored to the regional benchmark median.',
      },
      {
        title: 'VC method (Sahlman)',
        body: 'pre = (Y5 revenue × exit multiple ÷ target ROI) − round size.',
      },
    ],
    sources:
      'Sources: PitchBook Q4 2025, Dealroom Benelux 2025, Atomico State of European Tech 2025.',
    finalHeading: 'Ready to build your valuation?',
    finalBody: '7 minutes. A PDF that holds up. A different conversation with your angel.',
    finalCta: 'Start free →',
  },
  nl: {
    meta: {
      title: 'Startup waarderen — Upswitch · Gratis pre-revenue valuation',
      description:
        'In 7 minuten een investor-ready waardering voor je startup. Berkus + Scorecard + VC-methode, Q1 2026 Benelux benchmarks, geen historische cijfers nodig.',
    },
    eyebrow: 'Startup Waarderingsmotor · Q1 2026',
    headline: 'Een investor-ready waardering voor je startup — in 7 minuten.',
    intro:
      'Berkus, Scorecard en de VC-methode in één wizard. Geen historische cijfers nodig, geen abstracte schuiven, geen natte vinger. Wel: een PDF die je angel of investeerder serieus neemt.',
    primaryCta: 'Start gratis waardering',
    secondaryCta: 'Klassieke flow (advisors)',
    trustLine: 'Geen credit card · Geen account vereist voor de eerste run · GDPR-compliant',
    partnerHeading: 'In gebruik bij Gentse founders en partners',
    featuresHeading: 'Waarom anders dan dat ene Excel-sheet?',
    features: [
      {
        title: 'Geen natte vinger',
        body: 'Mijlpaal-kaarten met 4 evidence-based opties — kies wat het dichtst bij je realiteit ligt en zie meteen de impact op de pre-money.',
      },
      {
        title: 'Live waardering',
        body: '3-leg blend (Berkus + SaaS Forward + VC-methode) live in een rechter receipt — geen "klik om te berekenen" meer.',
      },
      {
        title: 'Investor-ready PDF',
        body: 'Exit-narratief, football field per methode, cap-tabel preview en al je evidence — klaar om te delen met angels.',
      },
      {
        title: 'Q1 2026 Benelux benchmarks',
        body: 'Live benchmarkdata uit PitchBook en Dealroom. De motor leert mee met de markt — geen 2024-cijfers meer.',
      },
    ],
    stepsHeading: '7 stappen, 7 minuten',
    stepsIntro:
      'Eén kaart per stap, één evidence-veld om je antwoord te onderbouwen. Live receipt rechts laat je zien hoe elke keuze de waardering verschuift.',
    stepLabel: 'Stap',
    steps: [
      { n: '1', title: 'Profiel', body: 'Stage, sector, ronde-grootte, ééntje pitch.' },
      { n: '2', title: 'Risico-reductie', body: '5 mijlpaal-kaarten (Berkus 2024).' },
      { n: '3', title: 'Defensibility', body: '5 gewogen Bill Payne factoren.' },
      { n: '4', title: 'Tractie', body: 'MRR-toggle met live unit-economics.' },
      { n: '5', title: 'Exit-verhaal', body: 'TAM/SAM/SOM en groeicurve.' },
      { n: '6', title: 'Ronde simulator', body: 'SAFE of priced round, live cap-tabel.' },
      { n: '7', title: 'Rapport', body: 'PDF + deelbare link, klaar voor je angels.' },
    ],
    methodologyHeading: 'Methodologie',
    methodology: [
      {
        title: 'Berkus 2024 refresh',
        body: 'Risico-reductie scorecard met regionaal aangepaste caps (€500k-€750k per mijlpaal in BE/NL/LU).',
      },
      {
        title: 'Bill Payne Scorecard 2024',
        body: 'Vijf gewogen factoren verankerd op de regionale benchmarkmediaan.',
      },
      {
        title: 'VC-methode (Sahlman)',
        body: 'pre = (Y5 omzet × exit-multiple ÷ target ROI) − rondegrootte.',
      },
    ],
    sources:
      'Bronnen: PitchBook Q4 2025, Dealroom Benelux 2025, Atomico State of European Tech 2025.',
    finalHeading: 'Klaar om je waardering te bouwen?',
    finalBody: '7 minuten. Een PDF die staat. Een gesprek met je angel dat anders verloopt.',
    finalCta: 'Start gratis →',
  },
  fr: {
    meta: {
      title: 'Valoriser une startup — Upswitch · Valorisation pré-revenus gratuite',
      description:
        'En 7 minutes, créez une valorisation de startup prête pour les investisseurs. Méthodes Berkus, Scorecard et VC, benchmarks Benelux T1 2026, sans historiques financiers requis.',
    },
    eyebrow: 'Moteur de valorisation startup · T1 2026',
    headline: 'Une valorisation de startup prête pour les investisseurs en 7 minutes.',
    intro:
      'Berkus, Scorecard et méthode VC dans un seul assistant. Pas d’historiques financiers, pas de curseurs abstraits, pas d’approximation. Juste un PDF que votre angel ou investisseur peut prendre au sérieux.',
    primaryCta: 'Démarrer la valorisation gratuite',
    secondaryCta: 'Flux classique (conseillers)',
    trustLine: 'Sans carte bancaire · Aucun compte requis pour le premier essai · Conforme au RGPD',
    partnerHeading: 'Utilisé par des fondateurs et partenaires gantois',
    featuresHeading: 'Pourquoi c’est mieux qu’un autre tableur',
    features: [
      {
        title: 'Pas d’approximation',
        body: 'Des cartes jalons avec 4 options fondées sur des preuves — choisissez ce qui correspond le mieux à votre réalité et voyez immédiatement l’impact sur le pre-money.',
      },
      {
        title: 'Valorisation en direct',
        body: 'Un mélange en 3 volets (Berkus + SaaS Forward + méthode VC) se met à jour en direct dans le récapitulatif — plus besoin de “cliquer pour calculer”.',
      },
      {
        title: 'PDF prêt pour les investisseurs',
        body: 'Narratif de sortie, football field méthode par méthode, aperçu de cap table et toutes vos preuves — prêt à partager avec des angels.',
      },
      {
        title: 'Benchmarks Benelux T1 2026',
        body: 'Données benchmark en direct issues de PitchBook et Dealroom. Le moteur suit le marché — plus de chiffres 2024 périmés.',
      },
    ],
    stepsHeading: '7 étapes, 7 minutes',
    stepsIntro:
      'Une carte par étape, un champ de preuve pour soutenir votre réponse. Le récapitulatif en direct montre comment chaque choix déplace la valorisation.',
    stepLabel: 'Étape',
    steps: [
      { n: '1', title: 'Profil', body: 'Stade, secteur, taille du tour et pitch en une ligne.' },
      { n: '2', title: 'Réduction du risque', body: '5 cartes jalons (Berkus 2024).' },
      { n: '3', title: 'Défendabilité', body: '5 facteurs Bill Payne pondérés.' },
      { n: '4', title: 'Traction', body: 'Option MRR avec unit economics en direct.' },
      { n: '5', title: 'Histoire de sortie', body: 'TAM/SAM/SOM et courbe de croissance.' },
      { n: '6', title: 'Simulateur de tour', body: 'SAFE ou tour pricé, cap table en direct.' },
      { n: '7', title: 'Rapport', body: 'PDF + lien de partage, prêt pour vos angels.' },
    ],
    methodologyHeading: 'Méthodologie',
    methodology: [
      {
        title: 'Mise à jour Berkus 2024',
        body: 'Scorecard de réduction du risque avec plafonds ajustés régionalement (500 k€-750 k€ par jalon en BE/NL/LU).',
      },
      {
        title: 'Scorecard Bill Payne 2024',
        body: 'Cinq facteurs pondérés ancrés sur la médiane benchmark régionale.',
      },
      {
        title: 'Méthode VC (Sahlman)',
        body: 'pre = (revenu Y5 × multiple de sortie ÷ ROI cible) − taille du tour.',
      },
    ],
    sources:
      'Sources : PitchBook T4 2025, Dealroom Benelux 2025, Atomico State of European Tech 2025.',
    finalHeading: 'Prêt à construire votre valorisation ?',
    finalBody: '7 minutes. Un PDF solide. Une conversation différente avec votre angel.',
    finalCta: 'Démarrer gratuitement →',
  },
} as const

function pickLocale(raw: string | undefined): PageLocale {
  return raw === 'en' || raw === 'fr' ? raw : 'nl'
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params
  const locale = pickLocale(resolved.locale)
  const copy = PAGE_COPY[locale]

  return {
    title: copy.meta.title,
    description: copy.meta.description,
    alternates: {
      canonical: `/${locale}/waarderen`,
      languages: {
        en: '/en/waarderen',
        nl: '/nl/waarderen',
        fr: '/fr/waarderen',
      },
    },
    openGraph: {
      title: copy.meta.title,
      description: copy.meta.description,
      type: 'website',
      url: `/${locale}/waarderen`,
      locale: locale === 'en' ? 'en_BE' : locale === 'fr' ? 'fr_BE' : 'nl_BE',
      images: [UPSWITCH_BRAND_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.meta.title,
      description: copy.meta.description,
      images: [UPSWITCH_BRAND_TWITTER_IMAGE],
    },
  }
}

export default async function WaarderenLandingPage({ params }: Props) {
  const resolved = await params
  const locale = pickLocale(resolved.locale)
  const copy = PAGE_COPY[locale]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/[0.03]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16 lg:px-8 lg:py-24">
        {/* Hero */}
        <header className="text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
            {copy.eyebrow}
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-6xl">
            {copy.headline}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground/70">
            {copy.intro}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/${locale}/landing/startup`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 sm:w-auto"
            >
              {copy.primaryCta}
            </Link>
            <Link
              href={`/${locale}/reports/new?flow=startup&studio=legacy`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-foreground/15 bg-background px-6 py-3 text-sm font-medium text-foreground/80 transition hover:border-primary hover:text-primary sm:w-auto"
            >
              {copy.secondaryCta}
            </Link>
          </div>
          <p className="mt-4 text-xs text-foreground/55">{copy.trustLine}</p>
        </header>

        {/* Ghent social proof */}
        <section className="mt-20 rounded-2xl border border-foreground/10 bg-background/60 p-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-foreground/55">
            {copy.partnerHeading}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-foreground/70">
            {GHENT_PARTNERS.map((partner) => (
              <span key={partner} className="font-medium">
                {partner}
              </span>
            ))}
          </div>
        </section>

        {/* Features grid */}
        <section className="mt-20">
          <h2 className="text-center text-3xl font-semibold text-foreground">
            {copy.featuresHeading}
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {copy.features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-foreground/10 bg-background/60 p-6"
              >
                <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="mt-20">
          <h2 className="text-center text-3xl font-semibold text-foreground">
            {copy.stepsHeading}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-foreground/65">
            {copy.stepsIntro}
          </p>
          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {copy.steps.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-foreground/10 bg-background/60 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {copy.stepLabel} {s.n}
                </p>
                <h3 className="mt-1 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1 text-xs text-foreground/60">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Methodology trust */}
        <section className="mt-20 rounded-2xl border border-foreground/10 bg-background/60 p-8">
          <h2 className="text-2xl font-semibold text-foreground">{copy.methodologyHeading}</h2>
          <div className="mt-4 grid gap-6 text-sm text-foreground/70 md:grid-cols-3">
            {copy.methodology.map((item) => (
              <div key={item.title}>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="mt-1">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-foreground/45">{copy.sources}</p>
        </section>

        {/* Final CTA */}
        <section className="mt-20 text-center">
          <h2 className="text-3xl font-semibold text-foreground">{copy.finalHeading}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/65">{copy.finalBody}</p>
          <Link
            href={`/${locale}/landing/startup`}
            className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            {copy.finalCta}
          </Link>
        </section>
      </div>
    </div>
  )
}
