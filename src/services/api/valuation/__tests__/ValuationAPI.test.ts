import { describe, expect, it, vi } from 'vitest'
import { NetworkError, ValidationError } from '../../../../types/errors'
import { ValuationAPI } from '../ValuationAPI'

type RequestExecutor = {
  executeRequest: (config: unknown, options?: unknown) => Promise<unknown>
}

type ValuationErrorHandler = {
  handleValuationError: (error: unknown, operation: string) => never
}

function spyOnExecuteRequest(api: ValuationAPI) {
  return vi.spyOn(api as unknown as RequestExecutor, 'executeRequest')
}

function handleValuationError(api: ValuationAPI, error: unknown, operation: string): never {
  return (api as unknown as ValuationErrorHandler).handleValuationError(error, operation)
}

describe('ValuationAPI validation handling', () => {
  it('forwards a valid graph context unchanged to valuation/report generation', async () => {
    const api = new ValuationAPI()
    const executeRequest = spyOnExecuteRequest(api).mockResolvedValue({})
    const companyGraphContext = {
      company_node_id: '11111111-1111-4111-8111-111111111111',
      graph_revision: 'a'.repeat(64),
      maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
      ruleset_version: 'company-graph-maturity/v3',
      audience: 'owner' as const,
    }

    await api.calculateManualValuation({ company_graph_context: companyGraphContext } as never)

    const outbound = executeRequest.mock.calls[0]?.[0] as { data?: Record<string, unknown> }
    expect(outbound.data?.company_graph_context).toBe(companyGraphContext)
  })

  it('rejects buyer/public or malformed graph contexts before dispatch', async () => {
    const api = new ValuationAPI()
    const executeRequest = spyOnExecuteRequest(api).mockResolvedValue({})

    await expect(
      api.calculateManualValuation({
        company_graph_context: {
          company_node_id: '11111111-1111-4111-8111-111111111111',
          graph_revision: 'a'.repeat(64),
          maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
          ruleset_version: 'company-graph-maturity/v3',
          audience: 'buyer',
        },
      } as never)
    ).rejects.toMatchObject({
      name: 'ValidationError',
      field: 'company_graph_context',
    })
    expect(executeRequest).not.toHaveBeenCalled()
  })

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
      handleValuationError(api, axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect((thrownError as ValidationError).message).toBe(
      'current_year_data.revenue: Revenue must be positive.'
    )
    expect((thrownError as ValidationError).field).toBe('current_year_data.revenue')
  })

  it('preserves unified tax-latency error codes, fields, and correlation IDs', () => {
    const api = new ValuationAPI()
    const axiosError = {
      response: {
        status: 400,
        data: {
          statusCode: 400,
          message: 'Validation failed',
          correlationId: 'cid_tax_latency_1',
          details: { code: 'TAX_LATENCY_FIELD_CONFLICT' },
          validationErrors: [
            {
              field: 'tax_latencies.0.tax_rate',
              message: 'tax_rate conflicts with legacy alias taxRate',
              type: 'custom',
            },
          ],
        },
      },
    }

    let thrownError: unknown
    try {
      handleValuationError(api, axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect((thrownError as ValidationError).field).toBe('tax_latencies.0.tax_rate')
    expect((thrownError as ValidationError).message).toContain('tax_rate conflicts')
    expect((thrownError as ValidationError).context).toMatchObject({
      code: 'TAX_LATENCY_FIELD_CONFLICT',
      correlationId: 'cid_tax_latency_1',
    })
  })

  it('rethrows selected method persistence failures', async () => {
    const api = new ValuationAPI()
    const error = new Error('report not found')
    spyOnExecuteRequest(api).mockRejectedValue(error)

    await expect(api.updateSelectedMethod('val_123', 'ebitda_multiple')).rejects.toThrow(
      'report not found'
    )
  })

  it('hoists academic_validation_issues on calculate responses', async () => {
    const api = new ValuationAPI()
    spyOnExecuteRequest(api).mockResolvedValue({
      valuation_id: 'val-1',
      equity_value_mid: 568_000,
      details: { academic_validation_issues: ['WACC below SME guidance'] },
    })

    const out = await api.calculateManualValuation({} as never)

    expect(out.academic_validation_issues).toEqual(['WACC below SME guidance'])
    expect(out.details?.academic_validation_issues).toEqual(['WACC below SME guidance'])
  })

  // BENCHMARK_CONTRACT_REQUIRED wiring — covers both the Titan-side preflight
  // (422 with structured `code`) and the python-tunneled-through-503 path
  // (Titan ServiceUnavailableException with `code` in the body). Both must
  // surface as ValidationError(context.code=BENCHMARK_CONTRACT_REQUIRED) so
  // the toast handler in useManualSubmitErrorHandler can render a typed
  // remediation. Real 503 outages (no code) keep falling to NetworkError.

  it('surfaces 422 BENCHMARK_CONTRACT_REQUIRED into ValidationError.context.code', () => {
    const api = new ValuationAPI()

    const axiosError = {
      response: {
        status: 422,
        data: {
          code: 'BENCHMARK_CONTRACT_REQUIRED',
          message:
            'A business type is required so Upswitch can attach the Upswitch Index benchmark contract to this calculation.',
          country_code: 'BE',
          reason: 'missing_business_type_id',
        },
      },
    }

    let thrownError: unknown
    try {
      handleValuationError(api, axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect((thrownError as ValidationError).context?.code).toBe('BENCHMARK_CONTRACT_REQUIRED')
    expect((thrownError as ValidationError).message).toMatch(/business type is required/)
  })

  it('preserves the recoverable accounting reconnect 409 contract', () => {
    const api = new ValuationAPI()
    const axiosError = {
      response: {
        status: 409,
        data: {
          code: 'ACCOUNTING_RECONNECT_REQUIRED',
          message: 'Reconnect Silverfin before calculating.',
          provider: 'silverfin',
          client_id: 'client-7',
          firm_id: 'firm-42',
          last_successful_sync_at: '2026-08-01T12:00:00.000Z',
        },
      },
    }

    let thrownError: unknown
    try {
      handleValuationError(api, axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect((thrownError as ValidationError).context).toEqual(
      expect.objectContaining({
        status: 409,
        code: 'ACCOUNTING_RECONNECT_REQUIRED',
        provider: 'silverfin',
        firm_id: 'firm-42',
      })
    )
  })

  it('surfaces 503 with structured code into ValidationError instead of generic NetworkError', () => {
    const api = new ValuationAPI()

    // Shape of Titan's ServiceUnavailableException({code, message}) for the
    // python-tunneled-through case. Same shape NestJS uses for any
    // UnprocessableEntityException with an object payload.
    const axiosError = {
      response: {
        status: 503,
        data: {
          code: 'BENCHMARK_CONTRACT_REQUIRED',
          message:
            'Valuation calculation failed: [BENCHMARK_CONTRACT_REQUIRED] Resolved benchmark contract required for multiples valuation.',
          error_type: 'MultiplesCalculationError',
        },
      },
    }

    let thrownError: unknown
    try {
      handleValuationError(api, axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ValidationError)
    expect((thrownError as ValidationError).context?.code).toBe('BENCHMARK_CONTRACT_REQUIRED')
    expect((thrownError as ValidationError).context?.via_503_passthrough).toBe(true)
    expect((thrownError as ValidationError).message).toMatch(/BENCHMARK_CONTRACT_REQUIRED/)
  })

  it('keeps 503 without a structured code as a generic NetworkError (real outage path)', () => {
    const api = new ValuationAPI()

    const axiosError = {
      response: {
        status: 503,
        data: { message: 'upstream timeout' }, // no `code` field
      },
    }

    let thrownError: unknown
    try {
      handleValuationError(api, axiosError, 'unified valuation')
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(NetworkError)
    expect(thrownError).not.toBeInstanceOf(ValidationError)
  })

  it('forwards preparer multiple edits on the method PATCH request', async () => {
    const api = new ValuationAPI()
    const executeRequest = spyOnExecuteRequest(api).mockResolvedValue({
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
