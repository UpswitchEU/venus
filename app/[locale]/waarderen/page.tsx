import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Startup waarderen — Upswitch · Gratis pre-revenue valuation',
  description:
    'In 7 minuten een investor-ready waardering voor je startup. Berkus + Scorecard + VC-methode, Q1 2026 Benelux benchmarks, geen historische cijfers nodig.',
  alternates: { canonical: '/nl/waarderen' },
}

interface Props {
  params: Promise<{ locale: string }>
}

const GHENT_PARTNERS = [
  'imec.istart',
  'Start it @KBC Ghent',
  'UGent TTO',
  'Volta Ventures',
  'BAN Vlaanderen',
  'The Beacon',
]

const FEATURES_NL = [
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
    body: 'Live data uit ons Athena MDM (PitchBook + Dealroom). De motor leert mee met de markt — geen 2024-cijfers meer.',
  },
]

const STEPS_NL = [
  { n: '1', title: 'Profiel', body: 'Stage, sector, ronde-grootte, ééntje pitch.' },
  { n: '2', title: 'Risico-reductie', body: '5 mijlpaal-kaarten (Berkus 2024).' },
  { n: '3', title: 'Defensibility', body: '5 gewogen Bill Payne factoren.' },
  { n: '4', title: 'Tractie', body: 'MRR-toggle met live unit-economics.' },
  { n: '5', title: 'Exit-verhaal', body: 'TAM/SAM/SOM en groeicurve.' },
  { n: '6', title: 'Ronde simulator', body: 'SAFE of priced round, live cap-tabel.' },
  { n: '7', title: 'Rapport', body: 'PDF + deelbare link, klaar voor je angels.' },
]

export default async function WaarderenLandingPage({ params }: Props) {
  let locale: 'en' | 'nl' = 'nl'
  try {
    const resolved = await params
    locale = resolved.locale === 'en' ? 'en' : 'nl'
  } catch {
    // default nl
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/[0.03]">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
        {/* Hero */}
        <header className="text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
            Startup Waarderingsmotor · Q1 2026
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground lg:text-6xl">
            Een investor-ready waardering voor je startup — in 7 minuten.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground/70">
            Berkus, Scorecard en de VC-methode in één wizard. Geen historische cijfers nodig, geen
            abstracte schuiven, geen natte vinger. Wel: een PDF die je angel of investeerder serieus
            neemt.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/${locale}/startup-valuation`}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Start gratis waardering
            </Link>
            <Link
              href={`/${locale}/reports/new?flow=startup&studio=legacy`}
              className="inline-flex items-center justify-center rounded-lg border border-foreground/15 bg-background px-6 py-3 text-sm font-medium text-foreground/80 transition hover:border-primary hover:text-primary"
            >
              Klassieke flow (advisors)
            </Link>
          </div>
          <p className="mt-4 text-xs text-foreground/55">
            Geen credit card · Geen account vereist voor de eerste run · GDPR-compliant
          </p>
        </header>

        {/* Ghent social proof */}
        <section className="mt-20 rounded-2xl border border-foreground/10 bg-background/60 p-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-foreground/55">
            In gebruik bij Gentse founders en partners
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
            Waarom anders dan dat ene Excel-sheet?
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {FEATURES_NL.map((f) => (
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
            7 stappen, 7 minuten
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-foreground/65">
            Eén kaart per stap, één evidence-veld om je antwoord te onderbouwen. Live receipt rechts
            laat je zien hoe elke keuze de waardering verschuift.
          </p>
          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {STEPS_NL.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-foreground/10 bg-background/60 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Stap {s.n}
                </p>
                <h3 className="mt-1 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1 text-xs text-foreground/60">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Methodology trust */}
        <section className="mt-20 rounded-2xl border border-foreground/10 bg-background/60 p-8">
          <h2 className="text-2xl font-semibold text-foreground">Methodologie</h2>
          <div className="mt-4 grid gap-6 text-sm text-foreground/70 md:grid-cols-3">
            <div>
              <p className="font-semibold text-foreground">Berkus 2024 refresh</p>
              <p className="mt-1">
                Risico-reductie scorecard met regionaal aangepaste caps (€500k–€750k per mijlpaal in
                BE/NL/LU).
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Bill Payne Scorecard 2024</p>
              <p className="mt-1">
                Vijf gewogen factoren verankerd op de regionale mediaan (Athena MDM).
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">VC-methode (Sahlman)</p>
              <p className="mt-1">pre = (Y5 omzet × exit-multiple ÷ target ROI) − rondegrootte.</p>
            </div>
          </div>
          <p className="mt-6 text-xs text-foreground/45">
            Bronnen: PitchBook Q4 2025, Dealroom Benelux 2025, Atomico State of European Tech 2025.
          </p>
        </section>

        {/* Final CTA */}
        <section className="mt-20 text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            Klaar om je waardering te bouwen?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/65">
            7 minuten. Een PDF die staat. Een gesprek met je angel dat anders verloopt.
          </p>
          <Link
            href={`/${locale}/startup-valuation`}
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            Start gratis →
          </Link>
        </section>
      </div>
    </div>
  )
}
