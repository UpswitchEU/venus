import { describe, expect, it } from 'vitest'
import type { BusinessType } from '../../../services/businessTypesApi'
import { getHttpStatus, matchBusinessType } from './businessTypeMatching'

function businessType(
  id: string,
  title: string,
  keywords: string[] = [],
  industryMapping = 'services'
): BusinessType {
  return {
    id,
    title,
    description: title,
    icon: '',
    category: 'services',
    category_id: 'services',
    industryMapping,
    keywords,
    popular: false,
    status: 'active',
    createdAt: '',
    updatedAt: '',
  }
}

describe('matchBusinessType', () => {
  const businessTypes = [
    businessType('software', 'Software Development', ['custom software']),
    businessType('consulting', 'Business Advisory', ['consulting']),
    businessType('restaurant', 'Food Service', ['restaurant']),
    businessType('manufacturing', 'Industrial Production', ['factory', 'manufacturing']),
  ]

  it('prefers exact title matches before looser matches', () => {
    expect(matchBusinessType('Business Advisory', businessTypes)).toBe('consulting')
  })

  it('matches by keyword and title containment', () => {
    expect(matchBusinessType('custom software platform', businessTypes)).toBe('software')
    expect(matchBusinessType('Food', businessTypes)).toBe('restaurant')
  })

  it('matches common language aliases to catalog entries', () => {
    expect(matchBusinessType('small manufacturer', businessTypes)).toBe('manufacturing')
  })

  it('returns null when no catalog entry fits the query', () => {
    expect(matchBusinessType('private aviation broker', businessTypes)).toBeNull()
  })
})

describe('getHttpStatus', () => {
  it('extracts status from direct and response-shaped errors', () => {
    expect(getHttpStatus({ status: 404 })).toBe(404)
    expect(getHttpStatus({ response: { status: 503 } })).toBe(503)
  })

  it('returns undefined for unknown error shapes', () => {
    expect(getHttpStatus(new Error('boom'))).toBeUndefined()
    expect(getHttpStatus(null)).toBeUndefined()
  })
})
