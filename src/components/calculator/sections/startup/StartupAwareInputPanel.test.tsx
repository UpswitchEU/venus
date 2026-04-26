/**
 * StartupAwareInputPanel — `?startup_stage` deep-link consumption +
 * Studio v2 redirect contract tests.
 *
 * Pins two cross-app contracts:
 *
 *   1. Mercury → Venus startup_stage handoff URL params land on the
 *      Zustand store.  Without this guard, a silent rename of the
 *      query key (or of `setField('stage', …)`) would leave Mercury
 *      thinking it pre-selected pre-seed while Venus quietly defaulted
 *      to seed.
 *
 *   2. Pre-revenue users — founder OR advisor — get redirected into
 *      the Studio v2 wizard the first time they hit the legacy panel.
 *      Advisors carry their report id + Mercury context through
 *      sessionStorage so the wizard can return them to the SAME
 *      report.  This is the "advisor migration to Studio v2" contract;
 *      regressing it sends advisors back to the slider panel.
 */

import { render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setFieldSpy = vi.fn()
// Per-selector results store mock — returns different values depending
// on which selector the component passed in.  The legacy "single value
// for everything" mock would silently return a truthy `result` whenever
// the test set the method, masking the redirect path entirely.
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
const routerPushSpy = vi.fn()
const useParamsMock = vi.fn<() => { locale?: string; id?: string }>(() => ({
  locale: 'en',
}))

vi.mock('@/store/manual/useStartupValuationStore', () => ({
  useStartupValuationStore: <T,>(selector: (s: { setField: typeof setFieldSpy }) => T) =>
    selector({ setField: setFieldSpy }),
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
  useRouter: () => ({ push: routerPushSpy }),
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

import {
  ADVISOR_HANDOFF_KEY,
  type AdvisorHandoff,
  StartupAwareInputPanel,
} from './StartupAwareInputPanel'

describe('StartupAwareInputPanel', () => {
  const originalLocation = window.location

  beforeEach(() => {
    setFieldSpy.mockClear()
    routerPushSpy.mockClear()
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

    // When a result already exists the redirect bails (in-flight guard)
    // and the legacy panel renders.  These tests pin the panel-mode
    // contract for that case — used by reports the user navigates BACK
    // to after the wizard has already produced a number.
    it('renders the StartupValuationPanel in founder mode for an in-flight founder report', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = { value: 1 }
      const { getByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('founder')
    })

    it('renders advisor mode for accountant-tier role on an in-flight report', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = { value: 1 }
      useAuthMock.mockReturnValue({ user: { role: 'accountant' } })
      const { getByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('advisor')
    })

    it('renders advisor mode when bootstrap is accountant-for-client on an in-flight report', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = { value: 1 }
      useBootstrapSafeMock.mockReturnValue({ isAccountantFlow: true } as never)
      const { getByTestId } = render(<StartupAwareInputPanel />)
      expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('advisor')
    })
  })

  describe('Studio v2 redirect', () => {
    it('redirects founders without a prior result into the Studio v2 wizard (no signal)', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      render(<StartupAwareInputPanel />)
      // Founders get the canonical wizard URL — NO `?from=advisor`
      // signal, which would let a stale sessionStorage handoff
      // misroute their submission.
      expect(routerPushSpy).toHaveBeenCalledWith('/en/startup-valuation')
      expect(window.sessionStorage.getItem(ADVISOR_HANDOFF_KEY)).toBeNull()
    })

    it('redirects advisors with ?from=advisor signal AND captures the report id + Mercury context', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      useBootstrapSafeMock.mockReturnValue({ isAccountantFlow: true } as never)
      useParamsMock.mockReturnValue({ locale: 'nl', id: 'report-abc' })
      setSearch(
        '?mode=accountant&clientId=client-xyz&return_url=' +
          encodeURIComponent('https://mercury.example/back') +
          '&source=mercury'
      )
      render(<StartupAwareInputPanel />)
      // The `?from=advisor` signal is the gate `StartupStudioPage`
      // checks before consuming the sessionStorage payload — without
      // it, a stale handoff could misroute a later founder submission.
      expect(routerPushSpy).toHaveBeenCalledWith('/nl/startup-valuation?from=advisor')
      const stashed = window.sessionStorage.getItem(ADVISOR_HANDOFF_KEY)
      expect(stashed).not.toBeNull()
      const parsed = JSON.parse(stashed as string) as AdvisorHandoff
      expect(parsed).toEqual({
        reportId: 'report-abc',
        locale: 'nl',
        mode: 'accountant',
        clientId: 'client-xyz',
        returnUrl: 'https://mercury.example/back',
        source: 'mercury',
      })
    })

    it('does NOT redirect when the user already has a startup result in flight', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = { value: 1 }
      render(<StartupAwareInputPanel />)
      expect(routerPushSpy).not.toHaveBeenCalled()
    })

    it('does NOT redirect when returning from the wizard via source=studio_v2', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      setSearch('?source=studio_v2')
      render(<StartupAwareInputPanel />)
      expect(routerPushSpy).not.toHaveBeenCalled()
    })

    it('does NOT redirect when an advisor returns via studio_completed=1', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      useBootstrapSafeMock.mockReturnValue({ isAccountantFlow: true } as never)
      setSearch('?source=mercury&mode=accountant&studio_completed=1')
      render(<StartupAwareInputPanel />)
      expect(routerPushSpy).not.toHaveBeenCalled()
    })

    it('does NOT redirect when ?studio=legacy escape param is set', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      setSearch('?studio=legacy')
      render(<StartupAwareInputPanel />)
      expect(routerPushSpy).not.toHaveBeenCalled()
    })

    // Defends against the bootstrap timing race: if `isBootstrapping`
    // is still true on first render, `isAccountantFlow` is stale-false
    // and an advisor would be misclassified as a founder, redirecting
    // WITHOUT capturing the Mercury handoff.  We must wait until
    // bootstrap settles before deciding.
    it('does NOT redirect while bootstrap is still initializing', () => {
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      useBootstrapSafeMock.mockReturnValue({
        isAccountantFlow: false,
        isBootstrapping: true,
      } as never)
      render(<StartupAwareInputPanel />)
      expect(routerPushSpy).not.toHaveBeenCalled()
      expect(window.sessionStorage.getItem(ADVISOR_HANDOFF_KEY)).toBeNull()
    })

    it('redirects an advisor only after bootstrap settles to isAccountantFlow=true', () => {
      // Simulates the realistic Mercury hand-off lifecycle: first
      // render the BootstrapProvider is still resolving client-context
      // exchange (isBootstrapping=true, isAccountantFlow=false), then
      // a second render flips both flags.  Without the readiness gate
      // we'd redirect on the first render as a founder and lose the
      // Mercury context.
      resultsStoreState.selectedMethod = 'startup_valuation'
      resultsStoreState.result = null
      useParamsMock.mockReturnValue({ locale: 'en', id: 'report-late' })
      setSearch('?mode=accountant&clientId=client-late&source=mercury')

      useBootstrapSafeMock.mockReturnValue({
        isAccountantFlow: false,
        isBootstrapping: true,
      } as never)
      const { rerender } = render(<StartupAwareInputPanel />)
      expect(routerPushSpy).not.toHaveBeenCalled()

      useBootstrapSafeMock.mockReturnValue({
        isAccountantFlow: true,
        isBootstrapping: false,
      } as never)
      rerender(<StartupAwareInputPanel />)

      expect(routerPushSpy).toHaveBeenCalledWith('/en/startup-valuation?from=advisor')
      const parsed = JSON.parse(
        window.sessionStorage.getItem(ADVISOR_HANDOFF_KEY) as string
      ) as AdvisorHandoff
      expect(parsed.reportId).toBe('report-late')
      expect(parsed.clientId).toBe('client-late')
      expect(parsed.source).toBe('mercury')
    })
  })
})
