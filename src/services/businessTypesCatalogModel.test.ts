import { describe, expect, it } from 'vitest'
import type { BusinessType } from './businessTypesApi.helpers'
import {
  buildBusinessTypesCacheData,
  buildHardcodedBusinessTypes,
  getBusinessTypesCacheDecision,
  MIN_COMPLETE_BUSINESS_TYPES_CACHE_COUNT,
  normalizeBusinessCategories,
  normalizeBusinessTypeSearchResults,
  normalizeBusinessTypesPage,
  normalizeNaceBusinessTypePayload,
} from './businessTypesCatalogModel'

function makeBusinessType(id: string, popular = false): BusinessType {
  return {
    id,
    title: id,
    description: '',
    icon: '🏢',
    category: 'Services',
    category_id: 'services',
    industryMapping: id,
    keywords: [],
    popular,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('businessTypesCatalogModel', () => {
  it('invalidates old partial catalog caches and accepts complete caches', () => {
    const partial = buildBusinessTypesCacheData([makeBusinessType('one')], [])
    expect(getBusinessTypesCacheDecision(null)).toEqual({ action: 'miss' })
    expect(getBusinessTypesCacheDecision(partial)).toEqual({
      action: 'invalidate-incomplete',
      cachedCount: 1,
      expected: `${MIN_COMPLETE_BUSINESS_TYPES_CACHE_COUNT}+ fresh catalog entries`,
    })

    const complete = buildBusinessTypesCacheData(
      Array.from({ length: MIN_COMPLETE_BUSINESS_TYPES_CACHE_COUNT }, (_, index) =>
        makeBusinessType(`type-${index}`)
      ),
      []
    )
    expect(getBusinessTypesCacheDecision(complete)).toEqual({ action: 'use', data: complete })
  })

  it('normalizes paginated catalog responses and category metadata', () => {
    expect(
      normalizeBusinessTypesPage({
        success: true,
        data: {
          business_types: [
            {
              id: 'consulting',
              title: 'Consulting',
              category_id: 'professional',
              category: { title: 'Professional' },
              emoji: '💼',
              popular: true,
            },
            { title: 'missing-id' },
          ],
          has_more: true,
        },
      })
    ).toMatchObject({
      businessTypes: [
        {
          id: 'consulting',
          title: 'Consulting',
          category: 'Professional',
          popular: true,
        },
      ],
      hasMore: true,
    })

    expect(normalizeBusinessTypesPage({ success: false })).toBeNull()
    expect(
      normalizeBusinessCategories([
        { id: 'professional', title: 'Professional Services' },
        null,
        { name: 'Missing id' },
      ])
    ).toEqual([{ id: 'professional', name: 'Professional Services', icon: '🏢' }])
  })

  it('builds cache payloads and deterministic fallback business types', () => {
    const businessTypes = [makeBusinessType('popular', true), makeBusinessType('quiet')]
    expect(buildBusinessTypesCacheData(businessTypes, [])).toEqual({
      businessTypes,
      categories: [],
      popularTypes: [businessTypes[0]],
    })

    expect(buildHardcodedBusinessTypes('2026-06-22T00:00:00.000Z')).toContainEqual(
      expect.objectContaining({
        id: 'services',
        title: 'Services',
        category: 'Professional',
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:00.000Z',
      })
    )
  })

  it('normalizes NACE business-type mapping payloads', () => {
    expect(
      normalizeNaceBusinessTypePayload(
        {
          business_type: {
            id: 'fintech-lending-credit',
            title: 'Fintech Lending',
            description: 'Credit platform',
            emoji: '💳',
            category_id: 'fintech',
            category: { name: 'Fintech' },
            industry_mapping: 'finance',
            industry: 'financial-services',
          },
        },
        '2026-06-22T00:00:00.000Z'
      )
    ).toMatchObject({
      id: 'fintech-lending',
      title: 'Fintech Lending',
      category: 'Fintech',
      industryMapping: 'finance',
      createdAt: '2026-06-22T00:00:00.000Z',
    })

    expect(normalizeNaceBusinessTypePayload({ business_type: { title: 'Missing id' } })).toBeNull()
  })

  it('normalizes search candidates across Titan response shapes', () => {
    expect(
      normalizeBusinessTypeSearchResults(
        {
          results: [
            { name: 'Business Advisory', confidence: '0.91', industry: 'Professional Services' },
            { title: 'SaaS', category: 'Technology' },
          ],
        },
        'fallback'
      )
    ).toEqual([
      {
        text: 'Business Advisory',
        confidence: 0.91,
        reason: 'Professional Services',
      },
      {
        text: 'SaaS',
        confidence: 0.7,
        reason: 'Technology',
      },
    ])
  })
})
