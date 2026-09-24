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

    // F-13: the result is already calculated and on screen; the save can be re-sent.
    it('offers a retry with non-alarming copy when the caller can re-send the save', async () => {
      const { toast } = await import('sonner')
      const toastWarning = vi.spyOn(toast, 'warning')
      const toastError = vi.spyOn(toast, 'error')
      toastError.mockClear()
      const onRetry = vi.fn()

      toastSaveFailure(new Error('Request failed with status code 500'), (key) => key, {
        onRetry,
      })

      expect(toastError).not.toHaveBeenCalled()
      expect(toastWarning).toHaveBeenCalledWith('saveResultNotSaved', {
        description: 'saveResultRetryDesc',
        duration: 20_000,
        action: { label: 'saveRetry', onClick: onRetry },
      })
    })

    it('keeps the slow-save title on the retryable variant for network errors', async () => {
      const { toast } = await import('sonner')
      const toastWarning = vi.spyOn(toast, 'warning')

      toastSaveFailure(new NetworkError('Unavailable'), (key) => key, { onRetry: vi.fn() })

      expect(toastWarning).toHaveBeenLastCalledWith(
        'saveStillInProgress',
        expect.objectContaining({ description: 'saveResultRetryDesc' })
      )
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
