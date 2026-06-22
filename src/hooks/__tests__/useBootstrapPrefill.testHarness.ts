import { vi } from 'vitest'
import { PREFILL_SOURCE_ACCOUNTING_INTEGRATION } from '../../lib/bootstrap/types'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useImportQualityStore } from '../../store/useImportQualityStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type { ValuationSession } from '../../types/valuation'

export { act, renderHook, waitFor } from '@testing-library/react'

const bootstrapPrefillMocks = vi.hoisted(() => ({
  mockUseBootstrapSafe: vi.fn(),
}))

vi.mock('../../lib/bootstrap', () => ({
  useBootstrapSafe: bootstrapPrefillMocks.mockUseBootstrapSafe,
}))

export const { resetBootstrapPrefillState, useBootstrapPrefill } = await import(
  '../useBootstrapPrefill'
)

export function getBootstrapPrefillMocks() {
  return bootstrapPrefillMocks
}

export function resetBootstrapPrefillHarness() {
  resetBootstrapPrefillState()
  useManualFormStore.getState().resetForm()
  useNormalizationStore.getState().clear()
  useImportQualityStore.setState({
    importQuality: null,
    provider: null,
  })
  useTaxLatencyStore.getState().clear()
  useSessionStore.setState({ session: null })
  bootstrapPrefillMocks.mockUseBootstrapSafe.mockReset()

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
}

export function restoreBootstrapPrefillHarness() {
  vi.useRealTimers()
  vi.unstubAllGlobals()
}

export { PREFILL_SOURCE_ACCOUNTING_INTEGRATION }
export type { ValuationSession }
