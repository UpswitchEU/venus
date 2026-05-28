import { describe, expect, it } from 'vitest'
import { buildBusinessTypeFormData } from './businessTypeFormData'

describe('buildBusinessTypeFormData', () => {
  it('maps a business_type_id to one consistent valuation classification payload', () => {
    const result = buildBusinessTypeFormData({
      id: 'recycling',
      title: 'Recycling Services',
      description: 'Scrap metal and recycling',
      short_description: 'Scrap metal and recycling',
      icon: '♻️',
      category: 'environmental',
      category_id: 'environmental',
      industryMapping: 'Environmental Services',
      industry: '',
      keywords: ['recycling'],
      popular: false,
      dcfPreference: 0.2,
      multiplesPreference: 0.8,
      ownerDependencyImpact: 0.4,
      keyMetrics: ['ebitda'],
      typicalEmployeeRange: { min: 1, max: 10 },
      typicalRevenueRange: { min: 100000, max: 1000000 },
      status: 'active',
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    })

    expect(result).toEqual({
      business_type_id: 'recycling',
      business_type_title: 'Recycling Services',
      business_model: 'recycling',
      industry: 'Environmental Services',
      subIndustry: 'environmental',
      _internal_dcf_preference: 0.2,
      _internal_multiples_preference: 0.8,
      _internal_owner_dependency_impact: 0.4,
      _internal_key_metrics: ['ebitda'],
      _internal_typical_employee_range: { min: 1, max: 10 },
      _internal_typical_revenue_range: { min: 100000, max: 1000000 },
    })
  })
})
