import { describe, expect, it } from 'vitest'
import {
  mapApiBusinessTypeForEntitySearch,
  resolveBusinessTypeSearchCategory,
} from './businessTypeSearchMapping'

describe('businessTypeSearchMapping', () => {
  it('uses canonical category id when object category names are localized', () => {
    expect(
      resolveBusinessTypeSearchCategory({ id: 'technology', name: 'Technologie' }, 'other')
    ).toBe('technology')
  })

  it('normalizes API category aliases to known entity-search icon keys', () => {
    expect(resolveBusinessTypeSearchCategory('E-commerce')).toBe('ecommerce')
    expect(resolveBusinessTypeSearchCategory('Professional services')).toBe('consulting')
  })

  it('maps API business types without losing category identity', () => {
    const mapped = mapApiBusinessTypeForEntitySearch({
      id: 'software',
      title: 'Softwarebedrijf',
      category: { id: 'technology', name: 'Technologie' },
      category_id: 'technology',
      industryMapping: '62.010',
      icon: '💻',
      popular: true,
    })

    expect(mapped).toMatchObject({
      id: 'software',
      code: '62.010',
      name: 'Softwarebedrijf',
      category: 'technology',
      emoji: '💻',
      popular: true,
    })
  })
})
