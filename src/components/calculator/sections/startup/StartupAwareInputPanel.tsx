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
import { useEffect, useRef, type ComponentProps } from 'react'
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

  if (effectiveMethod === 'startup_valuation') {
    return <StartupValuationPanel mode={startupMode} />
  }

  return <ManualInputPanel {...props} />
}

export default StartupAwareInputPanel
