import { describe, expect, it, vi } from 'vitest'
import { NetworkError } from '../../types/errors'
import { isSlowSaveError, toastSaveFailure } from '../saveErrorHandling'

describe('saveErrorHandling', () => {
  describe('isSlowSaveError', () => {
    it('detects NetworkError instances', () => {
      expect(isSlowSaveError(new NetworkError('Service unavailable'))).toBe(true)
    })

    it('detects timeout and abort messages', () => {
      expect(isSlowSaveError(new Error('Request timeout exceeded'))).toBe(true)
      expect(isSlowSaveError(new Error('The operation was aborted'))).toBe(true)
    })

    it('returns false for validation failures', () => {
      expect(isSlowSaveError(new Error('Invalid employee count'))).toBe(false)
    })
  })

  describe('toastSaveFailure', () => {
    it('shows slow-save copy for network errors', async () => {
      const { toast } = await import('sonner')
      const toastError = vi.spyOn(toast, 'error')

      toastSaveFailure(new NetworkError('Unavailable'), (key) => key)

      expect(toastError).toHaveBeenCalledWith('saveStillInProgress', {
        description: 'saveStillInProgressDesc',
        duration: 8000,
      })
    })

    it('shows generic save failure for other errors', async () => {
      const { toast } = await import('sonner')
      const toastError = vi.spyOn(toast, 'error')

      toastSaveFailure(new Error('Validation failed'), (key) => key)

      expect(toastError).toHaveBeenCalledWith('saveReportFailed', {
        description: 'Validation failed',
      })
    })
  })
})
