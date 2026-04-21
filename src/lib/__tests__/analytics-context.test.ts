import { describe, expect, it } from 'vitest'

import {
  classifyTrafficType,
  detectLocaleFromPath,
  getAnalyticsContext,
} from '../analytics-context'

describe('Venus analytics-context', () => {
  describe('detectLocaleFromPath', () => {
    it.each([
      ['/nl', 'nl'],
      ['/nl/', 'nl'],
      ['/nl/calculator', 'nl'],
      ['/NL/calculator', 'nl'],
      ['/en', 'en'],
      ['/en/methods', 'en'],
      ['/', 'unknown'],
      ['/methods', 'unknown'],
      ['', 'unknown'],
      [null, 'unknown'],
      [undefined, 'unknown'],
      ['/nederland/something', 'unknown'],
    ])('detectLocaleFromPath(%s) → %s', (path, expected) => {
      expect(detectLocaleFromPath(path as string | null | undefined)).toBe(expected)
    })
  })

  describe('classifyTrafficType', () => {
    it('always returns "app" — Venus has no public marketing surfaces', () => {
      expect(classifyTrafficType('/nl/calculator')).toBe('app')
      expect(classifyTrafficType('/en/reports/123')).toBe('app')
      expect(classifyTrafficType('/')).toBe('app')
      expect(classifyTrafficType(null)).toBe('app')
    })
  })

  describe('getAnalyticsContext', () => {
    it('returns the combined context using the supplied pathname', () => {
      expect(getAnalyticsContext('/nl/calculator')).toEqual({
        traffic_type: 'app',
        locale: 'nl',
      })
      expect(getAnalyticsContext('/en')).toEqual({
        traffic_type: 'app',
        locale: 'en',
      })
      expect(getAnalyticsContext('/')).toEqual({
        traffic_type: 'app',
        locale: 'unknown',
      })
    })
  })
})
