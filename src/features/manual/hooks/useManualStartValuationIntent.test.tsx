import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationFormData } from '../../../components/calculator'
import {
  START_VALUATION_RESERVATION_TTL_MS,
  startValuationIntentStorageKey,
  urlWithoutStartValuationIntent,
  useManualStartValuationIntent,
} from './useManualStartValuationIntent'

const readyData = {
  companyName: 'Demonlabs',
  businessType: 'software',
  country: 'BE',
  yearlyFinancials: [
    { year: 2021, revenue: 13_000, ebitda: 13_000 },
    { year: 2022, revenue: 25_000, ebitda: 25_000 },
    { year: 2023, revenue: 11_300_000, ebitda: 936_000 },
    { year: 2024, revenue: 19_000, ebitda: 19_000 },
  ],
} as ValuationFormData

describe('useManualStartValuationIntent', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(
      null,
      '',
      '/nl/reports/val_1_demo?intent=start_valuation&source=mercury'
    )
  })

  it('waits for delegated context and prefill, then starts exactly once', async () => {
    const onStart = vi.fn().mockResolvedValue(true)
    const { rerender } = renderHook(
      (props: { ready: boolean }) =>
        useManualStartValuationIntent({
          accountantCustomerId: props.ready ? 'client-1' : null,
          buildSubmitData: () => readyData,
          effectiveMethod: 'upswitch_adaptive',
          hasExistingValuation: false,
          intent: 'start_valuation',
          isAccountantMode: true,
          isCalculating: false,
          isGenerating: false,
          onStart,
          reportId: 'val_1_demo',
          restorationComplete: props.ready,
        }),
      { initialProps: { ready: false } }
    )

    expect(onStart).not.toHaveBeenCalled()
    await act(async () => rerender({ ready: true }))
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1))
    expect(onStart).toHaveBeenCalledWith(readyData)
    expect(window.location.search).toBe('?source=mercury')
    expect(window.sessionStorage.getItem(startValuationIntentStorageKey('val_1_demo'))).toBe(
      'complete'
    )

    await act(async () => rerender({ ready: true }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('does not create another version when the report already has a valuation', async () => {
    const onStart = vi.fn().mockResolvedValue(true)
    renderHook(() =>
      useManualStartValuationIntent({
        accountantCustomerId: 'client-1',
        buildSubmitData: () => readyData,
        effectiveMethod: 'upswitch_adaptive',
        hasExistingValuation: true,
        intent: 'start_valuation',
        isAccountantMode: true,
        isCalculating: false,
        isGenerating: false,
        onStart,
        reportId: 'val_1_demo',
        restorationComplete: true,
      })
    )

    await waitFor(() => expect(window.location.search).toBe('?source=mercury'))
    expect(onStart).not.toHaveBeenCalled()
  })

  it('releases the reservation after a failed start so a new explicit CTA can retry', async () => {
    const onStart = vi.fn().mockRejectedValue(new Error('engine unavailable'))
    renderHook(() =>
      useManualStartValuationIntent({
        accountantCustomerId: 'client-1',
        buildSubmitData: () => readyData,
        effectiveMethod: 'upswitch_adaptive',
        hasExistingValuation: false,
        intent: 'start_valuation',
        isAccountantMode: true,
        isCalculating: false,
        isGenerating: false,
        onStart,
        reportId: 'val_1_demo',
        restorationComplete: true,
      })
    )

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(window.sessionStorage.getItem(startValuationIntentStorageKey('val_1_demo'))).toBeNull()
    )
  })

  it('does not consume the intent when calculation or durable version persistence is incomplete', async () => {
    const onStart = vi.fn().mockResolvedValue(false)
    const storageKey = startValuationIntentStorageKey('val_1_demo')
    renderHook(() =>
      useManualStartValuationIntent({
        accountantCustomerId: 'client-1',
        buildSubmitData: () => readyData,
        effectiveMethod: 'upswitch_adaptive',
        hasExistingValuation: false,
        intent: 'start_valuation',
        isAccountantMode: true,
        isCalculating: false,
        isGenerating: false,
        onStart,
        reportId: 'val_1_demo',
        restorationComplete: true,
      })
    )

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toBeNull())
    expect(window.location.search).toBe('?source=mercury')
  })

  it('does not duplicate an in-flight start after refresh', async () => {
    const onStart = vi.fn().mockResolvedValue(true)
    const storageKey = startValuationIntentStorageKey('val_1_demo')
    window.sessionStorage.setItem(storageKey, `reserved:${Date.now()}`)

    renderHook(() =>
      useManualStartValuationIntent({
        accountantCustomerId: 'client-1',
        buildSubmitData: () => readyData,
        effectiveMethod: 'upswitch_adaptive',
        hasExistingValuation: false,
        intent: 'start_valuation',
        isAccountantMode: true,
        isCalculating: false,
        isGenerating: false,
        onStart,
        reportId: 'val_1_demo',
        restorationComplete: true,
      })
    )

    await waitFor(() => expect(window.location.search).toBe('?source=mercury'))
    expect(onStart).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(storageKey)).toMatch(/^reserved:\d+$/)
  })

  it('recovers an abandoned reservation when the advisor clicks the CTA again', async () => {
    const onStart = vi.fn().mockResolvedValue(true)
    const storageKey = startValuationIntentStorageKey('val_1_demo')
    window.sessionStorage.setItem(
      storageKey,
      `reserved:${Date.now() - START_VALUATION_RESERVATION_TTL_MS - 1}`
    )

    renderHook(() =>
      useManualStartValuationIntent({
        accountantCustomerId: 'client-1',
        buildSubmitData: () => readyData,
        effectiveMethod: 'upswitch_adaptive',
        hasExistingValuation: false,
        intent: 'start_valuation',
        isAccountantMode: true,
        isCalculating: false,
        isGenerating: false,
        onStart,
        reportId: 'val_1_demo',
        restorationComplete: true,
      })
    )

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toBe('complete'))
  })

  it('still starts once when session storage is unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    const onStart = vi.fn().mockResolvedValue(true)

    renderHook(() =>
      useManualStartValuationIntent({
        accountantCustomerId: 'client-1',
        buildSubmitData: () => readyData,
        effectiveMethod: 'upswitch_adaptive',
        hasExistingValuation: false,
        intent: 'start_valuation',
        isAccountantMode: true,
        isCalculating: false,
        isGenerating: false,
        onStart,
        reportId: 'val_1_demo',
        restorationComplete: true,
      })
    )

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1))
    expect(window.location.search).toBe('?source=mercury')
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('scopes one-shot consumption to the report during client-side navigation', async () => {
    const onStart = vi.fn().mockResolvedValue(true)
    const { rerender } = renderHook(
      ({ reportId }: { reportId: string }) =>
        useManualStartValuationIntent({
          accountantCustomerId: 'client-1',
          buildSubmitData: () => readyData,
          effectiveMethod: 'upswitch_adaptive',
          hasExistingValuation: false,
          intent: 'start_valuation',
          isAccountantMode: true,
          isCalculating: false,
          isGenerating: false,
          onStart,
          reportId,
          restorationComplete: true,
        }),
      { initialProps: { reportId: 'val_1_demo' } }
    )

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1))
    window.history.replaceState(
      null,
      '',
      '/nl/reports/val_2_demo?intent=start_valuation&source=mercury'
    )
    await act(async () => rerender({ reportId: 'val_2_demo' }))

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(2))
    expect(window.location.search).toBe('?source=mercury')
  })

  it('removes only the one-shot intent from the current URL', () => {
    expect(
      urlWithoutStartValuationIntent(
        'https://venus.test/nl/reports/val_1_demo?intent=start_valuation&source=mercury#ready'
      )
    ).toBe('/nl/reports/val_1_demo?source=mercury#ready')
  })
})
