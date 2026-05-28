'use client'

/**
 * StartupValuationPanel
 * ---------------------
 *
 * Self-contained left-rail panel for the 9th valuation method
 * (`startup_valuation`).  Renders the canonical seven Studio sections
 * stacked top-to-bottom inside `ManualLayout`'s ManualInputPanel slot,
 * matching the rhythm of every other method (DCF, SaaS, NAV, Adaptive):
 * a numbered Aurora-Teal section header per block, no Next/Back wizard,
 * no separate page, scroll-and-edit.
 *
 *   1. Profile        — canonical company card (KBO/KVK + business types)
 *   2. Exit story     — VC method / Y5 revenue thesis / exit multiple
 *                       (the EV/Revenue spine — leads the rhythm so the
 *                       headline math is visible before the overlays)
 *   3. Risk reduction — Berkus 2.0 milestone cards
 *   4. Defensibility / verdedigbaarheid — Scorecard 2.0 weighted factor cards
 *   5. Team           — Founder pedigree multiplier
 *   6. Traction       — Forward-looking SaaS metrics (skippable)
 *   7. Round          — SAFE vs priced-round simulator
 *
 * Submit lives in the sticky `StartupSubmitFooter` directly under the
 * panel; remediation lives in the floating `StudioCoPilot` (FAB +
 * FindingPeek + Assistent drawer).  The wizard owns inputs only — it
 * no longer carries a "Report" step (retired 2026-05-12; it duplicated
 * the FAB's issue feed and pointed a scroll-CTA at a button already
 * pinned on screen).
 *
 * The panel writes through to `useStartupValuationStore` and to
 * `useManualFormStore` (via `CompanyCardStep`).  `buildManualValuationRequest`
 * → `buildStartupValuationRequest` reads both stores and produces the
 * canonical `ValuationRequest` payload that `valuationService.calculateValuation`
 * sends to ValuationIQ.  The HTML/PDF report comes back into
 * `ManualLayout`'s right rail (same surface DCF / SaaS reports use).
 *
 * The `mode` prop is preserved for the founder vs. advisor surface
 * distinction:
 *   - `advisor` — the StudioCoPilot floats over the whole layout and
 *     the panel exposes the same advanced controls advisors expect.
 *   - `founder` — same surface; Studio copy follows the Next.js route
 *     locale (`next-intl`) so `/nl` and `/en` stay consistent with the
 *     rest of Venus (not the operating-country picker).
 */

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react'
import { scrollAnchorIntoManualLayout } from '@/features/manual/utils/manualLayoutScroll'
import { ValuationSectionHeader } from '@/components/calculator/sections/ValuationSectionHeader'
import { BerkusStep } from '@/features/startup-studio/components/BerkusStep'
import { CompanyCardStep } from '@/features/startup-studio/components/CompanyCardStep'
import { ExitStoryStep } from '@/features/startup-studio/components/ExitStoryStep'
import { FounderPedigreeStep } from '@/features/startup-studio/components/FounderPedigreeStep'
import { PanelHeader } from '@/features/startup-studio/components/PanelHeader'
import { RoundSimulatorStep } from '@/features/startup-studio/components/RoundSimulatorStep'
import { ScorecardStep } from '@/features/startup-studio/components/ScorecardStep'
import { StudioCoPilot } from '@/features/startup-studio/components/StudioCoPilot'
import { TractionStep } from '@/features/startup-studio/components/TractionStep'
import { useStartupPrefill } from '@/features/startup-studio/hooks/useStartupPrefill'
import { useStartupSessionSync } from '@/features/startup-studio/hooks/useStartupSessionSync'
import {
  type StudioIssue,
  type StudioStepId,
  useStudioIssues,
} from '@/features/startup-studio/hooks/useStudioIssues'
import { type StudioStep, trackStudioStepCompleted, trackStudioStepViewed } from '@/lib/analytics'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

// ---------------------------------------------------------------------------
// Section model — single source of truth for the order + labels.  Mirrors
// the analytics `StudioStep` enum so funnel dashboards keep reading the
// same shape they did under the timeline UX.
// ---------------------------------------------------------------------------

type StudioSectionLabelKey =
  | 'sections.profile'
  | 'sections.berkus'
  | 'sections.scorecard'
  | 'sections.founder_pedigree'
  | 'sections.traction'
  | 'sections.exit_story'
  | 'sections.round_simulator'

/**
 * Per-section props the panel forwards to every step.  Each step
 * destructures only the keys it needs — TS keeps the union open so
 * adding a new flag (e.g. ``compactMode``) doesn't churn every
 * component signature.
 */
interface SectionProps {
  /**
   * Some sections (e.g. Round simulator) widen their feature surface
   * for advisors — the panel forwards its ``mode`` so they can hide
   * advisor-only fields from founders without duplicating the
   * section.  Founders default to ``false``.
   */
  advisorMode?: boolean
}

interface SectionDef {
  id: StudioStep
  anchor: string
  labelKey: StudioSectionLabelKey
  Component: ComponentType<SectionProps>
}

/**
 * Display order for the studio sections.
 *
 * The 2026-05-10 audit found that the panel was structured as a
 * milestone questionnaire (Berkus → Scorecard → Pedigree → Traction)
 * before the founder ever saw what number their inputs were
 * producing. The EV/Revenue spine (Y5 × multiple ÷ ROI) was buried
 * as Section 6, so M&A readers couldn't tell what method the panel
 * was driving without scrolling halfway down.
 *
 * The new order leads with the spine and treats the qualitative
 * cards as overlays:
 *   1. Profile           — who you are (KBO/KVK + stage + sector)
 *   2. Exit Story        — the EV/Revenue math (the headline)
 *   3. Risk reduction    — Berkus overlay
 *   4. Defensibility     — Scorecard overlay
 *   5. Team pedigree     — Founder-pedigree overlay
 *   6. Traction          — SaaS forward overlay (skippable)
 *   7. Round             — cap-table simulator
 *
 * The retired 8th "Report" section was dropped 2026-05-12 — it
 * duplicated the StudioCoPilot issue feed and the sticky
 * StartupSubmitFooter (Aurora "one surface per decision").
 *
 * The remaining seven section IDs are preserved so the analytics
 * funnel (StudioStep enum → trackStudioStepViewed) keeps reporting
 * under the same keys.  Only the rendered order changes.
 */
const SECTIONS: SectionDef[] = [
  {
    id: 'profile',
    anchor: 'startup-section-profile',
    labelKey: 'sections.profile',
    Component: CompanyCardStep,
  },
  {
    id: 'exit_story',
    anchor: 'startup-section-exit',
    labelKey: 'sections.exit_story',
    Component: ExitStoryStep,
  },
  {
    id: 'berkus',
    anchor: 'startup-section-berkus',
    labelKey: 'sections.berkus',
    Component: BerkusStep,
  },
  {
    id: 'scorecard',
    anchor: 'startup-section-scorecard',
    labelKey: 'sections.scorecard',
    Component: ScorecardStep,
  },
  {
    id: 'founder_pedigree',
    anchor: 'startup-section-pedigree',
    labelKey: 'sections.founder_pedigree',
    Component: FounderPedigreeStep,
  },
  {
    id: 'traction',
    anchor: 'startup-section-traction',
    labelKey: 'sections.traction',
    Component: TractionStep,
  },
  {
    id: 'round_simulator',
    anchor: 'startup-section-round',
    labelKey: 'sections.round_simulator',
    Component: RoundSimulatorStep,
  },
]

// ---------------------------------------------------------------------------
// Per-section completion derivation — drives the `complete` state on the
// Aurora-Teal step circles (ring + stronger fill when done).  Mirrors the
// gating logic the StudioShell used to apply, but never blocks navigation
// — the sections are scroll-through, not gated.
// ---------------------------------------------------------------------------

type Status = 'empty' | 'partial' | 'complete'

function useSectionStatuses(): Record<StudioStep, Status> {
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  const businessTypeId = useManualFormStore((s) => s.formData.business_type_id ?? '')
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const maturity = useStartupValuationStore((s) => s.maturity)
  const founderPedigree = useStartupValuationStore((s) => s.founder_pedigree)
  const mrr = useStartupValuationStore((s) => s.mrr)
  const arr = useStartupValuationStore((s) => s.arr)
  const revenueStatus = useStartupValuationStore((s) => s.revenue_status)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)

  return useMemo<Record<StudioStep, Status>>(() => {
    const profileComplete = !!(companyName.trim() && stage && sector && country && businessTypeId)

    const berkusKeys = [
      'sound_idea',
      'prototype_status',
      'management_strength',
      'strategic_relationships',
      'product_rollout',
    ] as const
    const berkusPicked = berkusKeys.filter((k) => maturity[k] !== 'none').length

    const scorecardKeys = [
      'opportunity_size',
      'competitive_environment',
      'sales_marketing_channels',
      'need_for_additional_funding',
      'other_factors',
    ] as const
    const scorecardPicked = scorecardKeys.filter((k) => maturity[k] !== 'none').length

    return {
      profile: profileComplete ? 'complete' : companyName.trim() ? 'partial' : 'empty',
      berkus: berkusPicked === 0 ? 'empty' : berkusPicked >= 4 ? 'complete' : 'partial',
      scorecard: scorecardPicked === 0 ? 'empty' : scorecardPicked >= 3 ? 'complete' : 'partial',
      founder_pedigree: Object.values(founderPedigree).some(Boolean) ? 'complete' : 'empty',
      // Traction is "complete" when the founder either has a revenue
      // signal OR explicitly answered "no, pre-revenue" — both are valid
      // terminal states.  Without the explicit-no path, pre-revenue
      // founders never lit up the green checkmark and the panel always
      // looked unfinished.
      traction:
        (mrr ?? 0) > 0 || (arr ?? 0) > 0
          ? 'complete'
          : revenueStatus === 'no'
            ? 'complete'
            : revenueStatus === 'yes'
              ? 'partial'
              : 'empty',
      exit_story:
        y5 != null && exitMultiple != null
          ? 'complete'
          : y5 != null || exitMultiple != null
            ? 'partial'
            : 'empty',
      round_simulator: investment != null && investment > 0 ? 'complete' : 'empty',
    }
  }, [
    companyName,
    stage,
    sector,
    country,
    businessTypeId,
    maturity,
    founderPedigree,
    mrr,
    arr,
    revenueStatus,
    y5,
    exitMultiple,
    investment,
  ])
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type StartupValuationPanelMode = 'founder' | 'advisor'

export interface StartupValuationPanelProps {
  /** Optional className for the outer wrapper. */
  className?: string
  /**
   * Wizard surface mode — see :type:`StartupValuationPanelMode`.
   * Defaults to ``'advisor'`` so existing accountant call-sites keep
   * the same feature surface they had before.
   */
  mode?: StartupValuationPanelMode
  /** Shared assistant open state from ManualLayout. */
  isAssistantOpen?: boolean
  /** Opens the shared assistant drawer. */
  onOpenAssistant?: () => void
  /** Resolves a startup issue through the shared assistant pipeline. */
  onResolveIssueWithAssistant?: (issue: StudioIssue) => void
  /** Stable launcher scope id for snooze/session keys. */
  launcherScopeId?: string
  /**
   * Optional externally-filtered issue list for the launcher (e.g. after
   * assistant acknowledgements). Falls back to local `useStudioIssues`.
   */
  launcherIssues?: StudioIssue[]
}

export function StartupValuationPanel({
  className,
  mode = 'advisor',
  isAssistantOpen = false,
  onOpenAssistant,
  onResolveIssueWithAssistant,
  launcherScopeId = 'studio-launcher',
  launcherIssues,
}: StartupValuationPanelProps) {
  const tStudio = useTranslations('startupStudio')
  // ``mode`` flows down to each step component as ``advisorMode`` so
  // advisor-only fields (e.g. cumulative dilution to exit on the Round
  // simulator) stay hidden from founders without duplicating the
  // sections.

  // A1 — consume Mercury's bootstrap context (KBO/KVK identity,
  // accountant-attached customer data, accounting integration metadata)
  // and seed the Studio store + canonical form-store BEFORE the
  // session-sync hook starts autosaving.  A founder coming from the
  // Sellability gate or a partner deep-link never re-types identity
  // we already know — fully aligned with the input-only / prefill-
  // everywhere philosophy.  Idempotent + non-destructive: pre-existing
  // user values are never clobbered.
  useStartupPrefill()

  // Bidirectional bridge between the Studio store and the canonical
  // `useSessionStore` pipeline — restore on mount, autosave on every
  // edit (debounced 500ms), `?reset=1` URL handling, flush on unload.
  // Mirrors the SME `useFormSessionSync` pattern in a single hook.
  useStartupSessionSync()

  const statuses = useSectionStatuses()
  // Section-completion summary surfaced to ``PanelHeader`` so a founder
  // (or an advisor running this across many clients) can see at a glance
  // how far through the wizard they are without scrolling.  ``complete``
  // requires the section's primary inputs; ``partial`` counts toward the
  // running tally as a half-step (rounded down).
  const sectionCompletion = useMemo(() => {
    const total = SECTIONS.length
    let complete = 0
    let partial = 0
    for (const section of SECTIONS) {
      const status = statuses[section.id]
      if (status === 'complete') complete++
      else if (status === 'partial') partial++
    }
    return { total, complete, partial }
  }, [statuses])
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  // Health-check feed for the floating Co-pilot — single source of
  // truth for "things to fix before PDF".  Surfaces through the FAB
  // badge and the FindingPeek nudge; the assistant drawer owns
  // remediation.  No inline list lives in the panel anymore.
  const { issues } = useStudioIssues(benchmark)
  const activeLauncherIssues = launcherIssues ?? issues

  // -----------------------------------------------------------------
  // Active-section tracking — drives a `step_viewed` analytics event
  // each time the founder scrolls a new section into view.  Single
  // IntersectionObserver for cheap accuracy.
  // -----------------------------------------------------------------
  const [activeId, setActiveId] = useState<StudioStep>('profile')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const trackedRef = useRef<Set<StudioStep>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    // The active-section highlight is a progressive enhancement.
    //   - jsdom (vitest) ships a stubbed `IntersectionObserver` that's
    //     a `vi.fn()` (callable, not constructable with `new`).
    //   - A small tail of older browsers ships nothing at all.
    // Either way, bail silently rather than crash the render.
    const Ctor = (window as unknown as { IntersectionObserver?: typeof IntersectionObserver })
      .IntersectionObserver
    if (typeof Ctor !== 'function') return
    const observed = SECTIONS.map((s) => sectionRefs.current[s.id]).filter(
      (el): el is HTMLElement => !!el
    )
    if (observed.length === 0) return
    let observer: IntersectionObserver
    try {
      observer = new Ctor(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          const target = visible[0]?.target as HTMLElement | undefined
          const id = target?.dataset.studioStep as StudioStep | undefined
          if (id) setActiveId(id)
        },
        { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
      )
    } catch {
      // Mocked in test runner — skip the enhancement.
      return
    }
    for (const el of observed) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (trackedRef.current.has(activeId)) return
    trackedRef.current.add(activeId)
    trackStudioStepViewed(activeId, stage)
  }, [activeId, stage])

  // Section-completion telemetry — fires the first time each section's
  // derived status flips to 'complete' during this session. Combined
  // with `venus_studio_step_viewed` this gives the funnel a real
  // progression metric (viewed → partial → complete), which the
  // viewed-only event was an incomplete proxy for.
  // Dedup: ``completedRef`` is a Set of section IDs that have already
  // fired in this session. Status changes from complete → partial
  // (e.g. a user clearing a milestone) DO NOT re-fire — this matches
  // the funnel semantics ("did the user reach 'done' for this section
  // at least once?") and avoids spurious double-counts on edits.
  const completedRef = useRef<Set<StudioStep>>(new Set())
  useEffect(() => {
    for (const section of SECTIONS) {
      if (statuses[section.id] === 'complete' && !completedRef.current.has(section.id)) {
        completedRef.current.add(section.id)
        trackStudioStepCompleted(section.id, stage)
      }
    }
  }, [statuses, stage])

  const handleJumpToStep = (id: StudioStepId) => {
    if (typeof window === 'undefined') return
    const def = SECTIONS.find((s) => s.id === id)
    if (!def) return
    scrollAnchorIntoManualLayout(def.anchor, { behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={['aurora-theme space-y-6 p-6', className].filter(Boolean).join(' ')}>
      {/* EV/Revenue valuation header — single sentence on what this
          method is + live blended pre-money + a "X of N sections done"
          progress chip so a founder always sees how close they are to a
          credible report.  The headline number is computed live from
          the inputs below; there's no buried "preview" section to
          scroll to. */}
      <PanelHeader
        sectionsComplete={sectionCompletion.complete}
        sectionsPartial={sectionCompletion.partial}
        sectionsTotal={sectionCompletion.total}
      />
      {SECTIONS.map((section, idx) => {
        const status = statuses[section.id]
        const SectionBody = section.Component
        return (
          <motion.section
            key={section.id}
            ref={(el) => {
              sectionRefs.current[section.id] = el
            }}
            data-studio-step={section.id}
            id={section.anchor}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: idx * 0.02 }}
            className="scroll-mt-6 space-y-5 pt-2"
            aria-label={tStudio(section.labelKey)}
          >
            <ValuationSectionHeader
              step={idx + 1}
              title={tStudio(section.labelKey)}
              complete={status === 'complete'}
            />
            <SectionBody advisorMode={mode === 'advisor'} />
          </motion.section>
        )
      })}

      {/* Studio Co-pilot — proactive remediation surface.  Mounted from
          the panel itself so it renders inside `ManualLayout` (the
          unified surface) and follows the founder/advisor across every
          section.  FAB lives at bottom-right; slide-over hosts the
          structured issue list + free-form chat. */}
      <StudioCoPilot
        issues={activeLauncherIssues}
        scopeId={launcherScopeId}
        isAssistantOpen={isAssistantOpen}
        onOpenAssistant={onOpenAssistant}
        onResolveIssueWithAssistant={(issue) => {
          onResolveIssueWithAssistant?.(issue)
          handleJumpToStep(issue.step)
        }}
      />
    </div>
  )
}

export default StartupValuationPanel
