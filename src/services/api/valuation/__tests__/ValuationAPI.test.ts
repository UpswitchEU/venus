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

  it('forwards preparer multiple edits on the method PATCH request', async () => {
    const api = new ValuationAPI()
    const executeRequest = vi.spyOn(api as any, 'executeRequest').mockResolvedValue({
      selected_method: 'upswitch_adaptive',
    })

    await api.updateSelectedMethod('val_123', 'upswitch_adaptive', undefined, undefined, {
      preparer_ev_ebitda_median: 6.2,
      preparer_ev_ebitda_override: {
        reason_key: 'strategic_buyer_premium',
        note: 'Strategic synergies expected.',
      },
    })

    expect(executeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selected_method: 'upswitch_adaptive',
          preparer_ev_ebitda_median: 6.2,
          preparer_ev_ebitda_override: {
            reason_key: 'strategic_buyer_premium',
            note: 'Strategic synergies expected.',
          },
        }),
      }),
      expect.any(Object)
    )
  })
})
