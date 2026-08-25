import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationFormData } from '../../../components/calculator'
import {
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
    window.history.replaceState(null, '', '/nl/reports/val_1_demo?intent=start_valuation&source=mercury')
  })

  it('waits for delegated context and prefill, then starts exactly once', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
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
    const onStart = vi.fn().mockResolvedValue(undefined)
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

  it('removes only the one-shot intent from the current URL', () => {
    expect(
      urlWithoutStartValuationIntent(
        'https://venus.test/nl/reports/val_1_demo?intent=start_valuation&source=mercury#ready'
      )
    ).toBe('/nl/reports/val_1_demo?source=mercury#ready')
  })
})
