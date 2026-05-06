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
 * Marketing copy lives in ``messages/startupStudio/{locale}.json`` under
 * ``landing`` — same merge as the rest of the Studio namespace.
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
import { useLocale, useTranslations } from 'next-intl'
import { useState, type ComponentType, type MouseEvent } from 'react'
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

type LandingWizardLabelKey =
  | 'profile'
  | 'berkus'
  | 'scorecard'
  | 'founder_pedigree'
  | 'traction'
  | 'exit_story'
  | 'round_simulator'
  | 'reportLanding'

interface SectionDef {
  id: string
  labelKey: LandingWizardLabelKey
  Step: ComponentType<{ locale?: 'en' | 'nl' }>
}

const SECTIONS: SectionDef[] = [
  { id: 'profile', labelKey: 'profile', Step: CompanyCardStep },
  { id: 'berkus', labelKey: 'berkus', Step: BerkusStep },
  { id: 'scorecard', labelKey: 'scorecard', Step: ScorecardStep },
  { id: 'founder_pedigree', labelKey: 'founder_pedigree', Step: FounderPedigreeStep },
  { id: 'traction', labelKey: 'traction', Step: TractionStep },
  { id: 'exit_story', labelKey: 'exit_story', Step: ExitStoryStep },
  { id: 'round_simulator', labelKey: 'round_simulator', Step: RoundSimulatorStep },
  { id: 'report', labelKey: 'reportLanding', Step: ReportStep },
]

/** Order matches ``landing.methodology.cards`` in messages. */
const METHODOLOGY_ICONS = [ShieldCheck, Target, TrendingUp] as const

/** Order matches ``landing.reportContents.items`` in messages. */
const REPORT_ICONS = [LayoutDashboard, FileText, ScrollText, ClipboardCheck] as const

interface HowItWorksStep {
  title: string
  body: string
}

interface MethodologyCard {
  title: string
  attribution: string
  body: string
}

interface MethodologyCopy {
  heading: string
  lede: string
  cards: ReadonlyArray<
    MethodologyCard & {
      icon: LucideIcon
    }
  >
}

interface ReportItem {
  title: string
  body: string
}

interface ReportContentsCopy {
  heading: string
  lede: string
  items: ReadonlyArray<
    ReportItem & {
      icon: LucideIcon
    }
  >
}

interface SourcesCopy {
  heading: string
  lede: string
  items: ReadonlyArray<string>
  note: string
}

interface FAQItem {
  q: string
  a: string
}

interface FAQCopy {
  heading: string
  items: ReadonlyArray<FAQItem>
}

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
  steps: ReadonlyArray<HowItWorksStep>
}

export function LandingStartupContent() {
  const locale = useLocale() === 'nl' ? 'nl' : 'en'
  const tLanding = useTranslations('startupStudio.landing')
  const tWizardSections = useTranslations('startupStudio.sections')

  const hero: HeroCopy = {
    eyebrow: tLanding('hero.eyebrow'),
    headline: tLanding('hero.headline'),
    headlineAccent: tLanding('hero.headlineAccent'),
    subline: tLanding('hero.subline'),
    stageChipsLabel: tLanding('hero.stageChipsLabel'),
    anonymous: tLanding('hero.anonymous'),
    noCard: tLanding('hero.noCard'),
    gdpr: tLanding('hero.gdpr'),
    stageChips: tLanding.raw('hero.stageChips') as string[],
  }

  const howItWorks: HowItWorksCopy = {
    heading: tLanding('howItWorks.heading'),
    steps: tLanding.raw('howItWorks.steps') as HowItWorksStep[],
  }

  const methodologyCards = tLanding.raw('methodology.cards') as MethodologyCard[]
  const methodology: MethodologyCopy = {
    heading: tLanding('methodology.heading'),
    lede: tLanding('methodology.lede'),
    cards: methodologyCards.map((c, i) => ({
      ...c,
      icon: METHODOLOGY_ICONS[i] ?? ShieldCheck,
    })),
  }

  const reportItems = tLanding.raw('reportContents.items') as ReportItem[]
  const reportContents: ReportContentsCopy = {
    heading: tLanding('reportContents.heading'),
    lede: tLanding('reportContents.lede'),
    items: reportItems.map((item, i) => ({
      ...item,
      icon: REPORT_ICONS[i] ?? FileText,
    })),
  }

  const sources: SourcesCopy = {
    heading: tLanding('sources.heading'),
    lede: tLanding('sources.lede'),
    items: tLanding.raw('sources.items') as string[],
    note: tLanding('sources.note'),
  }

  const faq: FAQCopy = {
    heading: tLanding('faq.heading'),
    items: tLanding.raw('faq.items') as FAQItem[],
  }

  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const { issues } = useStudioIssues(benchmark)
  const blockerCount = issues.filter((i) => i.severity === 'block').length
  const warningCount = issues.filter((i) => i.severity === 'warn').length

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const studio = useStartupValuationStore.getState().toRequestPayload()
    const formData = useManualFormStore.getState().formData as unknown as Record<
      string,
      unknown
    >
    writeLandingStudioHandoff({ studio, formData })

    const venusOrigin =
      typeof window !== 'undefined' ? window.location.origin : ''
    const returnUrl = `${venusOrigin}/${locale}/reports/new?selected_method=startup_valuation&prefill_from=landing`

    const mercuryBase = getMercuryUrl()
    const signupUrl = new URL(`/${locale}/auth/signup`, mercuryBase)
    signupUrl.searchParams.set('returnUrl', returnUrl)
    signupUrl.searchParams.set('source', 'venus_landing_startup')

    window.location.href = signupUrl.toString()
  }

  const totalFixes = blockerCount + warningCount
  const fixesLabel =
    totalFixes === 0 ? null : tLanding('rightRail.fixesIssues', { count: totalFixes })

  return (
    <main className='aurora-theme min-h-screen bg-background'>
      <HeroSection copy={hero} />
      <HowItWorksStrip copy={howItWorks} />

      <div className='mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]'>
        <section
          aria-label={tLanding('wizardAriaLabel')}
          className='space-y-6 rounded-2xl border border-foreground/[0.08] bg-background/80 p-2 sm:p-4'
        >
          {SECTIONS.map((section, idx) => {
            const Step = section.Step
            return (
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
                  title={tWizardSections(section.labelKey)}
                  complete={false}
                />
                <Step locale={locale} />
              </motion.section>
            )
          })}
        </section>

        <aside className='lg:sticky lg:top-6 lg:h-fit'>
          <div className='space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-5 shadow-sm'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.15em] text-primary'>
              {tLanding('rightRail.title')}
            </p>
            <p className='text-sm leading-relaxed text-foreground/75'>
              {tLanding('rightRail.sub')}
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
                  {tLanding('rightRail.ctaSubmitting')}
                </>
              ) : (
                <>
                  {tLanding('rightRail.cta')}
                  <ArrowRight className='h-4 w-4' aria-hidden />
                </>
              )}
            </button>

            <p className='text-[11px] leading-relaxed text-foreground/55'>
              {tLanding('rightRail.ctaFootnote')}
            </p>

            <p className='border-t border-foreground/10 pt-3 text-[12px] text-foreground/55'>
              {tLanding('rightRail.legalAlready')}{' '}
              <a
                href={`${getMercuryUrl()}/${locale}/auth/login`}
                className='font-medium text-primary underline underline-offset-2 hover:text-primary/80'
              >
                {tLanding('rightRail.legalLogin')}
              </a>
            </p>
          </div>
        </aside>
      </div>

      <MethodologySection copy={methodology} />
      <ReportContentsSection copy={reportContents} />
      <CalibrationSourcesNote copy={sources} />
      <FAQSection copy={faq} />
    </main>
  )
}

export default LandingStartupContent

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
              key={`${idx}-${step.title}`}
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
