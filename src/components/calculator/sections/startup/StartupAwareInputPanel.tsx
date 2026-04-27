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
import { type ComponentProps, useCallback, useEffect, useRef } from 'react'
import { showAdvisorCalculatorSurface } from '@/constants/accountantPlanMethods'
import { AuroraButton } from '@/design-system'
import { useAuth } from '@/hooks/useAuth'
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

export type StartupAwareInputPanelProps = ComponentProps<typeof ManualInputPanel>

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
 * Sticky CTA footer rendered below the legacy ``StartupValuationPanel``.
 *
 * The legacy panel was authored as a pure input surface (no submit
 * button — calculation used to be auto-fired via the SME panel).
 * Without this footer founders coming out of Studio v2 cannot trigger
 * the engine at all; they simply land on the report page with a filled
 * form and no obvious "go" affordance.
 *
 * Submit is explicit: the user clicks Generate after filling in the
 * sections.  We refuse to fire when no milestone has been picked yet
 * so the engine never silently produces a meaningless €0 pre-money
 * against the all-zero default state (which would pollute the user's
 * session history and the per-account result store).
 */
function studioStoreHasAnyMilestonePick(): boolean {
  const maturity = useStartupValuationStore.getState().maturity
  return Object.values(maturity).some((v) => v !== 'none')
}

export function StartupSubmitFooter({
  onSubmit,
  isCalculating,
}: {
  onSubmit?: (data: any) => void | Promise<void>
  isCalculating: boolean
}) {
  const params = useParams<{ locale?: string }>()
  const locale = params?.locale === 'nl' ? 'nl' : 'en'
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')

  const handleClick = useCallback(() => {
    if (!onSubmit) return
    if (isCalculating) return
    if (!studioStoreHasAnyMilestonePick()) return
    void onSubmit(buildStartupSubmitPayload())
  }, [onSubmit, isCalculating])

  const disabled = isCalculating || !companyName.trim()
  return (
    <div className="sticky bottom-0 z-20 shrink-0 -mx-4 px-4 py-3 border-t border-foreground/[0.06] bg-background/95 backdrop-blur">
      <AuroraButton
        type="button"
        variant="primary"
        size="lg"
        fullWidth
        loading={isCalculating}
        disabled={disabled}
        onClick={handleClick}
      >
        {isCalculating
          ? locale === 'nl'
            ? 'Berekenen…'
            : 'Calculating…'
          : locale === 'nl'
            ? 'Genereer startup waardering'
            : 'Generate startup valuation'}
      </AuroraButton>
      {!companyName.trim() && (
        <p className="mt-2 text-center text-[11px] text-foreground/60">
          {locale === 'nl'
            ? 'Vul eerst de bedrijfsnaam bovenaan in om je rapport te genereren.'
            : 'Add the company name above to unlock report generation.'}
        </p>
      )}
    </div>
  )
}

export function StartupAwareInputPanel(props: StartupAwareInputPanelProps) {
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

  useStartupStageDeepLinkPrefill()

  if (effectiveMethod === 'startup_valuation') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <StartupValuationPanel mode={startupMode} />
        </div>
        <StartupSubmitFooter onSubmit={props.onSubmit} isCalculating={isCalculating} />
      </div>
    )
  }

  return <ManualInputPanel {...props} />
}

export default StartupAwareInputPanel
