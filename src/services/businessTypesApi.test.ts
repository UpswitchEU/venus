import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockApiGet, mockApiPost, mockAxiosCreate } = vi.hoisted(() => {
  const mockApiGet = vi.fn()
  const mockApiPost = vi.fn()
  const mockAxiosCreate = vi.fn(() => ({
    get: mockApiGet,
    post: mockApiPost,
  }))

  return { mockApiGet, mockApiPost, mockAxiosCreate }
})

vi.mock('axios', () => ({
  default: {
    create: mockAxiosCreate,
    get: vi.fn(),
  },
}))

vi.mock('../utils/getMercuryUrl', () => ({
  getApiUrl: () => 'https://titan.test/api',
}))

vi.mock('../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('businessTypesApiService', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    localStorage.clear()
    window.history.pushState({}, '', '/nl/waardering')
  })

  it('normalizes catalog items before returning and caching them', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            business_types: [
              {
                id: 'vertical_ai',
                title: 'Vertical AI Platform',
                description: 'AI workflow automation.',
                emoji: '\u{1F4A1}',
                category: { id: 'technology', title: 'Software' },
                category_id: 'technology',
                industry_mapping: 'vertical_ai_software',
                key_metrics: ['arr', 'nrr'],
                popular: true,
                dcf_preference: 0.7,
                multiples_preference: 0.3,
                owner_dependency_impact: 0.2,
                typical_revenue_range: { min: 100000, max: 5000000 },
                typical_employee_range: { min: 2, max: 40 },
                status: 'active',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z',
              },
              null,
              { title: 'Missing id' },
            ],
            has_more: false,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [{ id: 'technology', name: 'Technology', icon: '\u{1F4BB}' }],
        },
      })

    const result = await businessTypesApiService.getBusinessTypes()

    expect(result).toEqual([
      {
        id: 'vertical_ai',
        title: 'Vertical AI Platform',
        description: 'AI workflow automation.',
        short_description: undefined,
        icon: '\u{1F4A1}',
        category: 'Software',
        category_id: 'technology',
        industryMapping: 'vertical_ai_software',
        industry: undefined,
        keywords: [],
        popular: true,
        dcfPreference: 0.7,
        multiplesPreference: 0.3,
        ownerDependencyImpact: 0.2,
        keyMetrics: ['arr', 'nrr'],
        typicalEmployeeRange: { min: 2, max: 40 },
        typicalRevenueRange: { min: 100000, max: 5000000 },
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ])

    const cached = JSON.parse(
      localStorage.getItem('upswitch_valuation_tester_business_types_cache') ?? '{}'
    )
    expect(cached.data.businessTypes).toEqual(result)
  })

  it('serializes question context and normalizes Titan question metadata', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          business_type_id: 'saas',
          flow_type: 'ai_guided',
          phase: 'financials',
          questions: [
            { id: 'revenue_model', text: 'How does revenue recur?', required: true },
            { id: 'nrr', text: 'What is net revenue retention?', required: false },
          ],
          total_required: 1,
          estimated_time: 4,
          source: 'titan-metadata',
        },
      },
    })

    const result = await businessTypesApiService.getBusinessTypeQuestions('saas', {
      flow_type: 'ai_guided',
      phase: 'financials',
      existing_data: { revenue: 500000 },
    })

    expect(mockApiGet).toHaveBeenCalledWith('/types/saas/questions', {
      params: {
        locale: 'nl',
        flow_type: 'ai_guided',
        phase: 'financials',
        existing_data: JSON.stringify({ revenue: 500000 }),
      },
    })
    expect(result).toEqual({
      business_type_id: 'saas',
      flow_type: 'ai_guided',
      phase: 'financials',
      questions: [
        { id: 'revenue_model', text: 'How does revenue recur?', required: true },
        { id: 'nrr', text: 'What is net revenue retention?', required: false },
      ],
      total_required: 1,
      estimated_time: 4,
      source: 'titan-metadata',
    })
  })

  it('fills safe question defaults when Titan omits optional metadata', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          questions: [
            { id: 'owner_dependency', text: 'Owner dependency?', required: true },
            { id: 'gross_margin' },
          ],
        },
      },
    })

    await expect(businessTypesApiService.getBusinessTypeQuestions('services')).resolves.toEqual({
      business_type_id: 'services',
      flow_type: undefined,
      phase: 'initial',
      questions: [
        { id: 'owner_dependency', text: 'Owner dependency?', required: true },
        { id: 'gross_margin', text: 'gross_margin', required: false },
      ],
      total_required: 1,
      estimated_time: 2,
      source: undefined,
    })
  })

  it('maps Titan validation issues into the UI validation contract', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          business_type_id: 'saas',
          valid: false,
          errors: [
            {
              field: 'revenue',
              type: 'non_negative',
              message: 'Revenue must be non-negative.',
            },
          ],
          warnings: [
            {
              field: 'ebitda',
              type: 'ebitda_exceeds_revenue',
              message: 'EBITDA is higher than revenue.',
            },
          ],
          suggestions: [
            {
              field: 'nrr',
              type: 'key_metric_missing',
              message: 'Add net revenue retention for stronger SaaS benchmarking.',
            },
          ],
          checked_fields: 2,
          source: 'titan-metadata',
        },
      },
    })

    const result = await businessTypesApiService.validateBusinessTypeData('saas', {
      revenue: -1,
    })

    expect(mockApiPost).toHaveBeenCalledWith('/types/saas/validate', {
      data: { revenue: -1 },
      locale: 'nl',
    })
    expect(result).toEqual({
      business_type_id: 'saas',
      valid: false,
      errors: [
        {
          field: 'revenue',
          rule: 'non_negative',
          message: 'Revenue must be non-negative.',
          severity: 'error',
        },
      ],
      warnings: [
        {
          field: 'ebitda',
          rule: 'ebitda_exceeds_revenue',
          message: 'EBITDA is higher than revenue.',
          severity: 'warning',
        },
      ],
      suggestions: [
        {
          field: 'nrr',
          rule: 'key_metric_missing',
          message: 'Add net revenue retention for stronger SaaS benchmarking.',
          severity: 'info',
        },
      ],
      checked_fields: 2,
      source: 'titan-metadata',
    })
  })

  it('returns null for unsuccessful Titan responses', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet.mockResolvedValueOnce({ data: { success: false } })
    mockApiPost.mockResolvedValueOnce({ data: { success: false } })

    await expect(businessTypesApiService.getBusinessTypeQuestions('unknown')).resolves.toBeNull()
    await expect(
      businessTypesApiService.validateBusinessTypeData('unknown', {})
    ).resolves.toBeNull()
  })
})
