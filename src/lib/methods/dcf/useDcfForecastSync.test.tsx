/**
 * useDcfForecastSync — behaviour pins for the extracted forecast-injection
 * effect. Before Phase 4a this effect lived inline in `ManualInputPanel`
 * (5,178 LOC) and was untestable in isolation.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { type UseDcfForecastSyncParams, useDcfForecastSync } from './useDcfForecastSync'

type Updater = (current: ManualValuationFormData) => ManualValuationFormData

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    yearlyFinancials: [
      { year: '2022', revenue: 1_000_000, ebitda: 200_000 },
      { year: '2023', revenue: 1_100_000, ebitda: 220_000 },
      { year: '2024', revenue: 1_200_000, ebitda: 240_000 },
    ] as YearlyFinancials[],
    industry: 'manufacturing',
    businessType: 'manufacturing',
    ...overrides,
  } as ManualValuationFormData
}

function setup(initial: Partial<UseDcfForecastSyncParams>) {
  const formStateRef: { current: ManualValuationFormData } = { current: makeForm() }
  const setFormData = vi.fn((arg: ManualValuationFormData | Updater) => {
    formStateRef.current = typeof arg === 'function' ? (arg as Updater)(formStateRef.current) : arg
  })
  const setShowForecastRemovalConfirm = vi.fn()
  const translate = vi.fn((key: string) => key)

  const params: UseDcfForecastSyncParams = {
    effectiveMethod: null,
    hasDcfSelected: false,
    setFormData,
    setShowForecastRemovalConfirm,
    translate,
    ...initial,
  }

  const { rerender } = renderHook((props: UseDcfForecastSyncParams) => useDcfForecastSync(props), {
    initialProps: params,
  })

  return {
    setFormData,
    setShowForecastRemovalConfirm,
    translate,
    formStateRef,
    rerender: (next: Partial<UseDcfForecastSyncParams>) => rerender({ ...params, ...next }),
  }
}

describe('useDcfForecastSync', () => {
  describe('mount', () => {
    it('does nothing on mount when DCF is not active', () => {
      const { setFormData, setShowForecastRemovalConfirm } = setup({
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: false,
      })
      expect(setFormData).not.toHaveBeenCalled()
      expect(setShowForecastRemovalConfirm).not.toHaveBeenCalled()
    })

    it('injects forecast rows on mount when DCF is the selected method', () => {
      const { setFormData, setShowForecastRemovalConfirm, formStateRef } = setup({
        effectiveMethod: 'dcf',
        hasDcfSelected: false,
      })
      expect(setFormData).toHaveBeenCalledTimes(1)
      expect(setShowForecastRemovalConfirm).toHaveBeenCalledWith(false)
      const forecastRows = formStateRef.current.yearlyFinancials.filter((r) => r.isForecast)
      expect(forecastRows.length).toBeGreaterThan(0)
    })

    it('injects forecast rows on mount when DCF is part of a multi-method selection', () => {
      const { setFormData, formStateRef } = setup({
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: true,
      })
      expect(setFormData).toHaveBeenCalledTimes(1)
      const forecastRows = formStateRef.current.yearlyFinancials.filter((r) => r.isForecast)
      expect(forecastRows.length).toBeGreaterThan(0)
    })

    it('does not call the success toast on mount (mount injections are silent)', () => {
      const { translate } = setup({ effectiveMethod: 'dcf', hasDcfSelected: false })
      expect(translate).not.toHaveBeenCalled()
    })
  })

  describe('toggling DCF', () => {
    it('injects forecast rows when DCF turns on after mount', () => {
      // Note: the success-toast translator is invoked inside a deferred
      // `import('sonner').then(...)` callback, which we deliberately do not
      // assert on — the meaningful behaviour is the form-state mutation.
      const { setFormData, formStateRef, rerender } = setup({
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: false,
      })
      expect(setFormData).not.toHaveBeenCalled()

      act(() => rerender({ effectiveMethod: 'dcf', hasDcfSelected: false }))
      expect(setFormData).toHaveBeenCalledTimes(1)
      const forecastRows = formStateRef.current.yearlyFinancials.filter((r) => r.isForecast)
      expect(forecastRows.length).toBeGreaterThan(0)
    })

    it('injects forecast rows when DCF is added to a multi-method selection', () => {
      const { setFormData, formStateRef, rerender } = setup({
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: false,
      })
      act(() => rerender({ effectiveMethod: 'ebitda_multiple', hasDcfSelected: true }))
      expect(setFormData).toHaveBeenCalledTimes(1)
      const forecastRows = formStateRef.current.yearlyFinancials.filter((r) => r.isForecast)
      expect(forecastRows.length).toBeGreaterThan(0)
    })

    it('requests forecast-removal confirmation when DCF turns off and forecast rows still exist', () => {
      const { setFormData, setShowForecastRemovalConfirm, rerender } = setup({
        effectiveMethod: 'dcf',
        hasDcfSelected: false,
      })
      // Mount injected forecast rows; clear the spy so we measure the switch-away alone.
      setFormData.mockClear()
      setShowForecastRemovalConfirm.mockClear()

      act(() => rerender({ effectiveMethod: 'ebitda_multiple', hasDcfSelected: false }))

      // setFormData is called to read current state (returns unchanged) and queueMicrotask
      // schedules the confirmation modal.
      expect(setFormData).toHaveBeenCalledTimes(1)
      return new Promise<void>((resolve) => {
        queueMicrotask(() => {
          expect(setShowForecastRemovalConfirm).toHaveBeenCalledWith(true)
          resolve()
        })
      })
    })

    it('does not show the removal confirmation when no forecast rows exist', () => {
      const formStateRef: { current: ManualValuationFormData } = { current: makeForm() }
      const setFormData = vi.fn((arg: ManualValuationFormData | Updater) => {
        formStateRef.current =
          typeof arg === 'function' ? (arg as Updater)(formStateRef.current) : arg
      })
      const setShowForecastRemovalConfirm = vi.fn()
      const translate = vi.fn((key: string) => key)

      const initialParams: UseDcfForecastSyncParams = {
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: false,
        setFormData,
        setShowForecastRemovalConfirm,
        translate,
      }
      const { rerender } = renderHook(
        (props: UseDcfForecastSyncParams) => useDcfForecastSync(props),
        { initialProps: initialParams }
      )

      act(() =>
        rerender({
          ...initialParams,
          effectiveMethod: 'dcf',
          hasDcfSelected: false,
        })
      )

      // Now switch away; the form's yearlyFinancials must be reverted to non-forecast
      // rows to assert "no confirm when no forecast rows exist."
      formStateRef.current = makeForm()
      setShowForecastRemovalConfirm.mockClear()

      act(() =>
        rerender({
          ...initialParams,
          effectiveMethod: 'adjusted_nav',
          hasDcfSelected: false,
        })
      )

      return new Promise<void>((resolve) => {
        queueMicrotask(() => {
          expect(setShowForecastRemovalConfirm).not.toHaveBeenCalledWith(true)
          resolve()
        })
      })
    })
  })

  describe('markPrevMethod handle', () => {
    it('returns a markPrevMethod function that prevents re-injection on the next rerender', () => {
      const formStateRef: { current: ManualValuationFormData } = { current: makeForm() }
      const setFormData = vi.fn((arg: ManualValuationFormData | Updater) => {
        formStateRef.current =
          typeof arg === 'function' ? (arg as Updater)(formStateRef.current) : arg
      })
      const setShowForecastRemovalConfirm = vi.fn()
      const translate = vi.fn((key: string) => key)

      const initialParams: UseDcfForecastSyncParams = {
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: false,
        setFormData,
        setShowForecastRemovalConfirm,
        translate,
      }

      const { result, rerender } = renderHook(
        (props: UseDcfForecastSyncParams) => useDcfForecastSync(props),
        { initialProps: initialParams }
      )

      expect(result.current.markPrevMethod).toBeTypeOf('function')

      // User switches away from DCF (forecast removal confirm shown) and then
      // cancels: the panel reverts the store method back to 'dcf' AND calls
      // markPrevMethod('dcf') so the hook does not see this as a method change
      // and does not re-inject forecast rows.
      act(() => result.current.markPrevMethod('dcf'))

      setFormData.mockClear()
      act(() => rerender({ ...initialParams, effectiveMethod: 'dcf', hasDcfSelected: false }))

      // Method unchanged from the hook's perspective (markPrevMethod pinned it to 'dcf'),
      // so the inject path does not fire.
      expect(setFormData).not.toHaveBeenCalled()
    })
  })

  describe('no-op rerenders', () => {
    it('does nothing when method does not change and DCF state does not change', () => {
      const { setFormData, setShowForecastRemovalConfirm, rerender } = setup({
        effectiveMethod: 'ebitda_multiple',
        hasDcfSelected: false,
      })
      setFormData.mockClear()
      setShowForecastRemovalConfirm.mockClear()

      act(() => rerender({ effectiveMethod: 'ebitda_multiple', hasDcfSelected: false }))
      act(() => rerender({ effectiveMethod: 'ebitda_multiple', hasDcfSelected: false }))

      expect(setFormData).not.toHaveBeenCalled()
      expect(setShowForecastRemovalConfirm).not.toHaveBeenCalled()
    })

    it('does not re-inject when DCF stays active across rerenders', () => {
      const { setFormData, rerender } = setup({
        effectiveMethod: 'dcf',
        hasDcfSelected: false,
      })
      expect(setFormData).toHaveBeenCalledTimes(1) // mount inject
      setFormData.mockClear()

      act(() => rerender({ effectiveMethod: 'dcf', hasDcfSelected: false }))
      act(() => rerender({ effectiveMethod: 'dcf', hasDcfSelected: false }))

      expect(setFormData).not.toHaveBeenCalled()
    })
  })
})
