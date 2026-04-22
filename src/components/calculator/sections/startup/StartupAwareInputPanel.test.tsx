/**
 * StartupAwareInputPanel — `?startup_stage` deep-link consumption tests.
 *
 * Pins the contract that Mercury → Venus handoff URL params actually
 * land on the Zustand store. Without this guard, a silent rename of the
 * query key (or of `setField('stage', …)`) would leave Mercury thinking
 * it pre-selected pre-seed while Venus quietly defaulted to seed.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setFieldSpy = vi.fn()
const useManualResultsStoreSelector = vi.fn(() => 'arr_multiple')
const useAuthMock = vi.fn(() => ({ user: null as { role?: string } | null }))
const useBootstrapSafeMock = vi.fn(() => null)

vi.mock('@/store/manual/useStartupValuationStore', () => ({
  useStartupValuationStore: <T,>(selector: (s: { setField: typeof setFieldSpy }) => T) =>
    selector({ setField: setFieldSpy }),
}))

vi.mock('@/store/manual/useManualResultsStore', () => ({
  useManualResultsStore: <T,>(selector: (s: unknown) => T) => useManualResultsStoreSelector(),
}))

vi.mock('@/lib/bootstrap/BootstrapProvider', () => ({
  useBootstrapSafe: () => useBootstrapSafeMock(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
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

describe('StartupAwareInputPanel — startup_stage deep-link prefill', () => {
  const originalLocation = window.location

  beforeEach(() => {
    setFieldSpy.mockClear()
    useAuthMock.mockReturnValue({ user: null })
    useBootstrapSafeMock.mockReturnValue(null)
    useManualResultsStoreSelector.mockReturnValue('arr_multiple')
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

  it.each(['pre_seed', 'seed', 'series_a'] as const)(
    'seeds the store with the validated stage "%s"',
    (stage) => {
      setSearch(`?startup_stage=${stage}`)
      render(<StartupAwareInputPanel />)
      expect(setFieldSpy).toHaveBeenCalledWith('stage', stage)
    },
  )

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

  it('renders the SME ManualInputPanel when method is not startup_valuation', () => {
    useManualResultsStoreSelector.mockReturnValue('arr_multiple')
    const { getByTestId, queryByTestId } = render(<StartupAwareInputPanel />)
    expect(getByTestId('manual-input-panel')).toBeTruthy()
    expect(queryByTestId('startup-valuation-panel')).toBeNull()
  })

  it('renders the StartupValuationPanel in founder mode when method is startup_valuation', () => {
    useManualResultsStoreSelector.mockReturnValue('startup_valuation')
    const { getByTestId } = render(<StartupAwareInputPanel />)
    const panel = getByTestId('startup-valuation-panel')
    expect(panel.getAttribute('data-mode')).toBe('founder')
  })

  it('renders advisor mode for accountant-tier role (standalone advisor)', () => {
    useManualResultsStoreSelector.mockReturnValue('startup_valuation')
    useAuthMock.mockReturnValue({ user: { role: 'accountant' } })
    const { getByTestId } = render(<StartupAwareInputPanel />)
    expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('advisor')
  })

  it('renders advisor mode when bootstrap is accountant-for-client', () => {
    useBootstrapSafeMock.mockReturnValue({ isAccountantFlow: true } as never)
    useManualResultsStoreSelector.mockReturnValue('startup_valuation')
    const { getByTestId } = render(<StartupAwareInputPanel />)
    expect(getByTestId('startup-valuation-panel').getAttribute('data-mode')).toBe('advisor')
  })
})
