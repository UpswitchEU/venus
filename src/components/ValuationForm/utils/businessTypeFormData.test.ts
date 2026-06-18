import { describe, expect, it } from 'vitest'
import {
  buildBusinessTypeFormData,
  buildBusinessTypeSegmentsFormData,
  resolveBusinessTypesFromKboCompany,
} from './businessTypeFormData'

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

describe('buildBusinessTypeSegmentsFormData', () => {
  it('keeps a single selected business type as a canonical 100% segment', () => {
    const result = buildBusinessTypeSegmentsFormData([
      {
        id: 'accounting',
        title: 'Accounting practice',
        primaryMultiple: {
          label: 'EV/EBITDA',
          basis: 'EBITDA',
          median: 5.4,
        },
      },
    ])

    expect(result.business_type_segments).toEqual([
      {
        business_type_id: 'accounting',
        business_type_title: 'Accounting practice',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        multiple: 5.4,
        weight: 100,
      },
    ])
  })

  it('maps selected business types to SOTP segment rows and preserves advisor earnings', () => {
    const result = buildBusinessTypeSegmentsFormData(
      [
        {
          id: ' recycling ',
          title: 'Recycling Services',
          evEbitdaMedian: 4.2,
        },
        {
          id: 'transport',
          title: 'Transport',
          primaryMultiple: {
            label: 'EV/Revenue',
            median: 1.1,
          },
        },
      ],
      [
        {
          business_type_id: 'recycling',
          business_type_title: 'Old label',
          earnings: '700000',
          multiple: 3.8,
          basis: 'EBITDA',
          weight: 70,
        },
      ]
    )

    expect(result.business_type_segments).toEqual([
      {
        business_type_id: 'recycling',
        business_type_title: 'Recycling Services',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        earnings: '700000',
        multiple: 4.2,
        weight: 70,
      },
      {
        business_type_id: 'transport',
        business_type_title: 'Transport',
        basis: 'Revenue',
        earnings_basis: 'Revenue',
        multiple: 1.1,
        weight: 30,
      },
    ])
  })

  it('seeds fallback KBO candidates with their primary multiples when the catalog is unavailable', () => {
    const selected = resolveBusinessTypesFromKboCompany(
      {
        id: 'kbo-123',
        name: 'Boekhoudkantoor Venus',
        kboNumber: '0123456789',
        legalForm: 'BV',
        address: '',
        postalCode: '',
        city: '',
        businessTypeIds: ['accounting_firm', 'business_consulting'],
        businessTypeCandidates: [
          {
            id: 'accounting_firm',
            title: 'Boekhoudkantoor',
            naceCode: '69.201',
            primaryMultiple: {
              label: 'EV/EBITDA',
              basis: 'EBITDA',
              median: 5.4,
            },
          },
          {
            id: 'business_consulting',
            title: 'Business consulting',
            naceCode: '70.220',
            primaryMultiple: {
              label: 'EV/Revenue',
              basis: 'Revenue',
              median: 1.3,
            },
          },
        ],
      },
      []
    )

    expect(buildBusinessTypeSegmentsFormData(selected).business_type_segments).toEqual([
      {
        business_type_id: 'accounting_firm',
        business_type_title: 'Boekhoudkantoor',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        multiple: 5.4,
        weight: 50,
      },
      {
        business_type_id: 'business_consulting',
        business_type_title: 'Business consulting',
        basis: 'Revenue',
        earnings_basis: 'Revenue',
        multiple: 1.3,
        weight: 50,
      },
    ])
  })

  it('honors KBO suggested candidate weights when catalog business types are available', () => {
    const selected = resolveBusinessTypesFromKboCompany(
      {
        id: 'kbo-123',
        name: 'Boekhoudkantoor Venus',
        kboNumber: '0123456789',
        legalForm: 'BV',
        address: '',
        postalCode: '',
        city: '',
        businessTypeIds: ['accounting_firm', 'business_consulting'],
        businessTypeCandidates: [
          {
            id: 'accounting_firm',
            title: 'Boekhoudkantoor',
            weight: 0.65,
          },
          {
            id: 'business_consulting',
            title: 'Business consulting',
            weight: 0.35,
          },
        ],
      },
      [
        {
          id: 'accounting_firm',
          title: 'Accounting catalog',
          description: '',
          icon: '📊',
          category: 'services',
          category_id: 'services',
          industryMapping: 'services',
          keywords: [],
          popular: false,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'business_consulting',
          title: 'Consulting catalog',
          description: '',
          icon: '📊',
          category: 'services',
          category_id: 'services',
          industryMapping: 'services',
          keywords: [],
          popular: false,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
      ]
    )

    expect(buildBusinessTypeSegmentsFormData(selected).business_type_segments).toEqual([
      expect.objectContaining({
        business_type_id: 'accounting_firm',
        business_type_title: 'Accounting catalog',
        weight: 65,
      }),
      expect.objectContaining({
        business_type_id: 'business_consulting',
        business_type_title: 'Consulting catalog',
        weight: 35,
      }),
    ])
  })
})
