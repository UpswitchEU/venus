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
