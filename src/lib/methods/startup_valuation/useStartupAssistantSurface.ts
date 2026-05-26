/**
 * useStartupAssistantSurface — derives the venture-path assistant data the
 * panel needs (startup issues, launcher issues, by-id lookup map) from the
 * `useStartupValuationStore` selectors and the `useStudioIssues` hook.
 *
 * Before this extraction, ~80 lines of useStartupValuationStore selectors +
 * useStartupBenchmark/useStudioIssues calls + three useMemo blocks lived
 * inline in `ManualLayout.tsx`. Consolidating them here keeps the panel
 * thin and gives the venture path a dedicated home for future expansion
 * (Inception Lens, oversubscription flags, etc. all flow through the same
 * `StudioIssue` pipeline).
 *
 * The hook short-circuits to empty arrays/maps when `isStartupAssistantRoute`
 * is false — the SME paths pay zero cost. All filtering and mapping is
 * gated behind that flag.
 */

import { useMemo } from 'react'
import type { StartupAssistantIssue } from '@/components/calculator'
import { type StudioIssue, useStudioIssues } from '@/features/startup-studio/hooks/useStudioIssues'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { getStartupIssueQuickFixLabel } from './startupIssueQuickFix'

/** Step labels shown in the assistant's "Jump to" affordance, per locale. */
const STUDIO_STEP_LABELS: Record<StudioIssue['step'], { en: string; nl: string }> = {
  profile: { en: 'Profile', nl: 'Profiel' },
  berkus: { en: 'Risk reduction', nl: 'Risico-reductie' },
  scorecard: { en: 'Defensibility', nl: 'Verdedigbaarheid' },
  founder_pedigree: { en: 'Team pedigree', nl: 'Team' },
  traction: { en: 'Traction', nl: 'Tractie' },
  exit_story: { en: 'Exit story', nl: 'Exit-verhaal' },
  round_simulator: { en: 'Round', nl: 'Ronde' },
}

export interface UseStartupAssistantSurfaceParams {
  /** Derived from `isVenturePathMethodKey(effectiveAssistantMethod)`. */
  isStartupAssistantRoute: boolean
  /** Set of issue ids the user has dismissed or fixed via the assistant. */
  acknowledgedStartupIssues: Set<string>
  /** Active assistant locale; drives label + prompt copy. */
  assistantLocale: 'en' | 'nl'
  /**
   * Wraps the raw `issue.assistantPrompt[locale]` for routing to the AI
   * assistant. Owned by the panel because it depends on panel-side context.
   */
  formatStartupAssistantPrompt: (prompt: string) => string
}

export interface UseStartupAssistantSurfaceResult {
  /** Filtered + locale-mapped issues for the assistant rail. */
  startupIssues: StartupAssistantIssue[]
  /** Same filter without the locale mapping — for the studio launcher card. */
  startupLauncherIssues: StudioIssue[]
  /** O(1) lookup of launcher issues by id (used by click-to-jump handlers). */
  startupIssueById: Map<string, StudioIssue>
}

export function useStartupAssistantSurface(
  params: UseStartupAssistantSurfaceParams
): UseStartupAssistantSurfaceResult {
  const {
    isStartupAssistantRoute,
    acknowledgedStartupIssues,
    assistantLocale,
    formatStartupAssistantPrompt,
  } = params

  const startupCountry = useStartupValuationStore((s) => s.country_code) || 'BE'
  const startupStage = useStartupValuationStore((s) => s.stage)
  const startupSector = useStartupValuationStore((s) => s.sector)

  const { benchmark: startupBenchmark } = useStartupBenchmark(
    startupCountry,
    startupStage,
    startupSector,
    isStartupAssistantRoute
  )
  const { issues: startupRawIssues } = useStudioIssues(startupBenchmark)

  const startupIssues = useMemo<StartupAssistantIssue[]>(() => {
    if (!isStartupAssistantRoute) return []
    return startupRawIssues
      .filter((issue) => issue.severity !== 'info')
      .filter((issue) => !acknowledgedStartupIssues.has(issue.id))
      .map((issue) => ({
        id: issue.id,
        severity: issue.severity,
        title: issue.title[assistantLocale],
        body: issue.body[assistantLocale],
        action: issue.action[assistantLocale],
        ctaLabel: assistantLocale === 'nl' ? 'Fix met AI' : 'Fix with AI',
        ctaPrompt: formatStartupAssistantPrompt(issue.assistantPrompt[assistantLocale]),
        quickFixLabel: getStartupIssueQuickFixLabel(issue.id, assistantLocale),
        jumpLabel: `${assistantLocale === 'nl' ? 'Ga naar' : 'Jump to'} ${
          STUDIO_STEP_LABELS[issue.step][assistantLocale]
        }`,
      }))
  }, [
    acknowledgedStartupIssues,
    assistantLocale,
    formatStartupAssistantPrompt,
    isStartupAssistantRoute,
    startupRawIssues,
  ])

  const startupLauncherIssues = useMemo<StudioIssue[]>(() => {
    if (!isStartupAssistantRoute) return []
    return startupRawIssues
      .filter((issue) => issue.severity !== 'info')
      .filter((issue) => !acknowledgedStartupIssues.has(issue.id))
  }, [acknowledgedStartupIssues, isStartupAssistantRoute, startupRawIssues])

  const startupIssueById = useMemo(
    () => new Map(startupLauncherIssues.map((issue) => [issue.id, issue])),
    [startupLauncherIssues]
  )

  return {
    startupIssues,
    startupLauncherIssues,
    startupIssueById,
  }
}
