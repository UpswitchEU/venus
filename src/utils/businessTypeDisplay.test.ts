import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessType } from '../services/businessTypesApi'
import { businessTypesCache } from '../services/cache/businessTypesCache'
import {
  getBusinessTypeDescription,
  getBusinessTypeIcon,
  getBusinessTypeInfo,
  getBusinessTypeTitle,
} from './businessTypeDisplay'

vi.mock('./logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const CACHE_KEY = 'upswitch_valuation_tester_business_types_cache'

function businessType(overrides: Partial<BusinessType> = {}): BusinessType {
  return {
    id: 'vertical_ai',
    title: 'Vertical AI Platform',
    description: 'AI workflow automation for regulated operators.',
    icon: '\u{1F4CA}',
    category: 'Technology',
    category_id: 'technology',
    industryMapping: 'software',
    keywords: ['ai', 'workflow'],
    popular: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('businessTypeDisplay', () => {
  beforeEach(() => {
    localStorage.clear()
    businessTypesCache.clearAll()
  })

  it('uses fallback metadata before cache data', () => {
    expect(getBusinessTypeIcon('b2b_saas')).toBe('\u{1F4BB}')
    expect(getBusinessTypeTitle('b2b_saas')).toBe('B2B SaaS')
    expect(getBusinessTypeInfo('b2b_saas')).toEqual({
      icon: '\u{1F4BB}',
      title: 'B2B SaaS',
      description: undefined,
    })
  })

  it('reads display metadata through the typed business types cache', async () => {
    await businessTypesCache.setBusinessTypes({
      businessTypes: [businessType()],
      categories: [],
      popularTypes: [],
    })

    expect(getBusinessTypeIcon('vertical_ai')).toBe('\u{1F4CA}')
    expect(getBusinessTypeTitle('vertical_ai')).toBe('Vertical AI Platform')
    expect(getBusinessTypeDescription('vertical_ai')).toBe(
      'AI workflow automation for regulated operators.'
    )
    expect(getBusinessTypeInfo('vertical_ai')).toEqual({
      icon: '\u{1F4CA}',
      title: 'Vertical AI Platform',
      description: 'AI workflow automation for regulated operators.',
    })
  })

  it('falls back safely when cached metadata is malformed', () => {
    localStorage.setItem(CACHE_KEY, '{not-json')

    expect(getBusinessTypeIcon('vertical_ai')).toBe('\u{1F3E2}')
    expect(getBusinessTypeTitle('vertical_ai')).toBe('Vertical Ai')
    expect(getBusinessTypeDescription('vertical_ai')).toBeUndefined()
  })
})
