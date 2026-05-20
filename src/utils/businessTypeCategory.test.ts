import { describe, expect, it } from 'vitest'
import { businessTypeCategoryKey, formatBusinessTypeCategory } from './businessTypeCategory'

describe('businessTypeCategory', () => {
  it('formats string categories', () => {
    expect(formatBusinessTypeCategory(' Technology ')).toBe('Technology')
  })

  it('formats object categories by display precedence', () => {
    expect(formatBusinessTypeCategory({ id: 'tech', title: 'Software', name: 'Technology' })).toBe(
      'Technology'
    )
    expect(formatBusinessTypeCategory({ id: 'tech', title: 'Software' })).toBe('Software')
    expect(formatBusinessTypeCategory({ id: 'tech' })).toBe('tech')
  })

  it('uses caller fallback for missing categories', () => {
    expect(formatBusinessTypeCategory(null, 'Other')).toBe('Other')
    expect(businessTypeCategoryKey(undefined)).toBe('Other')
  })
})
