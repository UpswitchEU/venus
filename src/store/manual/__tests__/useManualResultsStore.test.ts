/**
 * Unit Tests for useManualResultsStore
 *
 * Tests atomic operations, calculation state management, and trySetCalculating pattern.
 *
 * @module store/manual/__tests__/useManualResultsStore.test.ts
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useManualResultsStore } from '../useManualResultsStore'

describe('useManualResultsStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { clearResults, setCalculating } = useManualResultsStore.getState()
    clearResults()
    setCalculating(false)
  })

  describe('Initial State', () => {
    it('should have no result initially', () => {
      const { result } = renderHook(() => useManualResultsStore())

      expect(result.current.result).toBeNull()
    })

    it('should have no HTML report initially', () => {
      const { result } = renderHook(() => useManualResultsStore())

      expect(result.current.htmlReport).toBeNull()
    })

    it('should not be calculating initially', () => {
      const { result } = renderHook(() => useManualResultsStore())

      expect(result.current.isCalculating).toBe(false)
    })

    it('should have no error initially', () => {
      const { result } = renderHook(() => useManualResultsStore())

      expect(result.current.error).toBeNull()
    })
  })

  describe('trySetCalculating', () => {
    it('should set calculating to true on first call', () => {
      const { result } = renderHook(() => useManualResultsStore())

      let wasSet: boolean = false
      act(() => {
        wasSet = result.current.trySetCalculating()
      })

      expect(wasSet).toBe(true)
      expect(result.current.isCalculating).toBe(true)
    })

    it('should return false on second call (prevents double submission)', () => {
      const { result } = renderHook(() => useManualResultsStore())

      let firstCall: boolean = false
      let secondCall: boolean = false

      act(() => {
        firstCall = result.current.trySetCalculating()
        secondCall = result.current.trySetCalculating()
      })

      expect(firstCall).toBe(true)
      expect(secondCall).toBe(false)
      expect(result.current.isCalculating).toBe(true)
    })

    it('should clear error when setting calculating', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setError('Previous error')
      })

      act(() => {
        result.current.trySetCalculating()
      })

      expect(result.current.error).toBeNull()
    })

    it('should allow setting calculating again after reset', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.trySetCalculating()
        result.current.setCalculating(false)
      })

      let wasSet: boolean = false
      act(() => {
        wasSet = result.current.trySetCalculating()
      })

      expect(wasSet).toBe(true)
      expect(result.current.isCalculating).toBe(true)
    })
  })

  describe('setCalculating', () => {
    it('should set calculating state', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setCalculating(true)
      })

      expect(result.current.isCalculating).toBe(true)

      act(() => {
        result.current.setCalculating(false)
      })

      expect(result.current.isCalculating).toBe(false)
    })

    it('should skip duplicate setCalculating(true) calls', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setCalculating(true)
        result.current.setCalculating(true) // Should be skipped
      })

      expect(result.current.isCalculating).toBe(true)
    })
  })

  describe('setResult', () => {
    it('should set valuation result', () => {
      const { result } = renderHook(() => useManualResultsStore())

      const mockResult = {
        valuation_id: 'val-123',
        html_report: '<html>Report</html>',
      } as any

      act(() => {
        result.current.setResult(mockResult)
      })

      expect(result.current.result).toEqual(mockResult)
      expect(result.current.htmlReport).toBe('<html>Report</html>')
    })

    it('should derive the active valuation from nested valuation_result payloads', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setSelectedMethod('ebitda_multiple')
        result.current.setResult({
          valuation_id: 'val-123',
          html_report: '<html>Report</html>',
          valuation_result: {
            valuation_results: {
              ebitda_multiple: {
                available: true,
                value: 250000,
                label: 'EBITDA Multiple',
              },
            },
          },
        } as any)
      })

      expect(result.current.getActiveValuation()).toMatchObject({
        available: true,
        value: 250000,
      })
    })

    it('should derive the active valuation from valuation_result.details payloads', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setSelectedMethod('ebitda_multiple')
        result.current.setResult({
          valuation_id: 'val-123',
          html_report: '<html>Report</html>',
          valuation_result: {
            details: {
              valuation_results: {
                ebitda_multiple: {
                  available: true,
                  value: 260000,
                  label: 'EBITDA Multiple',
                },
              },
            },
          },
        } as any)
      })

      expect(result.current.getActiveValuation()).toMatchObject({
        available: true,
        value: 260000,
      })
    })

    it('should clear result when null is passed', () => {
      const { result } = renderHook(() => useManualResultsStore())

      const mockResult = {
        valuation_id: 'val-123',
        html_report: '<html>Report</html>',
      } as any

      act(() => {
        result.current.setResult(mockResult)
      })

      act(() => {
        result.current.setResult(null)
      })

      expect(result.current.result).toBeNull()
      expect(result.current.selectedMethod).toBe('upswitch_adaptive')
      expect(result.current.preSelectedMethod).toBeNull()
      expect(result.current.getEffectiveMethod()).toBe('upswitch_adaptive')
    })

    it('hydrates preSelectedMethods and weights from weighted_valuation when session was single-method', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setPreSelectedMethod('ebitda_multiple')
      })

      act(() => {
        result.current.setResult({
          valuation_id: 'val-blend',
          html_report: '<html>Report</html>',
          selected_valuation_method: 'ebitda_multiple',
          weighted_valuation: {
            blended_equity_value: 400000,
            contributions: [
              { method_key: 'ebitda_multiple', label: 'EBITDA', equity_value: 400000, weight: 0.5, weighted_contribution: 200000 },
              { method_key: 'adjusted_nav', label: 'NAV', equity_value: 400000, weight: 0.5, weighted_contribution: 200000 },
            ],
            user_justification: 'Test note',
          },
          valuation_results: {
            ebitda_multiple: { available: true, value: 400000, label: 'M' },
            adjusted_nav: { available: true, value: 400000, label: 'N' },
          },
        } as any)
      })

      expect(result.current.preSelectedMethods).toEqual(['ebitda_multiple', 'adjusted_nav'])
      expect(result.current.userWeights).toEqual({ ebitda_multiple: 50, adjusted_nav: 50 })
      expect(result.current.userWeightJustification).toBe('Test note')
    })

    it('hydrates selected and preselected methods from selected_valuation_method', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setPreSelectedMethod('dcf')
        result.current.setResult({
          valuation_id: 'val-456',
          html_report: '<html>Report</html>',
          selected_valuation_method: 'adjusted_nav',
          valuation_result: {
            valuation_results: {
              adjusted_nav: { available: true, value: 300000, label: 'NAV' },
              dcf: { available: true, value: 250000, label: 'DCF' },
            },
          },
        } as any)
      })

      expect(result.current.selectedMethod).toBe('adjusted_nav')
      expect(result.current.preSelectedMethod).toBe('adjusted_nav')
      expect(result.current.getEffectiveMethod()).toBe('adjusted_nav')
    })
  })

  describe('method coherence', () => {
    it('keeps adjusted_nav combinable with ebitda_multiple for weighted synthesis', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setPreSelectedMethods(['ebitda_multiple', 'adjusted_nav'])
      })

      expect(result.current.preSelectedMethods).toEqual(['ebitda_multiple', 'adjusted_nav'])
      expect(result.current.userWeights).toEqual({
        ebitda_multiple: 50,
        adjusted_nav: 50,
      })
    })

    it('adds adjusted_nav via togglePreSelectedMethod without clearing ebitda_multiple', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.togglePreSelectedMethod('ebitda_multiple')
      })
      act(() => {
        result.current.togglePreSelectedMethod('adjusted_nav')
      })

      expect(result.current.preSelectedMethods).toEqual(['ebitda_multiple', 'adjusted_nav'])
      expect(result.current.userWeights).toEqual({
        ebitda_multiple: 50,
        adjusted_nav: 50,
      })
    })

    it('returns to adaptive when preselection is cleared', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setPreSelectedMethod('dcf')
      })
      expect(result.current.getEffectiveMethod()).toBe('dcf')

      act(() => {
        result.current.setPreSelectedMethod(null)
      })

      expect(result.current.selectedMethod).toBe('upswitch_adaptive')
      expect(result.current.preSelectedMethod).toBeNull()
      expect(result.current.getEffectiveMethod()).toBe('upswitch_adaptive')
    })

    it('keeps post-calculation method changes bidirectionally synced', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setSelectedMethod('dcf')
      })

      expect(result.current.selectedMethod).toBe('dcf')
      expect(result.current.preSelectedMethod).toBe('dcf')
      expect(result.current.getEffectiveMethod()).toBe('dcf')
    })
  })

  describe('setHtmlReport', () => {
    it('should set HTML report', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setHtmlReport('<html>Report</html>')
      })

      expect(result.current.htmlReport).toBe('<html>Report</html>')
    })

    it('should update HTML report in existing result', () => {
      const { result } = renderHook(() => useManualResultsStore())

      const mockResult = {
        valuation_id: 'val-123',
        html_report: '<html>Old</html>',
      } as any

      act(() => {
        result.current.setResult(mockResult)
      })

      act(() => {
        result.current.setHtmlReport('<html>New</html>')
      })

      expect(result.current.result?.html_report).toBe('<html>New</html>')
      expect(result.current.htmlReport).toBe('<html>New</html>')
    })
  })

  describe('setError', () => {
    it('should set error', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setError('Calculation failed')
      })

      expect(result.current.error).toBe('Calculation failed')
    })

    it('should clear calculating state when setting error', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setCalculating(true)
      })

      act(() => {
        result.current.setError('Calculation failed')
      })

      expect(result.current.isCalculating).toBe(false)
      expect(result.current.error).toBe('Calculation failed')
    })
  })

  describe('clearError', () => {
    it('should clear error', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setError('Calculation failed')
      })

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('clearResults', () => {
    it('should clear all results', () => {
      const { result } = renderHook(() => useManualResultsStore())

      const mockResult = {
        valuation_id: 'val-123',
        html_report: '<html>Report</html>',
      } as any

      act(() => {
        result.current.setResult(mockResult)
        result.current.setError('Some error')
      })

      act(() => {
        result.current.clearResults()
      })

      expect(result.current.result).toBeNull()
      expect(result.current.htmlReport).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('resets calculation state and method selection', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setPreSelectedMethod('dcf')
        result.current.setCalculating(true)
      })

      act(() => {
        result.current.clearResults()
      })

      expect(result.current.isCalculating).toBe(false)
      expect(result.current.selectedMethod).toBe('upswitch_adaptive')
      expect(result.current.preSelectedMethod).toBeNull()
      expect(result.current.getEffectiveMethod()).toBe('upswitch_adaptive')
    })
  })

  describe('Atomic Operations', () => {
    it('should handle concurrent state changes atomically', () => {
      const { result } = renderHook(() => useManualResultsStore())

      act(() => {
        result.current.setCalculating(true)
        result.current.setError('Error 1')
        result.current.setError('Error 2')
      })

      // Last error should win, calculating should be false (setError clears it)
      expect(result.current.error).toBe('Error 2')
      expect(result.current.isCalculating).toBe(false)
    })

    it('should maintain state consistency across multiple operations', () => {
      const { result } = renderHook(() => useManualResultsStore())

      const mockResult = {
        valuation_id: 'val-123',
        html_report: '<html>Report</html>',
      } as any

      act(() => {
        result.current.trySetCalculating()
        result.current.setResult(mockResult)
        result.current.setCalculating(false)
      })

      expect(result.current.result).toEqual(mockResult)
      expect(result.current.isCalculating).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })
})
