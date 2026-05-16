'use client'

/**
 * StartupAwareInputPanel
 *
 * Thin orchestrator that picks between the SME `ManualInputPanel`
 * (default) and the dedicated `StartupValuationPanel` (when the user
 * has selected the 9th method, `startup_valuation`).
 *
 * Keeps the venture flow modular: the SME panel stays untouched and the
 * startup form does not have to share its 4.6k-line shell.
 *
 * The startup panel supports ``founder`` vs ``advisor`` surfaces; mode is
 * ``showAdvisorCalculatorSurface(isAccountantForClient, user.role)`` so it
 * stays aligned with ``ManualLayout`` nav filtering and founder-dashboard
 * gating (single contract — no drift).
 *
 * Single shell: prior versions of this orchestrator redirected
 * pre-revenue users to a separate `/[locale]/startup-valuation` Studio
 * v2 page, then bounced them back to `/reports/{id}` on submit.  That
 * round-trip was the source of the "two surfaces, same store" bug —
 * the report page rendered a different (legacy slider) panel than the
 * wizard the founder had just filled in.  The Studio sections now
 * render directly inside `ManualLayout`'s left rail (matching DCF /
 * SaaS / NAV / Adaptive); the standalone Studio page is gone and the
 * `/[locale]/startup-valuation` route is a thin redirect to
 * `/reports/new?selected_method=startup_valuation` for backwards
 * compatibility with partner deep-links.
 */

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { showAdvisorCalculatorSurface } from '@/constants/accountantPlanMethods'
import { AuroraButton } from '@/design-system'
import { ReviewDefaultsModal } from '@/features/startup-studio/components/ReviewDefaultsModal'
import type { StudioIssue } from '@/features/startup-studio/hooks/useStudioIssues'
import { useStudioIssues } from '@/features/startup-studio/hooks/useStudioIssues'
import { useAuth } from '@/hooks/useAuth'
import { trackStudioRunComplete } from '@/lib/analytics'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useBootstrapSafe } from '@/lib/bootstrap/BootstrapProvider'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { StartupSector, StartupStage } from '@/store/manual/useStartupValuationStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import type { ValuationFormData } from '@/types/valuation'
import { getCurrentFilingYear } from '@/utils/fiscalYear'
import { resolveVentureCountryIso2 } from '@/utils/resolveVentureCountryIso2'
import { ManualInputPanel } from '../../ManualInputPanel'
import { StartupValuationPanel } from './StartupValuationPanel'

export type StartupAwareInputPanelProps = ComponentProps<typeof ManualInputPanel> & {
  isAssistantOpen?: boolean
  onOpenAssistant?: () => void
  onResolveIssueWithAssistant?: (issue: StudioIssue) => void
  startupLauncherIssues?: StudioIssue[]
  startupLauncherScopeId?: string
}

const STAGE_QUERY_KEY = 'startup_stage'
const VALID_STAGES: ReadonlySet<StartupStage> = new Set<StartupStage>([
  'pre_seed',
  'seed',
  'series_a',
])

/**
 * Read a one-shot ``?startup_stage=`` deep-link param from Mercury and
 * seed the Venus startup store with it on first mount.  Idempotent and
 * SSR-safe: the effect runs exactly once per page load on the client and
 * silently bails out if the param is missing or invalid.
 *
 * The full prefill chain (KBO identity, sector inference, traction,
 * round size) lives in :func:`useStartupPrefill`, mounted inside
 * `StartupValuationPanel`.  This thin wrapper exists so the deep-link
 * stage seed fires even when the founder hasn't yet picked the
 * startup method (the panel hasn't mounted), matching Mercury's
 * cross-app contract that a `?startup_stage=` URL pre-selects the
 * stage independently of when the panel itself mounts.  When both
 * fire, the second `setField('stage', X)` is a no-op (same value).
 */
function useStartupStageDeepLinkPrefill() {
  const setField = useStartupValuationStore((s) => s.setField)
  const appliedRef = useRef(false)
  useEffect(() => {
    if (appliedRef.current) return
    if (typeof window === 'undefined') return
    appliedRef.current = true
    try {
      const raw = new URLSearchParams(window.location.search).get(STAGE_QUERY_KEY)
      if (!raw) return
      if (!VALID_STAGES.has(raw as StartupStage)) return
      setField('stage', raw as StartupStage)
    } catch {
      /* URL not parseable — ignore */
    }
  }, [setField])
}

/**
 * Legacy sessionStorage key — preserved as an exported constant ONLY
 * so the `/reports/new` redirect contract can clear any leftover
 * payloads that older builds may have stashed in the user's browser.
 * No code path writes to this key any more (the wizard round-trip is
 * gone), but reading it is safe and lets us be a good neighbour to
 * users hopping between deploys.
 *
 * @deprecated The Studio v2 wizard round-trip is gone; the panel now
 * renders directly inside `ManualLayout`.  Remove this export once
 * we're confident no stale clients depend on it (target: 2026-Q3).
 */
export const ADVISOR_HANDOFF_KEY = 'upswitch.studio.advisor_handoff'

export interface AdvisorHandoff {
  reportId: string
  locale: 'en' | 'nl'
  mode?: string
  clientId?: string
  returnUrl?: string
  source?: string
}

/**
 * Build the synthetic ``data`` payload that ``handleManualSubmit`` is
 * shaped to receive.  The startup engine derives value entirely from
 * the persisted ``useStartupValuationStore`` + identity fields on
 * ``useManualFormStore`` — the SME-only fields (`yearlyFinancials`,
 * `businessType`) are present only to satisfy the UI's
 * `setCollectedData` call and are bypassed in the validators.
 */
export function buildStartupSubmitPayload(): Record<string, unknown> {
  const formState = useManualFormStore.getState().formData as ValuationFormData
  const studio = useStartupValuationStore.getState()
  const sector: StartupSector = studio.sector
  const resolvedCountry = resolveVentureCountryIso2(formState)
  const fy = formState.founding_year
  const yearFounded =
    typeof fy === 'number' && Number.isFinite(fy) && fy >= 1900 && fy <= 2100
      ? fy
      : getCurrentFilingYear()
  return {
    companyName: formState.company_name?.trim() || 'Unknown Startup',
    businessType: formState.business_type ?? 'startup',
    industry: formState.industry ?? 'technology',
    business_model: formState.business_model ?? sector,
    businessModel: formState.business_model ?? sector,
    country: resolvedCountry,
    yearFounded,
    yearlyFinancials: [],
    ownerManagers: 1,
    fteEmployees: 0,
  }
}

/**
 * Sticky CTA footer rendered below the unified `StartupValuationPanel`
 * inside `ManualLayout`'s left rail.  The panel itself is a pure input
 * surface (no inline submit button); this footer is the canonical
 * trigger for `valuationService.calculateValuation` — same path the
 * SME methods use.
 *
 * Submit is explicit and reactive-gated:
 *   - disabled while a calculation is in flight,
 *   - disabled when the company name is empty (the engine refuses an
 *     empty identity envelope),
 *   - disabled until the founder picks at least one Berkus / Scorecard
 *     milestone (the engine would otherwise produce a meaningless €0
 *     pre-money against the all-zero default state, polluting the
 *     session history and the per-account result store).
 *
 * The disabled state mirrors every gate the click handler enforces —
 * we never want a button that looks enabled but silently no-ops.
 */
export function StartupSubmitFooter({
  onSubmit,
  isCalculating,
}: {
  onSubmit?: (data: any) => void | Promise<void>
  isCalculating: boolean
}) {
  const params = useParams<{ locale?: string; id?: string }>()
  const t = useTranslations('startupStudio.submit')
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')
  // Reactive milestone-pick gate.  We subscribe to `maturity` so the
  // submit button flips from disabled → enabled the moment the founder
  // picks their first Berkus / Scorecard option, without waiting for
  // an unrelated render to flush the cached function-call result.
  const hasAnyMilestone = useStartupValuationStore((s) =>
    Object.values(s.maturity).some((v) => v !== 'none')
  )
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'

  // A15 — third submit gate: any `useStudioIssues` finding with
  // severity 'block' that the existing identity / milestone gates
  // don't already cover.  Without this, a founder could submit with
  // (e.g.) a positive pedigree flag whose evidence is empty — the
  // engine would zero the multiplier and produce a report that
  // doesn't match what the founder saw on screen.  We exclude the
  // two stable IDs the explicit gates already cover so the same
  // failure isn't counted twice in the helper-text branching.
  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const { blockers: allBlockers } = useStudioIssues(benchmark)
  const ALREADY_GATED_IDS = useMemo(
    () => new Set(['missing_company_name', 'missing_first_milestone']),
    []
  )
  const extraBlockers = useMemo(
    () => allBlockers.filter((b) => !ALREADY_GATED_IDS.has(b.id)),
    [allBlockers, ALREADY_GATED_IDS]
  )
  const hasExtraBlockers = extraBlockers.length > 0

  // Review-defaults gate (audit issue #7).  Submit is a two-step:
  //   1. First click opens a confirmation modal listing every assumption
  //      the engine will use, tagging the ones still on smart-default.
  //   2. Modal Confirm fires the real `onSubmit`.
  // The first click never fires the actual valuation — protects founders
  // from generating an "investor-ready" report against unreviewed
  // defaults (Y5, ROI, sector, exit multiple, etc.).
  const [reviewOpen, setReviewOpen] = useState(false)

  const fireSubmit = useCallback(() => {
    if (!onSubmit) return
    // Fire `venus_studio_run_complete` exactly when the user explicitly
    // triggers the calculation.  The downstream Titan response carries
    // the canonical report id; this event marks the submit moment from
    // the founder's perspective so the funnel dashboards keep reading
    // the same shape they did under the old auto-fire wizard.
    trackStudioRunComplete(params?.id ?? '', stage)
    void onSubmit(buildStartupSubmitPayload())
  }, [onSubmit, params?.id, stage])

  const handleClick = useCallback(() => {
    if (!onSubmit) return
    if (isCalculating) return
    if (!hasAnyMilestone) return
    // A15 — extra blockers (e.g. positive pedigree flag with empty
    // evidence) also gate. The button is already disabled in this
    // state — the early-return is a defence-in-depth in case the
    // disabled-state and click-handler ever drift.
    if (hasExtraBlockers) return
    setReviewOpen(true)
  }, [onSubmit, isCalculating, hasAnyMilestone, hasExtraBlockers])

  const handleConfirm = useCallback(() => {
    setReviewOpen(false)
    fireSubmit()
  }, [fireSubmit])

  const handleCancel = useCallback(() => setReviewOpen(false), [])

  const missingCompanyName = !companyName.trim()
  const missingMilestone = !hasAnyMilestone
  // Disabled state mirrors every gate the click handler enforces — so
  // a disabled button never silently no-ops on click (the silent no-op
  // pattern feels broken to the user).  A15 added blocker-issue gate.
  const disabled = isCalculating || missingCompanyName || missingMilestone || hasExtraBlockers

  // The helper text is mutually exclusive: company-name takes priority
  // because the founder typically lands at the top of the panel and
  // hasn't scrolled down to the milestones yet.  Once they fill in the
  // identity, the milestone hint takes over, and finally any other
  // engine-blocker findings (A15) so a founder always sees the
  // single most-actionable next step under the disabled button.
  const helperText = missingCompanyName
    ? t('hintMissingCompany')
    : missingMilestone
      ? t('hintMissingMilestone')
      : hasExtraBlockers
        ? t('hintBlockerIssues', { count: extraBlockers.length })
        : null

  return (
    <>
      <div
        id="startup-submit-footer"
        className="sticky bottom-0 z-20 shrink-0 -mx-4 px-4 py-3 border-t border-foreground/[0.06] bg-background/95 backdrop-blur"
      >
        <AuroraButton
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          loading={isCalculating}
          disabled={disabled}
          onClick={handleClick}
        >
          {isCalculating ? t('calculating') : t('generate')}
        </AuroraButton>
        {helperText && (
          <p className="mt-2 text-center text-[11px] text-foreground/60">{helperText}</p>
        )}
      </div>
      {/* Mount the modal only when it is open. ``ReviewDefaultsModal``
          subscribes to the startup store + ``useStartupBenchmark``
          unconditionally inside its body (rules-of-hooks), so keeping
          it mounted while closed would re-run those hooks on every
          panel render — wasteful, and breaks Storybook / unit tests
          that don't seed the benchmark hook.  Conditional mount keeps
          the hook tree dormant until the user actually clicks
          "Generate". */}
      {reviewOpen && (
        <ReviewDefaultsModal open={reviewOpen} onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </>
  )
}

export function StartupAwareInputPanel(props: StartupAwareInputPanelProps) {
  const {
    isAssistantOpen = false,
    onOpenAssistant,
    onResolveIssueWithAssistant,
    startupLauncherIssues,
    startupLauncherScopeId,
    ...manualInputPanelProps
  } = props
  const effectiveMethod = useManualResultsStore((s) => s.preSelectedMethod ?? s.selectedMethod)
  // ``useBootstrapSafe`` may be null (tests, Storybook). ``useAuth`` supplies
  // role for standalone advisors — same helper as ``ManualLayout``'s
  // ``showFullAdvisorMethodNav`` (`showAdvisorCalculatorSurface`).
  const bootstrap = useBootstrapSafe()
  const { user } = useAuth()
  const startupMode: 'founder' | 'advisor' = showAdvisorCalculatorSurface(
    Boolean(bootstrap?.isAccountantFlow),
    user?.role
  )
    ? 'advisor'
    : 'founder'

  const isCalculating = useManualResultsStore((s) => s.isCalculating)

  // Lightweight stage-only deep-link prefill — fires regardless of
  // whether the panel itself is mounted yet (Mercury may send the URL
  // param before the user picks the method).  The full prefill chain
  // (KBO identity, NACE→sector inference, accounting-derived SaaS
  // metrics, round-size URL param) lives in `useStartupPrefill`,
  // mounted inside `StartupValuationPanel`.  Both are idempotent;
  // duplicate `setField('stage', X)` writes with the same value are
  // a no-op.
  useStartupStageDeepLinkPrefill()

  if (effectiveMethod === 'startup_valuation') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <StartupValuationPanel
            mode={startupMode}
            isAssistantOpen={isAssistantOpen}
            onOpenAssistant={onOpenAssistant}
            onResolveIssueWithAssistant={onResolveIssueWithAssistant}
            launcherScopeId={startupLauncherScopeId}
            launcherIssues={startupLauncherIssues}
          />
        </div>
        <StartupSubmitFooter
          onSubmit={manualInputPanelProps.onSubmit}
          isCalculating={isCalculating}
        />
      </div>
    )
  }

  return <ManualInputPanel {...manualInputPanelProps} />
}

export default StartupAwareInputPanel
