'use client'

/**
 * StudioShell
 * -----------
 *
 * Stacked-sections frame for the Studio v2 valuation flow.  Mirrors how
 * DCF, SaaS multiples, NAV, and Upswitch Adaptive present their inputs:
 * a sticky left rail that doubles as a numbered table of contents, all
 * sections rendered top-to-bottom in the centre column, and a sticky
 * right-rail report that updates live as the founder works.
 *
 *   ┌── left rail (14rem) ──┐  ┌──── stacked sections (centre) ────┐  ┌── live report (24rem) ──┐
 *   │ 1  Profiel  ●         │  │  1. Profiel                       │  │   live valuation        │
 *   │ 2  Risico-reductie    │  │  ─────────────────────────────    │  │   football field        │
 *   │ 3  Defensibility      │  │  2. Risico-reductie               │  │   regional benchmark    │
 *   │ …                     │  │  ─────────────────────────────    │  │   generate-PDF CTA      │
 *   └───────────────────────┘  └───────────────────────────────────┘  └─────────────────────────┘
 *
 * Replaces the previous horizontal-stepper "wizard" UX with the same
 * scroll-and-edit pattern every other valuation method already uses,
 * so an advisor moving between Adaptive / DCF / Startup never has to
 * re-learn the navigation.  Mobile collapses to a single column with a
 * collapsible bottom drawer for the report.
 */

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ValuationSectionHeader } from '@/components/calculator/sections/ValuationSectionHeader'
import { useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { type StudioStepId, useStudioIssues } from '@/features/startup-studio/hooks/useStudioIssues'
import { type StudioStep, trackStudioStepViewed } from '@/lib/analytics'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { cn } from '@/lib/utils'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { LiveReportPanel } from './LiveReportPanel'
import { StudioCoPilot } from './StudioCoPilot'

export interface StudioStepDef {
  id: StudioStep
  label: { en: string; nl: string }
}

export const STUDIO_STEPS: StudioStepDef[] = [
  { id: 'profile', label: { en: 'Profile', nl: 'Profiel' } },
  { id: 'berkus', label: { en: 'Risk reduction', nl: 'Risico-reductie' } },
  { id: 'scorecard', label: { en: 'Defensibility', nl: 'Defensibility' } },
  { id: 'founder_pedigree', label: { en: 'Team pedigree', nl: 'Team' } },
  { id: 'traction', label: { en: 'Traction', nl: 'Tractie' } },
  { id: 'exit_story', label: { en: 'Exit story', nl: 'Exit-verhaal' } },
  { id: 'round_simulator', label: { en: 'Round', nl: 'Ronde' } },
  { id: 'report', label: { en: 'Report', nl: 'Rapport' } },
]

export interface StudioSection {
  id: StudioStep
  content: ReactNode
}

interface StudioShellProps {
  sections: StudioSection[]
  onComplete?: () => void
  locale?: 'en' | 'nl'
  isCompleting?: boolean
}

const SECTION_ANCHOR_PREFIX = 'studio-section-'

function sectionAnchorId(id: StudioStep) {
  return `${SECTION_ANCHOR_PREFIX}${id}`
}

/**
 * Returns true while the founder hasn't yet supplied enough state for a
 * given step to be considered "started".  Drives the left-rail status
 * dot — empty / in-progress / complete — without gating navigation.
 */
function useStepStatuses() {
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const maturity = useStartupValuationStore((s) => s.maturity)
  const evidenceNotes = useStartupValuationStore((s) => s.evidence_notes)
  const founderPedigree = useStartupValuationStore((s) => s.founder_pedigree)
  const mrr = useStartupValuationStore((s) => s.mrr)
  const arr = useStartupValuationStore((s) => s.arr)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)

  return useMemo<Record<StudioStep, 'empty' | 'partial' | 'complete'>>(() => {
    const profileComplete = !!(companyName.trim() && stage && sector && country)

    const berkusKeys = [
      'sound_idea',
      'prototype_status',
      'management_strength',
      'strategic_relationships',
      'product_rollout',
    ] as const
    const berkusPicked = berkusKeys.filter((k) => maturity[k] !== 'none').length
    const berkusStatus: 'empty' | 'partial' | 'complete' =
      berkusPicked === 0 ? 'empty' : berkusPicked >= 4 ? 'complete' : 'partial'

    const scorecardKeys = [
      'opportunity_size',
      'competitive_environment',
      'sales_marketing_channels',
      'need_for_additional_funding',
      'other_factors',
    ] as const
    const scorecardPicked = scorecardKeys.filter((k) => maturity[k] !== 'none').length
    const scorecardStatus: 'empty' | 'partial' | 'complete' =
      scorecardPicked === 0 ? 'empty' : scorecardPicked >= 3 ? 'complete' : 'partial'

    const pedigreeAny = Object.values(founderPedigree).some(Boolean)

    const tractionRevenue = (mrr ?? 0) > 0 || (arr ?? 0) > 0
    // Traction is "complete" either when revenue is present OR when the
    // founder has actively answered the question (any evidence note in
    // any other section indicates they are working through the form).
    const tractionStatus: 'empty' | 'partial' | 'complete' = tractionRevenue
      ? 'complete'
      : 'partial'

    const exitStatus: 'empty' | 'partial' | 'complete' =
      y5 != null && exitMultiple != null
        ? 'complete'
        : y5 != null || exitMultiple != null
          ? 'partial'
          : 'empty'

    const roundStatus: 'empty' | 'partial' | 'complete' =
      investment != null && investment > 0 ? 'complete' : 'empty'

    const evidenceCount = Object.values(evidenceNotes).filter(
      (v) => typeof v === 'string' && v.trim().length > 0
    ).length

    return {
      profile: profileComplete ? 'complete' : companyName.trim() ? 'partial' : 'empty',
      berkus: berkusStatus,
      scorecard: scorecardStatus,
      founder_pedigree: pedigreeAny ? 'complete' : 'empty',
      traction: tractionStatus,
      exit_story: exitStatus,
      round_simulator: roundStatus,
      report: evidenceCount > 0 ? 'partial' : 'empty',
    }
  }, [
    companyName,
    stage,
    sector,
    country,
    maturity,
    evidenceNotes,
    founderPedigree,
    mrr,
    arr,
    y5,
    exitMultiple,
    investment,
  ])
}

export function StudioShell({
  sections,
  onComplete,
  locale = 'en',
  isCompleting,
}: StudioShellProps) {
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark, isFallback, publishedAt } = useStartupBenchmark(country, stage, sector)
  const valuation = useLiveValuation(benchmark)
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const { issues } = useStudioIssues(benchmark)
  const statuses = useStepStatuses()

  // Track which section is "active" in the viewport so the left-rail TOC
  // can highlight it while the founder scrolls.  IntersectionObserver is
  // a single observer for all 8 anchors — cheap and accurate.
  const [activeId, setActiveId] = useState<StudioStep>('profile')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const trackedRef = useRef<Set<StudioStep>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const observed = STUDIO_STEPS.map((s) => sectionRefs.current[s.id]).filter(
      (el): el is HTMLElement => !!el
    )
    if (observed.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible entry above the viewport midline so the
        // active state matches what the founder is reading, not what's
        // first on screen by stacking order.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target) {
          const id = (visible[0].target as HTMLElement).dataset.studioStep as StudioStep | undefined
          if (id) setActiveId(id)
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    for (const el of observed) observer.observe(el)
    return () => observer.disconnect()
    // The observer needs to re-bind whenever the section list changes
    // shape; we key on length because the section ids themselves are
    // static across renders (they come from the parent route).
  }, [sections.length])

  // Fire `step_viewed` analytics once per section the founder actually
  // scrolls into — we keep the legacy event so the funnel dashboards
  // continue to read the same shape they did under the timeline UX.
  useEffect(() => {
    if (trackedRef.current.has(activeId)) return
    trackedRef.current.add(activeId)
    trackStudioStepViewed(activeId, stage)
  }, [activeId, stage])

  const handleJumpToStep = (id: StudioStepId) => {
    if (typeof window === 'undefined') return
    const el = document.getElementById(sectionAnchorId(id))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/[0.02]">
      <div className="mx-auto w-full max-w-[88rem] px-4 py-8 lg:px-8">
        <header className="mb-6 flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {locale === 'nl' ? 'Startup Waarderingsmotor' : 'Startup Valuation Studio'}
          </p>
          <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">
            {companyName.trim() || (locale === 'nl' ? 'Nieuwe waardering' : 'New valuation')}
          </h1>
          <p className="text-sm text-foreground/60">
            {locale === 'nl'
              ? 'Werk de zeven secties hieronder af — het rapport rechts beweegt mee terwijl je typt.'
              : 'Work through the seven sections below — the report on the right moves with you as you type.'}
          </p>
        </header>

        {/* Mobile TOC ------------------------------------------------- */}
        <nav
          aria-label={locale === 'nl' ? 'Secties' : 'Sections'}
          className="mb-5 flex gap-1.5 overflow-x-auto rounded-xl border border-foreground/10 bg-background/60 p-2 lg:hidden"
        >
          {STUDIO_STEPS.map((step, idx) => (
            <button
              key={step.id}
              type="button"
              onClick={() => handleJumpToStep(step.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                activeId === step.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/70 hover:bg-foreground/[0.04]'
              )}
            >
              <span className="tabular-nums opacity-70">{idx + 1}</span>
              {step.label[locale]}
            </button>
          ))}
        </nav>

        {/* 3-column layout: TOC · stacked sections · live report ----- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_24rem]">
          {/* Left rail — sticky table of contents */}
          <aside className="hidden lg:block">
            <nav
              aria-label={locale === 'nl' ? 'Secties' : 'Sections'}
              className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-foreground/10 bg-background/70 p-3 shadow-sm backdrop-blur"
            >
              <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/55">
                {locale === 'nl' ? 'Secties' : 'Sections'}
              </p>
              <ol className="space-y-1">
                {STUDIO_STEPS.map((step, idx) => {
                  const status = statuses[step.id]
                  const isActive = activeId === step.id
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => handleJumpToStep(step.id)}
                        aria-current={isActive ? 'step' : undefined}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-foreground'
                            : 'text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors',
                            status === 'complete'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-foreground/[0.06] text-foreground/65'
                          )}
                        >
                          {status === 'complete' ? <Check className="h-3 w-3" /> : idx + 1}
                        </span>
                        <span className="flex-1 truncate">{step.label[locale]}</span>
                        {status === 'partial' && !isActive && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80"
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>
          </aside>

          {/* Centre — stacked sections.  Each section uses the canonical
              `ValuationSectionHeader` (Aurora Teal step numerals + ring on
              complete) so the visual contract matches DCF / SaaS / NAV. */}
          <main className="min-w-0 space-y-10">
            {sections.map((section, idx) => {
              const def = STUDIO_STEPS.find((s) => s.id === section.id)
              if (!def) return null
              const status = statuses[section.id]
              return (
                <motion.section
                  key={section.id}
                  ref={(el) => {
                    sectionRefs.current[section.id] = el
                  }}
                  data-studio-step={section.id}
                  id={sectionAnchorId(section.id)}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut', delay: idx * 0.02 }}
                  className="scroll-mt-6 space-y-4"
                >
                  <ValuationSectionHeader
                    step={idx + 1}
                    title={def.label[locale]}
                    complete={status === 'complete'}
                  />
                  <div>{section.content}</div>
                </motion.section>
              )
            })}
          </main>

          {/* Right rail — live report panel */}
          <aside className="hidden lg:block">
            <LiveReportPanel
              valuation={valuation}
              benchmark={benchmark}
              isFallback={isFallback}
              publishedAt={publishedAt}
              locale={locale}
              onGenerate={onComplete}
              isGenerating={isCompleting}
              blockerCount={issues.filter((i) => i.severity === 'block').length}
              warningCount={issues.filter((i) => i.severity === 'warn').length}
            />
          </aside>

          {/* Mobile report — collapsible bottom drawer */}
          <details className="lg:hidden">
            <summary className="cursor-pointer rounded-xl border border-foreground/10 bg-background/80 px-4 py-3 text-sm font-medium text-foreground/80">
              {locale === 'nl' ? 'Live rapport tonen' : 'Show live report'}
            </summary>
            <div className="mt-3">
              <LiveReportPanel
                valuation={valuation}
                benchmark={benchmark}
                isFallback={isFallback}
                publishedAt={publishedAt}
                locale={locale}
                onGenerate={onComplete}
                isGenerating={isCompleting}
                blockerCount={issues.filter((i) => i.severity === 'block').length}
                warningCount={issues.filter((i) => i.severity === 'warn').length}
              />
            </div>
          </details>
        </div>
      </div>

      {/* Studio Co-pilot — proactive remediation surface for issues we'd
          previously have leaked into the rendered report. The FAB floats
          bottom-right; the slide-over panel hosts both the structured
          issue list and a free-form chat. Mounted here so the founder can
          open the assistant from anywhere on the page. */}
      <StudioCoPilot
        issues={issues}
        scopeId={companyName ? `studio-${companyName}` : 'studio-default'}
        locale={locale}
        companyName={companyName || undefined}
        onJumpToStep={handleJumpToStep}
      />
    </div>
  )
}
