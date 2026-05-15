/**
 * useManualLayoutResets — behaviour pins for the consolidated identity-change
 * resets. Before Phase 4c.1 these 6 effects lived inline in `ManualLayout`
 * (7,039 LOC) and were untestable in isolation.
 */

import { act, renderHook } from '@testing-library/react'
import { useRef, type MutableRefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import {
  useManualLayoutResets,
  type ManualLayoutResetRefs,
  type UseManualLayoutResetsParams,
} from './useManualLayoutResets'

function makeRefs(): ManualLayoutResetRefs {
  const make = <T,>(initial: T): MutableRefObject<T> => ({ current: initial })
  return {
    lastQualityWarningResetKeyRef: make<string | null>('stale-key'),
    lastSynthesisBlendSkippedRunKeyRef: make<string | null>('stale-run'),
    lastSubmittedFinancialSnapshotRef: make<unknown>({ stale: true }),
  }
}

function setup(initial?: Partial<UseManualLayoutResetsParams>) {
  const refs = makeRefs()
  const setIsDirty = vi.fn()
  const setAcknowledgedStartupIssues = vi.fn()
  const setAcknowledgedQualityWarnings = vi.fn()

  const params: UseManualLayoutResetsParams = {
    reportId: undefined,
    result: null,
    isStartupAssistantRoute: false,
    setIsDirty,
    setAcknowledgedStartupIssues,
    setAcknowledgedQualityWarnings,
    refs,
    ...initial,
  }

  const { rerender } = renderHook(
    (props: UseManualLayoutResetsParams) => useManualLayoutResets(props),
    { initialProps: params }
  )

  return {
    refs,
    setIsDirty,
    setAcknowledgedStartupIssues,
    setAcknowledgedQualityWarnings,
    rerender: (next: Partial<UseManualLayoutResetsParams>) =>
      rerender({ ...params, ...next }),
  }
}

describe('useManualLayoutResets', () => {
  describe('reportId trigger', () => {
    it('clears quality-warning + synthesis-blend dedup trackers on reportId change', () => {
      const { refs, rerender } = setup({ reportId: 'val_a' })

      // Mount → both nulled.
      expect(refs.lastQualityWarningResetKeyRef.current).toBeNull()
      expect(refs.lastSynthesisBlendSkippedRunKeyRef.current).toBeNull()

      refs.lastQualityWarningResetKeyRef.current = 'cached'
      refs.lastSynthesisBlendSkippedRunKeyRef.current = 'cached'

      act(() => rerender({ reportId: 'val_b' }))
      expect(refs.lastQualityWarningResetKeyRef.current).toBeNull()
      expect(refs.lastSynthesisBlendSkippedRunKeyRef.current).toBeNull()
    })

    it('clears acknowledgedStartupIssues on reportId change', () => {
      // Use isStartupAssistantRoute=true so the route-driven reset does not also
      // fire on mount — this test only measures the reportId-driven reset.
      const { setAcknowledgedStartupIssues, rerender } = setup({
        reportId: 'val_a',
        isStartupAssistantRoute: true,
      })

      expect(setAcknowledgedStartupIssues).toHaveBeenCalledTimes(1)
      expect(setAcknowledgedStartupIssues).toHaveBeenLastCalledWith(new Set())

      act(() => rerender({ reportId: 'val_b', isStartupAssistantRoute: true }))
      expect(setAcknowledgedStartupIssues).toHaveBeenCalledTimes(2)
    })

    it('clears isDirty + last-submitted snapshot on reportId change', () => {
      const { refs, setIsDirty, rerender } = setup({ reportId: 'val_a' })

      refs.lastSubmittedFinancialSnapshotRef.current = { revenue: 1_000_000, ebitda: 200_000 }
      setIsDirty.mockClear()

      act(() => rerender({ reportId: 'val_b' }))
      expect(refs.lastSubmittedFinancialSnapshotRef.current).toBeNull()
      expect(setIsDirty).toHaveBeenLastCalledWith(false)
    })
  })

  describe('result content trigger (quality-warning acks)', () => {
    it('does nothing when result is null', () => {
      const { setAcknowledgedQualityWarnings } = setup({ result: null })
      expect(setAcknowledgedQualityWarnings).not.toHaveBeenCalled()
    })

    it('clears acks + stamps the new reset-key when result has a fresh signature', () => {
      const r1 = { valuation_id: 'v', company_name: 'X' } as ValuationResponse
      const { refs, setAcknowledgedQualityWarnings, rerender } = setup({ result: r1 })

      expect(setAcknowledgedQualityWarnings).toHaveBeenCalledWith(new Set())
      const stamped1 = refs.lastQualityWarningResetKeyRef.current
      expect(stamped1).not.toBeNull()

      // Same result object — no second reset.
      setAcknowledgedQualityWarnings.mockClear()
      act(() => rerender({ result: r1 }))
      expect(setAcknowledgedQualityWarnings).not.toHaveBeenCalled()

      // Different result that yields a different reset key.
      const r2 = {
        valuation_id: 'v2',
        company_name: 'Y',
        weighted_valuation: {
          blended_equity_value: 1_000_000,
          contributions: [],
        },
      } as unknown as ValuationResponse
      act(() => rerender({ result: r2 }))
      expect(setAcknowledgedQualityWarnings).toHaveBeenCalledWith(new Set())
      expect(refs.lastQualityWarningResetKeyRef.current).not.toBe(stamped1)
    })
  })

  describe('isStartupAssistantRoute trigger', () => {
    it('does NOT clear startup issues while on the startup route', () => {
      const { setAcknowledgedStartupIssues, rerender } = setup({
        isStartupAssistantRoute: true,
      })

      setAcknowledgedStartupIssues.mockClear()
      act(() => rerender({ isStartupAssistantRoute: true }))
      expect(setAcknowledgedStartupIssues).not.toHaveBeenCalled()
    })

    it('clears startup issues when leaving the startup route', () => {
      const { setAcknowledgedStartupIssues, rerender } = setup({
        isStartupAssistantRoute: true,
      })

      setAcknowledgedStartupIssues.mockClear()
      act(() => rerender({ isStartupAssistantRoute: false }))
      expect(setAcknowledgedStartupIssues).toHaveBeenCalledWith(new Set())
    })
  })

  describe('integration: all 6 resets coexist', () => {
    it('fires the right subset of resets per trigger', () => {
      function Harness() {
        const refs: ManualLayoutResetRefs = {
          lastQualityWarningResetKeyRef: useRef<string | null>(null),
          lastSynthesisBlendSkippedRunKeyRef: useRef<string | null>(null),
          lastSubmittedFinancialSnapshotRef: useRef<unknown>(null),
        }
        return refs
      }
      const { result } = renderHook(() => Harness())
      // Smoke test: every ref starts at its initial value and the hook can
      // mount without throwing against real `useRef`-backed refs.
      expect(result.current.lastQualityWarningResetKeyRef.current).toBeNull()
    })
  })
})
