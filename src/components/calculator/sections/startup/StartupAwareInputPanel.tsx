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
 * The startup panel itself supports two surface modes (``founder`` and
 * ``advisor``); we derive the right one here from the bootstrap
 * identity so the rest of the calculator never has to thread the flag
 * through.  Accountant-for-client sessions get the full advisor surface
 * (4-leg blend + scorecard fine-tuning); everyone else (founders /
 * direct business owners) gets the founder surface (3-leg blend, no
 * scorecard fine-tuning, founder-targeted copy).
 */

import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { useBootstrapSafe } from '@/lib/bootstrap/BootstrapProvider'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import type { StartupSector, StartupStage } from '@/store/manual/useStartupValuationStore'
import { ManualInputPanel } from '../../ManualInputPanel'
import { useRouter, useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, type ComponentProps } from 'react'
import { isStartupStudioV2Enabled } from '@/config/features'
import { AuroraButton } from '@/design-system'
import type { ValuationFormData } from '@/types/valuation'
import { resolveVentureCountryIso2 } from '@/utils/resolveVentureCountryIso2'
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
 * Re-route founders to the Studio v2 wizard the first time they land
 * on the legacy slider panel.  Idempotent: bails out the moment a
 * startup result already exists in the manual results store (so we
 * never yank the user away from an in-flight report) or the source
 * query param marks them as already coming from the Studio.
 */
function useStartupStudioRedirect(method: string | null | undefined) {
  const router = useRouter()
  const params = useParams<{ locale?: string }>()
  // Treat the founder as "in-flight" the moment a result has been
  // computed in this session — we don't want to yank them out of an
  // open report into the wizard.
  const hasStartupResult = useManualResultsStore((s) => s.result != null)
  const redirectedRef = useRef(false)

  useEffect(() => {
    if (redirectedRef.current) return
    if (method !== 'startup_valuation') return
    if (!isStartupStudioV2Enabled()) return
    if (hasStartupResult) return
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    if (search.get('source') === 'studio_v2') return
    if (search.get('studio') === 'legacy') return

    redirectedRef.current = true
    const locale = params?.locale === 'nl' ? 'nl' : 'en'
    router.push(`/${locale}/startup-valuation`)
  }, [method, hasStartupResult, router, params])
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
  return {
    companyName: (formState.company_name?.trim() || 'Unknown Startup'),
    businessType: formState.business_type ?? 'startup',
    industry: formState.industry ?? 'technology',
    business_model: formState.business_model ?? sector,
    businessModel: formState.business_model ?? sector,
    country: resolvedCountry,
    yearFounded: formState.founding_year ?? new Date().getFullYear() - 1,
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
    if (search.get('source') !== 'studio_v2') return

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
  const effectiveMethod = useManualResultsStore(
    (s) => s.preSelectedMethod ?? s.selectedMethod
  )
  // ``useBootstrapSafe`` returns ``null`` when the panel is mounted
  // outside the BootstrapProvider (test renders, Storybook).  Treating
  // that as a non-accountant flow keeps the founder surface as the
  // safe default for those contexts.
  const bootstrap = useBootstrapSafe()
  const startupMode: 'founder' | 'advisor' =
    bootstrap?.isAccountantFlow ? 'advisor' : 'founder'

  const isCalculating = useManualResultsStore((s) => s.isCalculating)

  useStartupStageDeepLinkPrefill()
  // Founder Studio v2 redirect — advisors keep the legacy panel until
  // the round-simulator step ships in the wizard's advisor surface.
  useStartupStudioRedirect(startupMode === 'founder' ? effectiveMethod : null)

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
