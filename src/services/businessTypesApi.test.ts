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
                dcfPreference: { s: 1, e: -1, d: [7000000] },
                multiplesPreference: { s: 1, e: -1, d: [3000000] },
                ownerDependencyImpact: { s: 1, e: -1, d: [2000000] },
                typical_revenue_range: { min: { s: 1, e: 5, d: [100000] }, max: '5000000' },
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

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'vertical_ai',
      title: 'Vertical AI Platform',
      description: 'AI workflow automation.',
      icon: '\u{1F4A1}',
      category: 'Software',
      category_id: 'technology',
      industryMapping: 'vertical_ai_software',
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
    })

    const cached = JSON.parse(
      localStorage.getItem('upswitch_valuation_tester_business_types_cache') ?? '{}'
    )
    expect(cached.data.businessTypes).toEqual(result)
  })

  it('loads additional catalog pages only when Titan reports has_more', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            business_types: [
              {
                id: 'consulting',
                title: 'Consulting',
                category_id: 'professional',
                category: { title: 'Professional' },
              },
            ],
            has_more: true,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [{ id: 'professional', title: 'Professional Services' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            business_types: [
              {
                id: 'software',
                title: 'Software Development',
                category_id: 'technology',
                category: { title: 'Technology' },
                popular: true,
              },
            ],
            has_more: false,
          },
        },
      })

    const result = await businessTypesApiService.getBusinessTypes()

    expect(result.map((businessType) => businessType.id)).toEqual(['consulting', 'software'])
    expect(mockApiGet).toHaveBeenNthCalledWith(
      3,
      '/types',
      expect.objectContaining({
        params: expect.objectContaining({
          limit: 200,
          offset: 200,
          locale: 'nl',
        }),
      })
    )
    const cached = JSON.parse(
      localStorage.getItem('upswitch_valuation_tester_business_types_cache') ?? '{}'
    )
    expect(cached.data.categories).toEqual([
      { id: 'professional', name: 'Professional Services', icon: '🏢' },
    ])
    expect(cached.data.popularTypes).toEqual([result[1]])
  })

  it('serves hardcoded fallback business types when the catalog endpoint is unavailable', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet.mockRejectedValue(new Error('backend offline'))

    const result = await businessTypesApiService.getBusinessTypes()

    expect(result.length).toBeGreaterThan(0)
    expect(result).toContainEqual(
      expect.objectContaining({
        id: 'services',
        title: 'Services',
        category: 'Professional',
      })
    )
    const cached = JSON.parse(
      localStorage.getItem('upswitch_valuation_tester_business_types_cache') ?? '{}'
    )
    expect(cached.data.businessTypes).toEqual(result)
  })

  it('normalizes full metadata from Titan camelCase and Decimal.js fields', async () => {
    const { businessTypesApiService } = await import('./businessTypesApi')
    mockApiGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 'accounting',
          title: 'Accounting & Finance',
          description: 'Accounting firm',
          icon: '\u{1F4CA}',
          categoryId: 'professional-services',
          industryMapping: 'Professional Services',
          sector: 'services',
          industry: 'professional-services',
          dcfPreference: { s: 1, e: -1, d: [6000000] },
          multiplesPreference: { s: 1, e: -1, d: [4000000] },
          ownerDependencyImpact: { s: 1, e: -1, d: [5500000] },
          keyMetrics: ['revenue', 'client_retention'],
          typicalRevenueMin: { s: 1, e: 5, d: [180000] },
          typicalRevenueMax: { s: 1, e: 6, d: [3000000] },
          typicalRevenueMedian: { s: 1, e: 5, d: [600000] },
          typicalEbitdaMarginMedian: { s: 1, e: 1, d: [28] },
          typicalEmployeeRange: { min: 1, max: 50 },
          questions: [{ id: 'clients', text: 'Clients?', required: true }],
          validations: [],
          benchmarks: [],
          metadata: [],
          status: 'active',
          version: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    })

    const result = await businessTypesApiService.getBusinessTypeFull('accounting')

    expect(result).toMatchObject({
      id: 'accounting',
      category_id: 'professional-services',
      dcf_preference: 0.6,
      multiples_preference: 0.4,
      owner_dependency_impact: 0.55,
      typical_revenue_min: 180000,
      typical_revenue_max: 3000000,
      typical_revenue_median: 600000,
      typical_ebitda_margin_median: 28,
      typical_employee_min: 1,
      typical_employee_max: 50,
      key_metrics: [
        { name: 'revenue', label: 'revenue' },
        { name: 'client_retention', label: 'client_retention' },
      ],
    })
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
