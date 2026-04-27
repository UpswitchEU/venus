/**
 * StartupAwareInputPanel — orchestrator contract tests.
 *
 * Pins two cross-app contracts:
 *
 *   1. Mercury → Venus startup_stage handoff URL params land on the
 *      Zustand store.  Without this guard, a silent rename of the
 *      query key (or of `setField('stage', …)`) would leave Mercury
 *      thinking it pre-selected pre-seed while Venus quietly defaulted
 *      to seed.
 *
 *   2. Panel selection: when `selected_method=startup_valuation`, the
 *      orchestrator renders the unified `StartupValuationPanel` (with
 *      the canonical 7 Studio sections) inline inside `ManualLayout`'s
 *      left rail — no round-trip to a separate Studio page.  Founder
 *      vs. advisor mode is derived from the bootstrap + auth role.
 *
 * The prior round-trip-to-Studio-v2 redirect contract is gone (the
 * separate `/[locale]/startup-valuation` page is now a thin redirect
 * to `/reports/new?selected_method=startup_valuation`).
 */

import { render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setFieldSpy = vi.fn()
const resultsStoreState: {
  preSelectedMethod: string | null
  selectedMethod: string | null
  result: unknown
  isCalculating: boolean
} = {
  preSelectedMethod: null,
  selectedMethod: 'arr_multiple',
  result: null,
  isCalculating: false,
}
const useAuthMock = vi.fn(() => ({ user: null as { role?: string } | null }))
const useBootstrapSafeMock = vi.fn(() => null)
const useParamsMock = vi.fn<() => { locale?: string; id?: string }>(() => ({
  locale: 'en',
}))

// Mock surface mirrors the slice the orchestrator + the submit footer
// actually read.  The footer subscribes to `maturity` for its reactive
// milestone gate, so we ship an empty record here (no milestones picked
// — matches the pre-fill state these tests assume).
const studioStoreState = {
  setField: setFieldSpy,
  maturity: {} as Record<string, string>,
}
vi.mock('@/store/manual/useStartupValuationStore', () => ({
  useStartupValuationStore: <T,>(selector: (s: typeof studioStoreState) => T) =>
    selector(studioStoreState),
}))

vi.mock('@/store/manual/useManualResultsStore', () => ({
  useManualResultsStore: <T,>(selector: (s: typeof resultsStoreState) => T) =>
    selector(resultsStoreState),
}))

vi.mock('@/store/manual/useManualFormStore', () => ({
  useManualFormStore: <T,>(selector: (s: { formData: { company_name: string } }) => T) =>
    selector({ formData: { company_name: '' } }),
}))

vi.mock('@/lib/bootstrap/BootstrapProvider', () => ({
  useBootstrapSafe: () => useBootstrapSafeMock(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => useParamsMock(),
}))

vi.mock('../../ManualInputPanel', () => ({
  ManualInputPanel: () => <div data-testid="manual-input-panel" />,
}))

vi.mock('./StartupValuationPanel', () => ({
  StartupValuationPanel: ({ mode }: { mode: string }) => (
    <div data-testid="startup-valuation-panel" data-mode={mode} />
  ),
}))

import { StartupAwareInputPanel } from './StartupAwareInputPanel'

describe('StartupAwareInputPanel', () => {
  const originalLocation = window.location

  beforeEach(() => {
    setFieldSpy.mockClear()
    useAuthMock.mockReturnValue({ user: null })
    useBootstrapSafeMock.mockReturnValue(null)
    useParamsMock.mockReturnValue({ locale: 'en' })
    resultsStoreState.preSelectedMethod = null
    resultsStoreState.selectedMethod = 'arr_multiple'
    resultsStoreState.result = null
    resultsStoreState.isCalculating = false
    window.sessionStorage.clear()
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, search: '' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    })
  })

  function setSearch(search: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, search },
    })
  }

  describe('startup_stage deep-link prefill', () => {
    it.each([
      'pre_seed',
      'seed',
      'series_a',
    ] as const)('seeds the store with the validated stage "%s"', (stage) => {
      setSearch(`?startup_stage=${stage}`)
      render(<StartupAwareInputPanel />)
      expect(setFieldSpy).toHaveBeenCalledWith('stage', stage)
    })

    it('ignores unknown stage values without throwing', () => {
      setSearch('?startup_stage=growth')
      render(<StartupAwareInputPanel />)
      expect(setFieldSpy).not.toHaveBeenCalled()
    })

    it('is a no-op when the param is missing', () => {
      setSearch('')
      render(<StartupAwareInputPanel />)
      expect(setFieldSpy).not.toHaveBeenCalled()
    })

    it('runs at most once per mount even if React StrictMode double-invokes effects', () => {
      setSearch('?startup_stage=seed')
      const { rerender } = render(<StartupAwareInputPanel />)
      rerender(<StartupAwareInputPanel />)
      rerender(<StartupAwareInputPanel />)
      expect(setFieldSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('panel selection', () => {
    it('renders the SME ManualInputPanel when method is not startup_valuation', () => {
      resultsStoreState.selectedMethod = 'arr_multiple'
      const { getByTestId, queryByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('manual-input-panel')).toBeTruthy()
      expect(queryByTestId('startup-valuation-panel')).toBeNull()
    })

    it('renders the StartupValuationPanel inline for selected_method=startup_valuation', () => {
      // Unified shell: no longer gated on a prior result.  The panel
      // hosts the 7 Studio sections directly, so first-time founders
      // and returning users see the same surface.
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      const { getByTestId, queryByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel')).toBeTruthy()
      expect(queryByTestId('manual-input-panel')).toBeNull()
    })

    it('renders founder mode when no advisor signal is present', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      const { getByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('founder')
    })

    it('renders advisor mode for accountant-tier role', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      useAuthMock.mockReturnValue({ user: { role: 'accountant' } })
      const { getByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('advisor')
    })

    it('renders advisor mode when bootstrap is accountant-for-client', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      useBootstrapSafeMock.mockReturnValue({ isAccountantFlow: true } as never)
      const { getByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('advisor')
    })
  })
})
