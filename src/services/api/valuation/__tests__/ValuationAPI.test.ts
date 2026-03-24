import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../../../../types/errors'
import { ValuationAPI } from '../ValuationAPI'

describe('ValuationAPI validation handling', () => {
  it('surfaces detailed 422 validation errors from Titan', () => {
    const api = new ValuationAPI()

    const axiosError = {
      response: {
        status: 422,
        data: {
          code: 'VALIDATION_ERROR',
          message: 'current_year_data.revenue: Revenue must be positive.',
          field: 'current_year_data.revenue',
          errors: [
            {
              field: 'current_year_data.revenue',
              message: 'Revenue must be positive.',
            },
          ],
          hint: 'Please verify your financial data.',
        },
      },
    }

    let thrownError: unknown
    try {
      ;(api as any).handleValuationError(axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect((thrownError as ValidationError).message).toBe(
      'current_year_data.revenue: Revenue must be positive.'
    )
    expect((thrownError as ValidationError).field).toBe('current_year_data.revenue')
  })

  it('rethrows selected method persistence failures', async () => {
    const api = new ValuationAPI()
    const error = new Error('report not found')
    vi.spyOn(api as any, 'executeRequest').mockRejectedValue(error)

    await expect(api.updateSelectedMethod('val_123', 'ebitda_multiple')).rejects.toThrow(
      'report not found'
    )
  })
})
