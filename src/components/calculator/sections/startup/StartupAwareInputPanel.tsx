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
 */

import { useParams, useRouter } from 'next/navigation'
import { type ComponentProps, useCallback, useEffect, useRef } from 'react'
import { isStartupStudioV2Enabled } from '@/config/features'
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
 * SessionStorage key for the advisor → Studio v2 → report round-trip
 * handoff.  When an advisor coming from Mercury enters the wizard we
 * stash the original report id + Mercury context here so
 * `StartupStudioPage.handleSubmit` can route the calculation back to
 * the SAME report (instead of creating a new one via `/reports/new`,
 * the founder default).  Cleared once consumed.
 */
export const ADVISOR_HANDOFF_KEY = 'upswitch.studio.advisor_handoff'

export interface AdvisorHandoff {
  reportId: string
  locale: 'en' | 'nl'
  /** Mercury hand-off context — preserved verbatim so the bootstrap
   *  fallback path (sourceApp === 'mercury' && reportId && !clientToken)
   *  can restore the accountant-for-client identity on return. */
  mode?: string
  clientId?: string
  returnUrl?: string
  source?: string
}

function captureAdvisorHandoff(payload: AdvisorHandoff): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(ADVISOR_HANDOFF_KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage disabled (incognito/Safari) — wizard will fall
    // back to the founder default (`/reports/new`); the advisor still
    // gets a usable report, just not stitched to the original id.
  }
}

/**
 * Re-route every pre-revenue user (founders AND advisors) to the
 * Studio v2 wizard the first time they land on the legacy slider
 * panel.  For advisors coming from Mercury we additionally stash the
 * report id + Mercury context so the wizard can return them to the
 * SAME report.  Idempotent: bails out the moment a startup result
 * already exists (so we never yank a user out of an open report) or
 * the URL marks them as already returning from the Studio.
 */
function useStartupStudioRedirect(
  method: string | null | undefined,
  startupMode: 'founder' | 'advisor',
  /** True while the BootstrapProvider is still resolving auth +
   *  client-context exchange.  We MUST wait for this to settle before
   *  redirecting: until then `isAccountantFlow` may be stale-false,
   *  which would misclassify an advisor as a founder, skip the
   *  Mercury-handoff capture, and silently misroute the wizard's
   *  submission to `/reports/new` instead of the original report id. */
  isBootstrapPending: boolean
) {
  const router = useRouter()
  const params = useParams<{ locale?: string; id?: string }>()
  // Treat as "in-flight" the moment a result has been computed in this
  // session — we don't want to yank a user out of an open report.
  const hasStartupResult = useManualResultsStore((s) => s.result != null)
  const redirectedRef = useRef(false)

  useEffect(() => {
    if (redirectedRef.current) return
    if (method !== 'startup_valuation') return
    if (!isStartupStudioV2Enabled()) return
    if (hasStartupResult) return
    if (isBootstrapPending) return
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    // Two return-from-Studio signals: founders carry `source=studio_v2`,
    // advisors carry `studio_completed=1` (so `source=mercury` can
    // remain intact for the bootstrap fallback).
    if (search.get('source') === 'studio_v2') return
    if (search.get('studio_completed') === '1') return
    if (search.get('studio') === 'legacy') return

    const locale = params?.locale === 'nl' ? 'nl' : 'en'

    // Advisor entry: stash the report id + Mercury context so the
    // wizard's submit handler can route back to the same report.
    if (startupMode === 'advisor') {
      const reportId = params?.id?.trim()
      if (reportId) {
        captureAdvisorHandoff({
          reportId,
          locale,
          mode: search.get('mode') ?? undefined,
          clientId: search.get('clientId') ?? undefined,
          returnUrl: search.get('return_url') ?? undefined,
          source: search.get('source') ?? undefined,
        })
      }
    }

    redirectedRef.current = true
    // `?from=advisor` is the URL signal that gates handoff consumption
    // in `StartupStudioPage.handleSubmit`.  Without it, a stale
    // sessionStorage handoff (advisor abandoned mid-wizard) could
    // misroute a subsequent founder's submission to the wrong report
    // id.  The signal lives only on the wizard URL, so a fresh direct
    // visit to `/startup-valuation` cannot consume a leftover payload.
    const wizardPath =
      startupMode === 'advisor'
        ? `/${locale}/startup-valuation?from=advisor`
        : `/${locale}/startup-valuation`
    router.push(wizardPath)
  }, [method, hasStartupResult, isBootstrapPending, router, params, startupMode])
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
 * Auto-fire: when the URL carries ``?source=studio_v2`` we click the
 * CTA exactly once on mount so the hand-off from the wizard feels
 * seamless.  The auto-fire is gated on the calculation not already
 * being in flight (so a manual click + auto-fire never race).
 */
/**
 * True if the founder has actually picked at least one Berkus / Scorecard
 * milestone in the wizard.  Auto-fire is gated on this so we never run the
 * engine against the default all-zero state — a calculation against zeros
 * silently produces a meaningless €0 pre-money and pollutes the user's
 * session history.  Same gate applies to the manual button (the wizard's
 * blocker already enforces it on the way out).
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
  const hasResult = useManualResultsStore((s) => s.result != null)

  const handleClick = useCallback(() => {
    if (!onSubmit) return
    if (isCalculating) return
    void onSubmit(buildStartupSubmitPayload())
  }, [onSubmit, isCalculating])

  // One-shot auto-fire when arriving from Studio v2.  `autoFiredRef`
  // ensures we never re-fire on re-renders, and the absence of an
  // existing result guards against re-firing on report reload.
  //
  // Hydration: Zustand's `persist` middleware hydrates synchronously
  // when `localStorage` is available, but we still call
  // `persist.hasHydrated()` defensively — async storage adapters
  // (mobile, tests with mocked storage) need an extra tick before the
  // founder's milestone picks are visible to `getState()`.
  const autoFiredRef = useRef(false)
  useEffect(() => {
    if (autoFiredRef.current) return
    if (typeof window === 'undefined') return
    if (!onSubmit) return
    if (isCalculating || hasResult) return
    if (!companyName.trim()) return

    const search = new URLSearchParams(window.location.search)
    // Two return-from-Studio signals — see `useStartupStudioRedirect`
    // for the rationale (advisors keep `source=mercury` intact for the
    // bootstrap fallback and use `studio_completed=1` instead).
    const fromStudio =
      search.get('source') === 'studio_v2' || search.get('studio_completed') === '1'
    if (!fromStudio) return

    // Defer until persist has rehydrated; subscribe once so a slow
    // adapter still triggers the auto-fire when it eventually finishes.
    const persistApi = (
      useStartupValuationStore as unknown as {
        persist?: {
          hasHydrated?: () => boolean
          onFinishHydration?: (cb: () => void) => () => void
        }
      }
    ).persist

    const fire = () => {
      if (autoFiredRef.current) return
      if (!studioStoreHasAnyMilestonePick()) {
        // Founder shared the deep-link with a fresh device / cleared
        // localStorage — there's nothing meaningful to calculate yet.
        // Surface the manual button instead of silently firing zeros.
        autoFiredRef.current = true
        return
      }
      autoFiredRef.current = true
      void onSubmit(buildStartupSubmitPayload())
    }

    if (!persistApi || persistApi.hasHydrated?.() !== false) {
      fire()
      return
    }
    const unsub = persistApi.onFinishHydration?.(fire)
    return () => {
      unsub?.()
    }
  }, [onSubmit, isCalculating, hasResult, companyName])

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
  // Studio v2 is the canonical pre-revenue surface for BOTH founders
  // and advisors.  Advisors get the same evidence-card wizard founders
  // already use; the round-trip back to the original Mercury report is
  // handled via `ADVISOR_HANDOFF_KEY` in sessionStorage.
  //
  // `isBootstrapPending` defends the founder/advisor classification
  // from a known race: `useBootstrapSafe()` returns `null` (then a
  // hydrating object) before client-context exchange resolves.  An
  // accountant-for-client identity therefore reads as "founder" for
  // the first render or two — and without this gate we'd redirect
  // them as a founder, skip the Mercury handoff capture, and drop
  // them into `/reports/new` on submit.  When no provider is mounted
  // (tests, Storybook), `bootstrap` is `null` and we treat that as
  // "not pending" so the existing fixtures keep working.
  const isBootstrapPending = !!bootstrap?.isBootstrapping
  useStartupStudioRedirect(effectiveMethod, startupMode, isBootstrapPending)

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
