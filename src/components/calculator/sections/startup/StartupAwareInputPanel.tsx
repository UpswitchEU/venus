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
 */

import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { ManualInputPanel } from '../../ManualInputPanel'
import type { ComponentProps } from 'react'
import { StartupValuationPanel } from './StartupValuationPanel'

export type StartupAwareInputPanelProps = ComponentProps<typeof ManualInputPanel>

export function StartupAwareInputPanel(props: StartupAwareInputPanelProps) {
  const effectiveMethod = useManualResultsStore(
    (s) => s.preSelectedMethod ?? s.selectedMethod
  )

  if (effectiveMethod === 'startup_valuation') {
    return <StartupValuationPanel />
  }

  return <ManualInputPanel {...props} />
}

export default StartupAwareInputPanel
