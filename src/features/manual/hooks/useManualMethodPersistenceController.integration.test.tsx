/**
 * Integration pins: real useValuationPersistenceCoordinator + controller.
 * Guards the Mercury handoff re-render storm that kept isPersisting true.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '../../../components/calculator'
import type { ValuationResponse } from '../../../types/valuation'
import { useManualMethodPersistenceController } from './useManualMethodPersistenceController'

const updateSelectedMethod = vi.fn()

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    updateSelectedMethod: (...args: unknown[]) => updateSelectedMethod(...args),
  },
}))

vi.mock('./useManualReportRefreshAfterEdit', () => ({
  useManualReportRefreshAfterEdit: () => ({
    refreshReportAfterEdit: vi.fn(),
  }),
}))

const REPORT_ID = '35a422c3-028f-4d46-88e5-27ac5519826c'

function makeParams(
  override: Partial<Parameters<typeof useManualMethodPersistenceController>[0]> = {}
) {
  return {
    allowedMethodKeys: ['dcf', 'ebitda'],
    canDownloadPdf: true,
    generatePdf: vi.fn(),
    openStarterPaywall: vi.fn(),
    persistedReportLookupId: REPORT_ID,
    preSelectableMethodsForNav: ['dcf', 'ebitda'],
    preSelectedMethod: null,
    preparer: {
      acknowledgedExtreme: false,
      appliedMedian: null,
      benchmarkMedian: null,
      note: '',
      reasonKey: '' as const,
    },
    report: { id: REPORT_ID } as ValuationReportData,
    restorationComplete: true,
    result: {
      selected_valuation_method: 'dcf',
      valuation_results: { dcf: { available: true, value: 1_000_000 } },
    } as ValuationResponse,
    selectedMethod: 'dcf',
    setPreSelectedMethod: vi.fn(),
    setReport: vi.fn(),
    setResult: vi.fn(),
    setSelectedMethod: vi.fn(),
    showValuationEditModal: false,
    togglePreSelectedMethod: vi.fn(),
    translate: (key: string) => key,
    ...override,
  }
}

describe('useManualMethodPersistenceController integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updateSelectedMethod.mockReset()
    updateSelectedMethod.mockResolvedValue({ html_report: '<div>ok</div>' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not persist and clears isMethodSwitchRendering after a re-render storm on open', async () => {
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) =>
        useManualMethodPersistenceController(params),
      { initialProps: makeParams() }
    )

    for (let i = 0; i < 15; i++) {
      rerender(makeParams())
    }

    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })

    expect(updateSelectedMethod).not.toHaveBeenCalled()
    expect(result.current.isMethodSwitchRendering).toBe(false)
  })

  it('sets isMethodSwitchRendering during user method change then clears after persist', async () => {
    const setSelectedMethod = vi.fn()
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) =>
        useManualMethodPersistenceController(params),
      { initialProps: makeParams({ setSelectedMethod }) }
    )

    act(() => {
      result.current.handleSelectMethodWithOverride('ebitda')
    })

    rerender(makeParams({ selectedMethod: 'ebitda', setSelectedMethod }))

    expect(result.current.isMethodSwitchRendering).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(600)
      await Promise.resolve()
    })

    expect(updateSelectedMethod).toHaveBeenCalledTimes(1)
    expect(result.current.isMethodSwitchRendering).toBe(false)
  })
})
