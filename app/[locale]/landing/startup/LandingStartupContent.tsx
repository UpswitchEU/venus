'use client'

/**
 * Anonymous startup landing — client surface.
 *
 * Mounts the same wizard section components Venus uses
 * authenticated — same files, same Zustand stores, no duplication —
 * but skips two things that only make sense post-signup:
 *
 *   1. ``useStartupSessionSync``: writes/restores the wizard via Titan
 *      session API.  Anonymous founders have no session, no token, no
 *      ``client_id`` — the hook would just fire failed network calls.
 *      Anonymous state lives in the Zustand store + localStorage; the
 *      handoff helper carries it to the auth side on submit.
 *
 *   2. ``StudioCoPilot``: streaming AI assistant for issue triage.
 *      Hits an authenticated SSE endpoint, so it can't run here.  We
 *      keep the structured ``useStudioIssues`` count visible inline —
 *      a "things to fix" hint without the chat.
 *
 * Page composition (top → bottom):
 *   1. ``HeroSection``          — value prop + factual stage-coverage chip
 *   2. ``HowItWorksStrip``      — 3-step explainer above the wizard
 *   3. Wizard + sticky right-rail CTA (the conversion engine)
 *   4. ``MethodologySection``   — three real frameworks with attribution
 *   5. ``ReportContentsSection``— what the downloadable PDF actually is
 *   6. ``CalibrationSourcesNote``— the public datasets we ground against
 *   7. ``FAQSection``           — honest Q&A: privacy, accuracy disclaimer
 *
 * Editorial constraints (these are non-negotiable for this surface):
 *   - No invented social proof ("trusted by N founders") — we don't
 *     have the count and inflating it would torch credibility.
 *   - No partner / fund / accelerator logos we don't actually have a
 *     relationship with.
 *   - No "X% accuracy" claims about the engine — it's a triangulation,
 *     not a guarantee, and the report itself says so.
 *   - Authorship attributions (Berkus, Bill Payne, Sahlman, the SaaS
 *     benchmark publications) are real — they're the same names the
 *     Studio v2 copy and the Jinja templates already cite.
 */

import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  Lock,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { ValuationSectionHeader } from '@/components/calculator/sections/ValuationSectionHeader'
import { BerkusStep } from '@/features/startup-studio/components/BerkusStep'
import { CompanyCardStep } from '@/features/startup-studio/components/CompanyCardStep'
import { ExitStoryStep } from '@/features/startup-studio/components/ExitStoryStep'
import { FounderPedigreeStep } from '@/features/startup-studio/components/FounderPedigreeStep'
import { ReportStep } from '@/features/startup-studio/components/ReportStep'
import { RoundSimulatorStep } from '@/features/startup-studio/components/RoundSimulatorStep'
import { ScorecardStep } from '@/features/startup-studio/components/ScorecardStep'
import { TractionStep } from '@/features/startup-studio/components/TractionStep'
import { useStudioIssues } from '@/features/startup-studio/hooks/useStudioIssues'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { writeLandingStudioHandoff } from '@/utils/landingStudioHandoff'

interface LandingStartupContentProps {
  locale: 'en' | 'nl'
}

interface SectionDef {
  id: string
  label: { en: string; nl: string }
  render: (locale: 'en' | 'nl') => React.ReactNode
}

// ---------------------------------------------------------------------------
// Section copy shapes.
//
// We keep the ``COPY`` table ``as const`` so editorial reviewers can see
// every string literal at a glance, but ``as const`` makes the EN and NL
// branches structurally distinct (different literal types), which means
// ``typeof COPY.en.hero | typeof COPY.nl.hero`` won't satisfy a single
// component-prop type.  These widened interfaces are what the sub-section
// components actually consume — same fields, plain ``string`` /
// ``ReadonlyArray`` types, no literal narrowing.
// ---------------------------------------------------------------------------

interface HeroCopy {
  eyebrow: string
  headline: string
  headlineAccent: string
  subline: string
  stageChips: ReadonlyArray<string>
  stageChipsLabel: string
  anonymous: string
  noCard: string
  gdpr: string
}

interface HowItWorksCopy {
  heading: string
  steps: ReadonlyArray<{ title: string; body: string }>
}

interface MethodologyCardCopy {
  /** Pulled from lucide-react; ``LucideIcon`` is the canonical export
   *  type for any forwarded SVG icon component in this design system. */
  icon: LucideIcon
  title: string
  attribution: string
  body: string
}

interface MethodologyCopy {
  heading: string
  lede: string
  cards: ReadonlyArray<MethodologyCardCopy>
}

interface ReportContentsCopy {
  heading: string
  lede: string
  items: ReadonlyArray<{
    icon: LucideIcon
    title: string
    body: string
  }>
}

interface SourcesCopy {
  heading: string
  lede: string
  items: ReadonlyArray<string>
  note: string
}

interface FAQCopy {
  heading: string
  items: ReadonlyArray<{ q: string; a: string }>
}

const SECTIONS: SectionDef[] = [
  {
    id: 'profile',
    label: { en: 'Profile', nl: 'Profiel' },
    render: (locale) => <CompanyCardStep locale={locale} />,
  },
  {
    id: 'berkus',
    label: { en: 'Risk reduction', nl: 'Risico-reductie' },
    render: (locale) => <BerkusStep locale={locale} />,
  },
  {
    id: 'scorecard',
    label: { en: 'Defensibility', nl: 'Defensibility' },
    render: (locale) => <ScorecardStep locale={locale} />,
  },
  {
    id: 'founder_pedigree',
    label: { en: 'Team pedigree', nl: 'Team' },
    render: (locale) => <FounderPedigreeStep locale={locale} />,
  },
  {
    id: 'traction',
    label: { en: 'Traction', nl: 'Tractie' },
    render: (locale) => <TractionStep locale={locale} />,
  },
  {
    id: 'exit_story',
    label: { en: 'Exit story', nl: 'Exit-verhaal' },
    render: (locale) => <ExitStoryStep locale={locale} />,
  },
  {
    id: 'round_simulator',
    label: { en: 'Round', nl: 'Ronde' },
    render: (locale) => <RoundSimulatorStep locale={locale} />,
  },
  {
    id: 'report',
    label: { en: 'Preview', nl: 'Voorbeeld' },
    render: (locale) => <ReportStep locale={locale} />,
  },
]

// ---------------------------------------------------------------------------
// Editorial copy.  Both locales kept side-by-side so a copy review pass
// can audit them in one diff.
// ---------------------------------------------------------------------------

const COPY = {
  en: {
    hero: {
      eyebrow: 'No signup needed to start',
      headline: "What's your startup worth?",
      headlineAccent: 'Find out in 15 minutes — sign up only when you want the report.',
      subline:
        'Three established frameworks, calibrated against published Benelux benchmarks. Fill it in here, sign up at the end to download the investor-ready PDF.',
      stageChips: ['Pre-seed', 'Seed', 'Series A'],
      stageChipsLabel: 'Stage coverage',
      anonymous: 'Anonymous until signup',
      noCard: 'No credit card',
      gdpr: 'GDPR-compliant',
    },
    howItWorks: {
      heading: 'How it works',
      steps: [
        {
          title: 'Fill the wizard',
          body: 'Eight short sections. No historical financials required. Around 15 minutes.',
        },
        {
          title: 'Sign up — no card',
          body: 'A magic-link signup. Your inputs travel with you to the authenticated dashboard.',
        },
        {
          title: 'Download your PDF',
          body: 'A 4-page investor-ready report — one-pager, methodology, cap table, dilution.',
        },
      ],
    },
    methodology: {
      heading: 'Three frameworks, one defensible number',
      lede: 'We blend three valuation methods angel investors and seed funds actually ask about. Each is grounded in published research — no proprietary black box.',
      cards: [
        {
          icon: ShieldCheck,
          title: 'Berkus method',
          attribution: 'Dave Berkus, ~1990s — "Berkus 2.0" calibration: 2024',
          body: 'Five risk-reduction milestones (idea, prototype, team, partnerships, rollout). Each milestone earns a defined contribution toward the pre-money — anchored on stage-aware ceilings, not a point-in-time gut feel.',
        },
        {
          icon: Target,
          title: 'Bill Payne Scorecard',
          attribution: 'Bill Payne / Frontier Angels — published methodology, 2024 update',
          body: 'Five weighted factors (market size, defensibility, GTM, capital efficiency, other tailwinds) compared against the regional median. The result is a multiplier on a published Benelux baseline.',
        },
        {
          icon: TrendingUp,
          title: 'VC method',
          attribution: 'Bill Sahlman, Harvard Business Review (1987)',
          body: 'Year-5 revenue × an exit-EV/revenue multiple ÷ the fund\'s target ROI. Surfaces the "what does the fund need to see" lens that priced rounds actually solve for.',
        },
      ],
    },
    reportContents: {
      heading: 'What you\'ll download',
      lede: 'A 4-page PDF, designed to drop into a data room or paste into a deck. The same artefacts each appear in the report below.',
      items: [
        {
          icon: LayoutDashboard,
          title: 'Fundraising one-pager',
          body: 'The page you hand an angel: blended pre-money, range, method-mix, football field across the three legs, cap-table simulator, defensibility highlights.',
        },
        {
          icon: FileText,
          title: 'Executive summary',
          body: 'Canonical headline + range + narrative, with stage and method-mix called out for the reviewer.',
        },
        {
          icon: ScrollText,
          title: 'Method breakdown',
          body: 'Audit trail per method: Berkus contributions table, Scorecard factor weights, SaaS forward multiple math, VC backsolve.',
        },
        {
          icon: ClipboardCheck,
          title: 'Cap table & dilution',
          body: 'Existing option pool, prior round, SAFE notes, and the next-round dilution scenario — laid out so an accountant can certify it.',
        },
      ],
    },
    sources: {
      heading: 'Calibrated against published research',
      lede: 'Benchmarks are not invented. The numbers the engine compares your inputs against come from public datasets:',
      items: [
        'Atomico — State of European Tech 2024',
        'Dealroom — Benelux 2024',
        'Bessemer — State of the Cloud 2024',
        'KeyBanc / OpenView — Private SaaS Survey',
      ],
      note: 'Sources are cited inline in your downloaded report wherever a benchmark drives a number.',
    },
    faq: {
      heading: 'Honest answers',
      items: [
        {
          q: 'Why is the wizard free without signing up?',
          a: 'Filling it gives you a number you can paste into a deck on its own — that\'s already useful, with or without the PDF. Signup is only for the polished investor-ready report and to keep your work across sessions.',
        },
        {
          q: 'How accurate is this versus a paid valuation?',
          a: 'It\'s a triangulation across three established methods, not a single ground-truth number. For a term sheet or a SAFE conversion, your accountant should sign off the cap table — we make that a one-click invite from inside the report.',
        },
        {
          q: 'What happens to my inputs if I leave without signing up?',
          a: 'They stay in your browser only (localStorage). Nothing is sent to our servers until you sign up. If you come back within 24 hours, your inputs reload automatically.',
        },
        {
          q: 'Can I run this for a non-Belgian / non-Dutch startup?',
          a: 'The wizard works for any company — the regional benchmarks today are calibrated for Belgium and the Netherlands. If you\'re elsewhere in Europe, the numbers still triangulate but you should treat the regional multiplier as approximate.',
        },
      ],
    },
    rightRail: {
      title: 'Your report is almost ready',
      sub: 'Fill in the wizard on the left. When you click "Generate my report" we save your inputs, take you through a quick signup, and bring you straight to your finished valuation — left rail prefilled, right rail showing the PDF.',
      fixesTitleSingular: '1 thing to fix before the report is investor-ready',
      fixesTitlePlural: (n: number) =>
        `${n} things to fix before the report is investor-ready`,
      cta: 'Generate my free report',
      ctaSubmitting: 'Saving your inputs…',
      ctaFootnote:
        'Free, in 15 minutes. We never share your inputs. The next step is a quick signup — no credit card.',
      legalAlready: 'Already have an account?',
      legalLogin: 'Log in',
    },
  },
  nl: {
    hero: {
      eyebrow: 'Geen account nodig om te beginnen',
      headline: 'Wat is je startup waard?',
      headlineAccent: 'Ontdek het in 15 minuten — registreer alleen als je het rapport wilt.',
      subline:
        'Drie gevestigde frameworks, gekalibreerd op gepubliceerde Benelux-benchmarks. Vul het hier in, registreer aan het eind om het investor-ready PDF te downloaden.',
      stageChips: ['Pre-seed', 'Seed', 'Series A'],
      stageChipsLabel: 'Stage-dekking',
      anonymous: 'Anoniem tot registratie',
      noCard: 'Geen creditcard',
      gdpr: 'GDPR-compliant',
    },
    howItWorks: {
      heading: 'Hoe het werkt',
      steps: [
        {
          title: 'Vul de wizard in',
          body: 'Acht korte secties. Geen historische cijfers nodig. Ongeveer 15 minuten.',
        },
        {
          title: 'Registreer — geen kaart',
          body: 'Magic-link registratie. Je inputs reizen met je mee naar het ingelogde dashboard.',
        },
        {
          title: 'Download je PDF',
          body: 'Een 4-paginas investor-ready rapport — one-pager, methodologie, cap table, dilutie.',
        },
      ],
    },
    methodology: {
      heading: 'Drie frameworks, één verdedigbaar getal',
      lede: 'We combineren drie waarderingsmethodes waar angel investors en seed-fondsen daadwerkelijk om vragen. Elk is gebaseerd op gepubliceerd onderzoek — geen proprietary black box.',
      cards: [
        {
          icon: ShieldCheck,
          title: 'Berkus methode',
          attribution: 'Dave Berkus, ~jaren \'90 — "Berkus 2.0" kalibratie: 2024',
          body: 'Vijf risico-reductie mijlpalen (idee, prototype, team, partnerschappen, uitrol). Elke mijlpaal verdient een gedefinieerde bijdrage aan de pre-money — verankerd op stage-bewuste plafonds, geen onderbuikgevoel.',
        },
        {
          icon: Target,
          title: 'Bill Payne Scorecard',
          attribution: 'Bill Payne / Frontier Angels — gepubliceerde methodologie, 2024 update',
          body: 'Vijf gewogen factoren (marktomvang, verdedigbaarheid, GTM, kapitaalefficiëntie, overige meewinden) vergeleken met de regio-mediaan. Het resultaat is een multiplier op een gepubliceerde Benelux-baseline.',
        },
        {
          icon: TrendingUp,
          title: 'VC methode',
          attribution: 'Bill Sahlman, Harvard Business Review (1987)',
          body: 'Jaar-5 omzet × een exit-EV/omzet multiple ÷ het doelrendement van het fonds. Brengt de "wat moet het fonds zien" lens naar boven die priced rounds in praktijk oplossen.',
        },
      ],
    },
    reportContents: {
      heading: 'Wat je downloadt',
      lede: 'Een PDF van 4 paginas, ontworpen om in een data room te droppen of in een deck te plakken. Dezelfde artefacten zie je elk in het rapport hieronder.',
      items: [
        {
          icon: LayoutDashboard,
          title: 'Fundraising one-pager',
          body: 'De pagina die je een angel overhandigt: geblende pre-money, bandbreedte, methodemix, football field over de drie legs, cap-table simulator, defensibility-hoogtepunten.',
        },
        {
          icon: FileText,
          title: 'Executive summary',
          body: 'Canonieke headline + bandbreedte + narratief, met stage en methodemix uitgelicht voor de lezer.',
        },
        {
          icon: ScrollText,
          title: 'Methode-breakdown',
          body: 'Audit-trail per methode: Berkus-bijdragentabel, Scorecard factor-gewichten, SaaS forward multiple wiskunde, VC backsolve.',
        },
        {
          icon: ClipboardCheck,
          title: 'Cap table & dilutie',
          body: 'Bestaande optiepool, vorige ronde, SAFE notes, en het volgende-ronde dilutiescenario — opgemaakt zodat een accountant het kan certificeren.',
        },
      ],
    },
    sources: {
      heading: 'Gekalibreerd op gepubliceerd onderzoek',
      lede: 'Benchmarks zijn niet verzonnen. De getallen waaraan de engine je inputs spiegelt, komen uit publieke datasets:',
      items: [
        'Atomico — State of European Tech 2024',
        'Dealroom — Benelux 2024',
        'Bessemer — State of the Cloud 2024',
        'KeyBanc / OpenView — Private SaaS Survey',
      ],
      note: 'Bronnen worden inline geciteerd in je gedownloade rapport, telkens een benchmark een getal stuurt.',
    },
    faq: {
      heading: 'Eerlijke antwoorden',
      items: [
        {
          q: 'Waarom is de wizard gratis zonder registratie?',
          a: 'Hem invullen geeft je al een getal dat je in een deck kunt plakken — dat is op zich nuttig, met of zonder PDF. Registratie is alleen voor het gepolijste investor-ready rapport en om je werk over sessies heen te bewaren.',
        },
        {
          q: 'Hoe nauwkeurig is dit ten opzichte van een betaalde waardering?',
          a: 'Het is een triangulatie over drie gevestigde methoden, geen single-source-of-truth getal. Voor een term sheet of een SAFE-conversie moet je accountant de cap table tekenen — we maken dat een één-klik uitnodiging vanuit het rapport.',
        },
        {
          q: 'Wat gebeurt er met mijn inputs als ik wegga zonder te registreren?',
          a: 'Ze blijven alleen in je browser (localStorage). Niets gaat naar onze servers tot je registreert. Als je binnen 24 uur terugkomt, laden je inputs automatisch terug.',
        },
        {
          q: 'Kan ik dit gebruiken voor een niet-Belgische / niet-Nederlandse startup?',
          a: 'De wizard werkt voor elk bedrijf — de regionale benchmarks zijn vandaag gekalibreerd voor België en Nederland. Voor de rest van Europa triangleert het getal nog steeds, maar behandel de regio-multiplier als bij benadering.',
        },
      ],
    },
    rightRail: {
      title: 'Je rapport is bijna klaar',
      sub: 'Vul de wizard links in. Klik op "Genereer mijn rapport", we slaan je inputs op, je doet een snelle registratie en je komt meteen op je voltooide waardering uit — links voorgevuld, rechts het PDF-rapport.',
      fixesTitleSingular: '1 punt om aan te scherpen voordat het rapport investor-ready is',
      fixesTitlePlural: (n: number) =>
        `${n} punten om aan te scherpen voordat het rapport investor-ready is`,
      cta: 'Genereer mijn gratis rapport',
      ctaSubmitting: 'Inputs opslaan…',
      ctaFootnote:
        'Gratis, in 15 minuten. We delen je inputs nooit. De volgende stap is een snelle registratie — geen creditcard.',
      legalAlready: 'Heb je al een account?',
      legalLogin: 'Log in',
    },
  },
} as const

// ---------------------------------------------------------------------------
// Main surface
// ---------------------------------------------------------------------------

export function LandingStartupContent({ locale }: LandingStartupContentProps) {
  const t = COPY[locale]

  // Studio store hooks — same instances the authenticated wizard uses,
  // so on the auth-side the values land back in the same getState shape.
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const { issues } = useStudioIssues(benchmark)
  const blockerCount = issues.filter((i) => i.severity === 'block').length
  const warningCount = issues.filter((i) => i.severity === 'warn').length

  const [isSubmitting, setIsSubmitting] = useState(false)

  /**
   * Snapshot the studio + manual stores, queue the handoff, then
   * navigate to Mercury signup with a return URL that brings the
   * founder back to the authenticated wizard with the prefill marker.
   * We never preventDefault — the navigation IS the submit.
   */
  const handleSubmit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const studio = useStartupValuationStore.getState().toRequestPayload()
    // Cast through ``unknown`` because ``ValuationFormData`` is a
    // structurally-typed schema with optional fields (Zod-derived) that
    // doesn't satisfy ``Record<string, unknown>`` directly under tsc.
    // The handoff helper applies the values through ``updateFormData``
    // on the auth side, which re-validates each key, so this widening
    // is safe.
    const formData = useManualFormStore.getState().formData as unknown as Record<
      string,
      unknown
    >
    writeLandingStudioHandoff({ studio, formData })

    // Build the return URL: authenticated Venus, /reports/new path, with
    // ``selected_method`` and the ``prefill_from`` marker the auth-side
    // bootstrap reads.  Use ``window.location.origin`` so this works on
    // localhost / preview / staging / prod without a Venus base-URL env.
    const venusOrigin =
      typeof window !== 'undefined' ? window.location.origin : ''
    const returnUrl = `${venusOrigin}/${locale}/reports/new?selected_method=startup_valuation&prefill_from=landing`

    const mercuryBase = getMercuryUrl()
    const signupUrl = new URL(`/${locale}/auth/signup`, mercuryBase)
    signupUrl.searchParams.set('returnUrl', returnUrl)
    signupUrl.searchParams.set('source', 'venus_landing_startup')

    window.location.href = signupUrl.toString()
    // Hard nav — leave isSubmitting true so the spinner stays up while
    // the page unmounts.
  }

  const fixesLabel = (() => {
    const total = blockerCount + warningCount
    if (total === 0) return null
    if (total === 1) return t.rightRail.fixesTitleSingular
    return t.rightRail.fixesTitlePlural(total)
  })()

  return (
    <main className='aurora-theme min-h-screen bg-background'>
      <HeroSection copy={t.hero} />
      <HowItWorksStrip copy={t.howItWorks} />

      {/* TWO-COLUMN: wizard left, sticky teaser right */}
      <div className='mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]'>
        {/* WIZARD */}
        <section
          aria-label='Startup valuation wizard'
          className='space-y-6 rounded-2xl border border-foreground/[0.08] bg-background/80 p-2 sm:p-4'
        >
          {SECTIONS.map((section, idx) => (
            <motion.section
              key={section.id}
              data-landing-step={section.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut', delay: idx * 0.02 }}
              className='space-y-5 px-2 pt-2'
            >
              <ValuationSectionHeader
                step={idx + 1}
                title={section.label[locale]}
                complete={false}
              />
              {section.render(locale)}
            </motion.section>
          ))}
        </section>

        {/* RIGHT RAIL — teaser + sticky CTA */}
        <aside className='lg:sticky lg:top-6 lg:h-fit'>
          <div className='space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-5 shadow-sm'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.15em] text-primary'>
              {t.rightRail.title}
            </p>
            <p className='text-sm leading-relaxed text-foreground/75'>
              {t.rightRail.sub}
            </p>

            {fixesLabel && (
              <p className='rounded-lg border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/25 dark:text-amber-200'>
                {fixesLabel}
              </p>
            )}

            <button
              type='button'
              onClick={handleSubmit}
              disabled={isSubmitting}
              className='inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70'
            >
              {isSubmitting ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
                  {t.rightRail.ctaSubmitting}
                </>
              ) : (
                <>
                  {t.rightRail.cta}
                  <ArrowRight className='h-4 w-4' aria-hidden />
                </>
              )}
            </button>

            <p className='text-[11px] leading-relaxed text-foreground/55'>
              {t.rightRail.ctaFootnote}
            </p>

            <p className='border-t border-foreground/10 pt-3 text-[12px] text-foreground/55'>
              {t.rightRail.legalAlready}{' '}
              <a
                href={`${getMercuryUrl()}/${locale}/auth/login`}
                className='font-medium text-primary underline underline-offset-2 hover:text-primary/80'
              >
                {t.rightRail.legalLogin}
              </a>
            </p>
          </div>
        </aside>
      </div>

      {/* Below-the-fold marketing — methodology, contents, sources, FAQ.
          Conversion intent: anyone who scrolled past the wizard wants
          to know more before committing.  All content is factual:
          framework names, public benchmark publications, real report
          artefacts.  No invented stats or fabricated testimonials. */}
      <MethodologySection copy={t.methodology} />
      <ReportContentsSection copy={t.reportContents} />
      <CalibrationSourcesNote copy={t.sources} />
      <FAQSection copy={t.faq} />
    </main>
  )
}

export default LandingStartupContent

// ---------------------------------------------------------------------------
// Section components — kept inline so this single landing page stays in
// one file.  If a reusable hero/methodology pattern emerges across other
// pages we'll factor them out then.
// ---------------------------------------------------------------------------

function HeroSection({ copy }: { copy: HeroCopy }) {
  return (
    <section className='border-b border-foreground/[0.06]'>
      <div className='mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-12 pt-12 text-center md:pt-20'>
        <p className='mb-3 text-xs font-medium uppercase tracking-[0.18em] text-foreground/55'>
          {copy.eyebrow}
        </p>
        <h1 className='text-balance font-display text-[clamp(2rem,5.5vw,3.5rem)] font-bold leading-[1.05] text-foreground'>
          {copy.headline}
          <span className='mt-2 block bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent'>
            {copy.headlineAccent}
          </span>
        </h1>
        <p className='mt-5 max-w-2xl text-balance text-base leading-relaxed text-foreground/70'>
          {copy.subline}
        </p>

        {/* Stage chips — factual coverage, not a hype claim. */}
        <div className='mt-8 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4'>
          <span className='text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/50'>
            {copy.stageChipsLabel}
          </span>
          <div className='flex flex-wrap items-center justify-center gap-2'>
            {copy.stageChips.map((s) => (
              <span
                key={s}
                className='rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-xs font-medium text-foreground/70'
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Trust micro-line.  Anonymous + no-card + GDPR are real
            properties of THIS page (the wizard genuinely doesn't write
            anywhere until signup) so they pass the no-fake-claims bar. */}
        <ul className='mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-foreground/60'>
          <li className='inline-flex items-center gap-1.5'>
            <Lock className='h-3.5 w-3.5 text-foreground/45' aria-hidden />
            {copy.anonymous}
          </li>
          <li className='inline-flex items-center gap-1.5'>
            <CheckCircle2 className='h-3.5 w-3.5 text-foreground/45' aria-hidden />
            {copy.noCard}
          </li>
          <li className='inline-flex items-center gap-1.5'>
            <ShieldCheck className='h-3.5 w-3.5 text-foreground/45' aria-hidden />
            {copy.gdpr}
          </li>
        </ul>
      </div>
    </section>
  )
}

function HowItWorksStrip({ copy }: { copy: HowItWorksCopy }) {
  return (
    <section className='border-b border-foreground/[0.06] bg-foreground/[0.015]'>
      <div className='mx-auto w-full max-w-6xl px-4 py-10'>
        <h2 className='mb-6 text-center text-xs font-semibold uppercase tracking-[0.16em] text-foreground/55'>
          {copy.heading}
        </h2>
        <ol className='grid gap-4 sm:grid-cols-3'>
          {copy.steps.map((step, idx) => (
            <li
              key={step.title}
              className='relative rounded-2xl border border-foreground/[0.08] bg-background/80 p-5'
            >
              <div className='mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary'>
                {idx + 1}
              </div>
              <h3 className='text-base font-semibold text-foreground'>
                {step.title}
              </h3>
              <p className='mt-1.5 text-sm leading-relaxed text-foreground/65'>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function MethodologySection({ copy }: { copy: MethodologyCopy }) {
  return (
    <section className='border-t border-foreground/[0.06] bg-foreground/[0.015]'>
      <div className='mx-auto w-full max-w-6xl px-4 py-14'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='font-display text-2xl font-semibold text-foreground sm:text-3xl'>
            {copy.heading}
          </h2>
          <p className='mt-3 text-sm leading-relaxed text-foreground/65 sm:text-base'>
            {copy.lede}
          </p>
        </div>
        <div className='mt-10 grid gap-4 md:grid-cols-3'>
          {copy.cards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.title}
                className='flex flex-col rounded-2xl border border-foreground/[0.08] bg-background p-6'
              >
                <Icon className='mb-4 h-6 w-6 text-primary' aria-hidden />
                <h3 className='text-lg font-semibold text-foreground'>
                  {card.title}
                </h3>
                <p className='mt-1 text-[11px] uppercase tracking-[0.1em] text-foreground/45'>
                  {card.attribution}
                </p>
                <p className='mt-3 text-sm leading-relaxed text-foreground/70'>
                  {card.body}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function ReportContentsSection({ copy }: { copy: ReportContentsCopy }) {
  return (
    <section>
      <div className='mx-auto w-full max-w-6xl px-4 py-14'>
        <div className='mx-auto max-w-2xl text-center'>
          <Download className='mx-auto mb-4 h-6 w-6 text-primary' aria-hidden />
          <h2 className='font-display text-2xl font-semibold text-foreground sm:text-3xl'>
            {copy.heading}
          </h2>
          <p className='mt-3 text-sm leading-relaxed text-foreground/65 sm:text-base'>
            {copy.lede}
          </p>
        </div>
        <ul className='mt-10 grid gap-4 md:grid-cols-2'>
          {copy.items.map((item) => {
            const Icon = item.icon
            return (
              <li
                key={item.title}
                className='flex gap-4 rounded-2xl border border-foreground/[0.08] bg-background/80 p-5'
              >
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                  <Icon className='h-5 w-5' aria-hidden />
                </div>
                <div className='min-w-0 flex-1'>
                  <h3 className='text-base font-semibold text-foreground'>
                    {item.title}
                  </h3>
                  <p className='mt-1 text-sm leading-relaxed text-foreground/65'>
                    {item.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function CalibrationSourcesNote({ copy }: { copy: SourcesCopy }) {
  return (
    <section className='border-y border-foreground/[0.06] bg-foreground/[0.015]'>
      <div className='mx-auto w-full max-w-4xl px-4 py-12 text-center'>
        <h2 className='text-xs font-semibold uppercase tracking-[0.16em] text-foreground/55'>
          {copy.heading}
        </h2>
        <p className='mt-3 text-sm leading-relaxed text-foreground/70'>
          {copy.lede}
        </p>
        <ul className='mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2'>
          {copy.items.map((src) => (
            <li
              key={src}
              className='rounded-full border border-foreground/10 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/75'
            >
              {src}
            </li>
          ))}
        </ul>
        <p className='mt-5 text-[12px] text-foreground/55'>{copy.note}</p>
      </div>
    </section>
  )
}

function FAQSection({ copy }: { copy: FAQCopy }) {
  return (
    <section>
      <div className='mx-auto w-full max-w-3xl px-4 py-14'>
        <h2 className='mb-8 text-center font-display text-2xl font-semibold text-foreground sm:text-3xl'>
          {copy.heading}
        </h2>
        <dl className='space-y-3'>
          {copy.items.map((item) => (
            <details
              key={item.q}
              className='group rounded-2xl border border-foreground/[0.08] bg-background/80 p-5 open:border-primary/30 open:bg-primary/[0.02]'
            >
              <summary className='flex cursor-pointer list-none items-start justify-between gap-4'>
                <dt className='text-base font-semibold text-foreground'>
                  {item.q}
                </dt>
                <span
                  aria-hidden
                  className='mt-1 select-none text-foreground/55 transition-transform group-open:rotate-45'
                >
                  +
                </span>
              </summary>
              <dd className='mt-3 text-sm leading-relaxed text-foreground/70'>
                {item.a}
              </dd>
            </details>
          ))}
        </dl>
      </div>
    </section>
  )
}
