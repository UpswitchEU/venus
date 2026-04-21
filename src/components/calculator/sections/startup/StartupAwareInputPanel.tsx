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
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import type { StartupStage } from '@/store/manual/useStartupValuationStore'
import { ManualInputPanel } from '../../ManualInputPanel'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useRef, type ComponentProps } from 'react'
import { isStartupStudioV2Enabled } from '@/config/features'
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

  useStartupStageDeepLinkPrefill()
  // Founder Studio v2 redirect — advisors keep the legacy panel until
  // the round-simulator step ships in the wizard's advisor surface.
  useStartupStudioRedirect(startupMode === 'founder' ? effectiveMethod : null)

  if (effectiveMethod === 'startup_valuation') {
    return <StartupValuationPanel mode={startupMode} />
  }

  return <ManualInputPanel {...props} />
}

export default StartupAwareInputPanel
