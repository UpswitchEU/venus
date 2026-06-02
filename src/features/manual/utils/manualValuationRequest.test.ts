// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizationItem } from '@/components/calculator'
import type { ValuationFormData, ValuationRequest } from '@/types/valuation'
import { buildManualValuationRequest } from '@/utils/buildManualValuationRequest'
import {
  buildManualCalculationRequest,
  decorateManualValuationRequest,
} from './manualValuationRequest'

vi.mock('@/utils/buildManualValuationRequest', () => ({
  buildManualValuationRequest: vi.fn(),
}))

const buildManualValuationRequestMock = vi.mocked(buildManualValuationRequest)

function baseRequest(): ValuationRequest {
  return {
    company_name: 'Acme BV',
    country_code: 'BE',
    industry: 'services',
    business_model: 'services',
    founding_year: 2001,
    current_year_data: {
      year: 2025,
      revenue: 1_000_000,
      ebitda: 120_000,
    },
  }
}

beforeEach(() => {
  buildManualValuationRequestMock.mockReset()
})

describe('decorateManualValuationRequest', () => {
  it('applies the manual-flow request contract in one place', () => {
    const request = decorateManualValuationRequest(baseRequest(), {
      selectedMethod: 'dcf',
      identifiers: {
        reportId: '8d57c0da-8fc9-4042-a9ca-2f8c17b78b10',
        sessionKey: 'val_1700000000000_abc',
      },
      synthesisSelection: {
        preSelectedMethods: ['dcf', 'ebitda_multiple'],
        userWeights: { dcf: 35, ebitda_multiple: 65 },
        userWeightJustification: 'DCF is useful, market evidence dominates.',
      },
    })

    expect(request.dataSource).toBe('manual')
    expect(request.selected_method).toBe('upswitch_adaptive')
    expect(request.reportId).toBe('8d57c0da-8fc9-4042-a9ca-2f8c17b78b10')
    expect(request.sessionKey).toBe('val_1700000000000_abc')
    expect(request.user_weights).toEqual({ dcf: 0.35, ebitda_multiple: 0.65 })
    expect(request.user_weight_justification).toBe('DCF is useful, market evidence dominates.')
  })

  it('omits optional fields when absent or blank', () => {
    const request = decorateManualValuationRequest(baseRequest(), {
      selectedMethod: '  ',
      synthesisSelection: {
        preSelectedMethods: ['upswitch_adaptive'],
        userWeights: {},
        userWeightJustification: '',
      },
    })

    expect(request.dataSource).toBe('manual')
    expect(request.selected_method).toBeUndefined()
    expect(request.reportId).toBeUndefined()
    expect(request.sessionKey).toBeUndefined()
    expect(request.user_weights).toBeUndefined()
    expect(request.user_weight_justification).toBeUndefined()
  })
})

describe('buildManualCalculationRequest', () => {
  it('builds the raw request and applies the manual-flow request contract', () => {
    const rawRequest = baseRequest()
    buildManualValuationRequestMock.mockReturnValue(rawRequest)
    const formData = {
      company_name: 'Acme BV',
      country_code: 'BE',
      industry: 'services',
      business_model: 'services',
      founding_year: 2001,
      current_year_data: {
        year: 2025,
        revenue: 1_000_000,
        ebitda: 120_000,
      },
    } as ValuationFormData
    const normalizations = [
      {
        id: 'norm-1',
        status: 'accepted',
      },
    ] as unknown as NormalizationItem[]

    const request = buildManualCalculationRequest({
      formData,
      normalizations,
      locale: 'en',
      selectedMethod: 'dcf',
      identifiers: { reportId: 'report-1' },
      synthesisSelection: {
        preSelectedMethods: ['dcf', 'ebitda_multiple'],
        userWeights: { dcf: 40, ebitda_multiple: 60 },
      },
    })

    expect(buildManualValuationRequestMock).toHaveBeenCalledWith(formData, normalizations, 'en')
    expect(request).toBe(rawRequest)
    expect(request.dataSource).toBe('manual')
    expect(request.selected_method).toBe('upswitch_adaptive')
    expect(request.reportId).toBe('report-1')
    expect(request.user_weights).toEqual({ dcf: 0.4, ebitda_multiple: 0.6 })
  })
})
