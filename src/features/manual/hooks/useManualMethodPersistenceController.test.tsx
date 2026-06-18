import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '../../../components/calculator'
import type { ValuationResponse } from '../../../types/valuation'
import { useManualMethodPersistenceController } from './useManualMethodPersistenceController'

const enqueueMethod = vi.fn()
const enqueuePreparer = vi.fn()
const setBaseline = vi.fn()

const coordinatorHarness = vi.hoisted(() => ({
  onError: undefined as
    | ((intent: { kind: string; previousMethod?: string }, error: unknown) => void)
    | undefined,
}))

vi.mock('./useValuationPersistenceCoordinator', () => ({
  useValuationPersistenceCoordinator: (params: {
    onError?: (intent: { kind: string; previousMethod?: string }, error: unknown) => void
  }) => {
    coordinatorHarness.onError = params.onError
    return {
      enqueueMethod,
      enqueuePreparer,
      setBaseline,
      isPersisting: false,
    }
  },
}))

vi.mock('./useManualReportRefreshAfterEdit', () => ({
  useManualReportRefreshAfterEdit: () => ({
    refreshReportAfterEdit: vi.fn(),
  }),
}))

function makeParams(
  override: Partial<Parameters<typeof useManualMethodPersistenceController>[0]> = {}
) {
  return {
    allowedMethodKeys: ['dcf', 'ebitda'],
    canDownloadPdf: true,
    generatePdf: vi.fn(),
    openStarterPaywall: vi.fn(),
    persistedReportLookupId: '35a422c3-028f-4d46-88e5-27ac5519826c',
    preSelectableMethodsForNav: ['dcf', 'ebitda'],
    preSelectedMethod: null,
    preparer: {
      acknowledgedExtreme: false,
      appliedMedian: null,
      benchmarkMedian: null,
      note: '',
      reasonKey: '' as const,
    },
    report: { id: '35a422c3-028f-4d46-88e5-27ac5519826c' } as ValuationReportData,
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

beforeEach(() => {
  vi.useFakeTimers()
  enqueueMethod.mockClear()
  enqueuePreparer.mockClear()
  setBaseline.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useManualMethodPersistenceController', () => {
  it('does not enqueue method persist on mount when selectedMethod matches restored state', () => {
    renderHook(() => useManualMethodPersistenceController(makeParams()))

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('enqueues method persist only after a user-initiated method change', () => {
    const setSelectedMethod = vi.fn()
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      { initialProps: makeParams({ setSelectedMethod }) }
    )

    expect(enqueueMethod).not.toHaveBeenCalled()

    act(() => {
      result.current.handleSelectMethodWithOverride('ebitda')
    })

    rerender(makeParams({ selectedMethod: 'ebitda', setSelectedMethod }))

    expect(enqueueMethod).toHaveBeenCalledTimes(1)
    expect(enqueueMethod).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ebitda', previousMethod: 'dcf' })
    )
  })

  it('does not enqueue when selectedMethod changes programmatically after seeding', () => {
    const { rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      { initialProps: makeParams() }
    )

    expect(enqueueMethod).not.toHaveBeenCalled()

    rerender(makeParams({ selectedMethod: 'ebitda' }))

    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('does not enqueue before restorationComplete', () => {
    const { rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      {
        initialProps: makeParams({ restorationComplete: false }),
      }
    )

    rerender(makeParams({ restorationComplete: false, selectedMethod: 'ebitda' }))

    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('does not enqueue when selectedMethod hydrates to match the server method', () => {
    const valuationResults = {
      dcf: { available: true, value: 1_000_000 },
      ebitda: { available: true, value: 900_000 },
    }
    const { rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      {
        initialProps: makeParams({
          restorationComplete: true,
          selectedMethod: 'dcf',
          result: {
            selected_valuation_method: 'ebitda',
            valuation_results: valuationResults,
          } as ValuationResponse,
        }),
      }
    )

    expect(enqueueMethod).not.toHaveBeenCalled()

    rerender(
      makeParams({
        restorationComplete: true,
        selectedMethod: 'ebitda',
        result: {
          selected_valuation_method: 'ebitda',
          valuation_results: valuationResults,
        } as ValuationResponse,
      })
    )

    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('does not arm enqueue tracking before result hydrates on open', () => {
    const { rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      {
        initialProps: makeParams({
          restorationComplete: true,
          result: null,
          selectedMethod: 'dcf',
        }),
      }
    )

    expect(enqueueMethod).not.toHaveBeenCalled()

    rerender(
      makeParams({
        restorationComplete: true,
        result: {
          selected_valuation_method: 'dcf',
          valuation_results: { dcf: { available: true, value: 1_000_000 } },
        } as ValuationResponse,
        selectedMethod: 'dcf',
      })
    )

    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('enqueues when the user changes method before result hydrates', () => {
    const setSelectedMethod = vi.fn()
    const valuationResults = {
      dcf: { available: true, value: 1_000_000 },
      ebitda: { available: true, value: 900_000 },
    }

    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      {
        initialProps: makeParams({
          restorationComplete: true,
          result: null,
          selectedMethod: 'dcf',
          setSelectedMethod,
        }),
      }
    )

    act(() => {
      result.current.handleSelectMethodWithOverride('ebitda')
    })

    rerender(
      makeParams({
        restorationComplete: true,
        result: null,
        selectedMethod: 'ebitda',
        setSelectedMethod,
      })
    )

    expect(enqueueMethod).toHaveBeenCalledTimes(1)
    expect(enqueueMethod).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ebitda', previousMethod: 'ebitda' })
    )

    enqueueMethod.mockClear()

    rerender(
      makeParams({
        restorationComplete: true,
        selectedMethod: 'ebitda',
        setSelectedMethod,
        result: {
          selected_valuation_method: 'dcf',
          valuation_results: valuationResults,
        } as ValuationResponse,
      })
    )

    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('enqueues when the user changes method before server method syncs on hydration', () => {
    const setSelectedMethod = vi.fn()
    const valuationResults = {
      dcf: { available: true, value: 1_000_000 },
      ebitda: { available: true, value: 900_000 },
    }

    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      {
        initialProps: makeParams({
          restorationComplete: true,
          result: null,
          selectedMethod: 'dcf',
          setSelectedMethod,
        }),
      }
    )

    act(() => {
      result.current.handleSelectMethodWithOverride('ebitda')
    })

    rerender(
      makeParams({
        restorationComplete: true,
        selectedMethod: 'ebitda',
        setSelectedMethod,
        result: {
          selected_valuation_method: 'dcf',
          valuation_results: valuationResults,
        } as ValuationResponse,
      })
    )

    expect(enqueueMethod).toHaveBeenCalledTimes(1)
    expect(enqueueMethod).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ebitda', previousMethod: 'dcf' })
    )
  })

  it('enqueues when handlePreSelectMethod changes the active method', () => {
    const setPreSelectedMethod = vi.fn()
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      { initialProps: makeParams({ setPreSelectedMethod }) }
    )

    act(() => {
      result.current.handlePreSelectMethod('ebitda')
    })

    rerender(makeParams({ selectedMethod: 'ebitda', setPreSelectedMethod }))

    expect(enqueueMethod).toHaveBeenCalledTimes(1)
    expect(enqueueMethod).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ebitda', previousMethod: 'dcf' })
    )
  })

  it('does not enqueue method persist when toggling pre-selected methods only', () => {
    const togglePreSelectedMethod = vi.fn()
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      { initialProps: makeParams({ togglePreSelectedMethod }) }
    )

    act(() => {
      result.current.togglePreSelectedMethodWithPlanGate('ebitda')
    })

    rerender(makeParams({ togglePreSelectedMethod }))

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(togglePreSelectedMethod).toHaveBeenCalledWith('ebitda')
    expect(enqueueMethod).not.toHaveBeenCalled()
  })

  it('does not enqueue preparer persist when the edit modal opens with unchanged preparer state', () => {
    renderHook(() =>
      useManualMethodPersistenceController(
        makeParams({
          showValuationEditModal: true,
        })
      )
    )

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(enqueuePreparer).not.toHaveBeenCalled()
  })

  it('enqueues preparer persist when preparer fields change in the edit modal', () => {
    const { rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      {
        initialProps: makeParams({
          showValuationEditModal: true,
        }),
      }
    )

    rerender(
      makeParams({
        showValuationEditModal: true,
        preparer: {
          acknowledgedExtreme: false,
          appliedMedian: 4.5,
          benchmarkMedian: 4.2,
          note: 'peer set',
          reasonKey: 'customer_concentration' as const,
        },
      })
    )

    expect(enqueuePreparer).toHaveBeenCalledTimes(1)
  })

  it('does not re-enqueue method persist when rollback runs after a failed persist', () => {
    const setSelectedMethod = vi.fn()
    const { result, rerender } = renderHook(
      (params: ReturnType<typeof makeParams>) => useManualMethodPersistenceController(params),
      { initialProps: makeParams({ setSelectedMethod }) }
    )

    act(() => {
      result.current.handleSelectMethodWithOverride('ebitda')
    })

    rerender(makeParams({ selectedMethod: 'ebitda', setSelectedMethod }))

    expect(enqueueMethod).toHaveBeenCalledTimes(1)
    enqueueMethod.mockClear()

    act(() => {
      coordinatorHarness.onError?.(
        { kind: 'method', previousMethod: 'dcf' },
        new Error('persist failed')
      )
    })

    rerender(makeParams({ selectedMethod: 'dcf', setSelectedMethod }))

    expect(setSelectedMethod).toHaveBeenCalledWith('dcf')
    expect(enqueueMethod).not.toHaveBeenCalled()
  })
})
