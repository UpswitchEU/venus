'use client'

/**
 * StartupValuationPanel
 * ---------------------
 *
 * Self-contained left-rail panel for the 9th valuation method
 * (`startup_valuation`).  Renders the canonical eight Studio sections
 * stacked top-to-bottom inside `ManualLayout`'s ManualInputPanel slot,
 * matching the rhythm of every other method (DCF, SaaS, NAV, Adaptive):
 * a numbered Aurora-Teal section header per block, no Next/Back wizard,
 * no separate page, scroll-and-edit.
 *
 *   1. Profile        — canonical company card (KBO/KVK + business types)
 *   2. Risk reduction — Berkus 2.0 milestone cards
 *   3. Defensibility  — Scorecard 2.0 weighted factor cards
 *   4. Team           — Founder pedigree multiplier
 *   5. Traction       — Forward-looking SaaS metrics (skippable)
 *   6. Exit story     — VC method / TAM-SAM-SOM / exit multiple
 *   7. Round          — SAFE vs priced-round simulator
 *   8. Report         — Investor-ready preview (no submit; the
 *                       canonical `StartupSubmitFooter` rendered by
 *                       `StartupAwareInputPanel` owns the submit and
 *                       the round-trip to `valuationService`).
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
 *   - `founder` — same surface, mode-aware copy on the Studio sections
 *     that already accept a locale/mode prop.  The submit footer below
 *     the panel routes the calculation back to the founder dashboard.
 */

import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ValuationSectionHeader } from '@/components/calculator/sections/ValuationSectionHeader'
import { BerkusStep } from '@/features/startup-studio/components/BerkusStep'
import { CompanyCardStep } from '@/features/startup-studio/components/CompanyCardStep'
import { ExitStoryStep } from '@/features/startup-studio/components/ExitStoryStep'
import { FounderPedigreeStep } from '@/features/startup-studio/components/FounderPedigreeStep'
import { ReportStep } from '@/features/startup-studio/components/ReportStep'
import { RoundSimulatorStep } from '@/features/startup-studio/components/RoundSimulatorStep'
import { ScorecardStep } from '@/features/startup-studio/components/ScorecardStep'
import { StudioCoPilot } from '@/features/startup-studio/components/StudioCoPilot'
import { TractionStep } from '@/features/startup-studio/components/TractionStep'
import {
  type StudioStepId,
  useStudioIssues,
} from '@/features/startup-studio/hooks/useStudioIssues'
import { type StudioStep, trackStudioStepViewed } from '@/lib/analytics'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

// ---------------------------------------------------------------------------
// Section model — single source of truth for the order + labels.  Mirrors
// the analytics `StudioStep` enum so funnel dashboards keep reading the
// same shape they did under the timeline UX.
// ---------------------------------------------------------------------------

interface SectionDef {
  id: StudioStep
  anchor: string
  label: { en: string; nl: string }
  render: (locale: 'en' | 'nl') => React.ReactNode
}

const SECTIONS: SectionDef[] = [
  {
    id: 'profile',
    anchor: 'startup-section-profile',
    label: { en: 'Profile', nl: 'Profiel' },
    render: (locale) => <CompanyCardStep locale={locale} />,
  },
  {
    id: 'berkus',
    anchor: 'startup-section-berkus',
    label: { en: 'Risk reduction', nl: 'Risico-reductie' },
    render: (locale) => <BerkusStep locale={locale} />,
  },
  {
    id: 'scorecard',
    anchor: 'startup-section-scorecard',
    label: { en: 'Defensibility', nl: 'Defensibility' },
    render: (locale) => <ScorecardStep locale={locale} />,
  },
  {
    id: 'founder_pedigree',
    anchor: 'startup-section-pedigree',
    label: { en: 'Team pedigree', nl: 'Team' },
    render: (locale) => <FounderPedigreeStep locale={locale} />,
  },
  {
    id: 'traction',
    anchor: 'startup-section-traction',
    label: { en: 'Traction', nl: 'Tractie' },
    render: (locale) => <TractionStep locale={locale} />,
  },
  {
    id: 'exit_story',
    anchor: 'startup-section-exit',
    label: { en: 'Exit story', nl: 'Exit-verhaal' },
    render: (locale) => <ExitStoryStep locale={locale} />,
  },
  {
    id: 'round_simulator',
    anchor: 'startup-section-round',
    label: { en: 'Round', nl: 'Ronde' },
    render: (locale) => <RoundSimulatorStep locale={locale} />,
  },
  {
    id: 'report',
    anchor: 'startup-section-report',
    label: { en: 'Report', nl: 'Rapport' },
    render: (locale) => <ReportStep locale={locale} />,
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
  const evidenceNotes = useStartupValuationStore((s) => s.evidence_notes)
  const founderPedigree = useStartupValuationStore((s) => s.founder_pedigree)
  const mrr = useStartupValuationStore((s) => s.mrr)
  const arr = useStartupValuationStore((s) => s.arr)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)

  return useMemo<Record<StudioStep, Status>>(() => {
    const profileComplete = !!(
      companyName.trim() &&
      stage &&
      sector &&
      country &&
      businessTypeId
    )

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

    const evidenceCount = Object.values(evidenceNotes).filter(
      (v) => typeof v === 'string' && v.trim().length > 0
    ).length

    return {
      profile: profileComplete ? 'complete' : companyName.trim() ? 'partial' : 'empty',
      berkus:
        berkusPicked === 0 ? 'empty' : berkusPicked >= 4 ? 'complete' : 'partial',
      scorecard:
        scorecardPicked === 0 ? 'empty' : scorecardPicked >= 3 ? 'complete' : 'partial',
      founder_pedigree: Object.values(founderPedigree).some(Boolean) ? 'complete' : 'empty',
      traction: (mrr ?? 0) > 0 || (arr ?? 0) > 0 ? 'complete' : 'partial',
      exit_story:
        y5 != null && exitMultiple != null
          ? 'complete'
          : y5 != null || exitMultiple != null
            ? 'partial'
            : 'empty',
      round_simulator: investment != null && investment > 0 ? 'complete' : 'empty',
      report: evidenceCount > 0 ? 'partial' : 'empty',
    }
  }, [
    companyName,
    stage,
    sector,
    country,
    businessTypeId,
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
}

export function StartupValuationPanel({
  className,
  mode = 'advisor',
}: StartupValuationPanelProps) {
  const locale = useStartupValuationStore.getState().country_code === 'NL' ? 'nl' : 'en'
  // Kept on the surface for parity with the prior implementation; the
  // section components are mode-agnostic for now and `mode` is reserved
  // for the StudioCoPilot scoping (advisor vs founder grounding).
  void mode

  const statuses = useSectionStatuses()
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')

  // Health-check feed for the floating Co-pilot.  The same hook drives
  // the `ReportStep` summary block and the Co-pilot rail, keeping the
  // single source of truth for "things to fix before PDF".
  const { issues } = useStudioIssues(benchmark)

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
    const observed = SECTIONS.map((s) => sectionRefs.current[s.id]).filter(
      (el): el is HTMLElement => !!el
    )
    if (observed.length === 0) return
    const observer = new IntersectionObserver(
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
    for (const el of observed) observer.observe(el)
    return () => observer.disconnect()
    // The section list is static, so length-keyed re-bind is enough.
  }, [])

  useEffect(() => {
    if (trackedRef.current.has(activeId)) return
    trackedRef.current.add(activeId)
    trackStudioStepViewed(activeId, stage)
  }, [activeId, stage])

  const handleJumpToStep = (id: StudioStepId) => {
    if (typeof window === 'undefined') return
    const def = SECTIONS.find((s) => s.id === id)
    if (!def) return
    const el = document.getElementById(def.anchor)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={['aurora-theme space-y-8 p-4 pb-32', className].filter(Boolean).join(' ')}>
      {SECTIONS.map((section, idx) => {
        const status = statuses[section.id]
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
            transition={{ duration: 0.25, ease: 'easeOut', delay: idx * 0.02 }}
            className="scroll-mt-6 space-y-4"
            aria-label={section.label[locale]}
          >
            <ValuationSectionHeader
              step={idx + 1}
              title={section.label[locale]}
              complete={status === 'complete'}
            />
            {section.render(locale)}
          </motion.section>
        )
      })}

      {/* Studio Co-pilot — proactive remediation surface.  Mounted from
          the panel itself so it renders inside `ManualLayout` (the
          unified surface) and follows the founder/advisor across every
          section.  FAB lives at bottom-right; slide-over hosts the
          structured issue list + free-form chat. */}
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

export default StartupValuationPanel
