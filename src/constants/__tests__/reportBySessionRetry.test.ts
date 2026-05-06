import { describe, expect, it } from 'vitest'
import {
  API_V2_REPORTS_BY_SESSION_PATH,
  buildAxiosEffectiveRequestUrl,
  isBySessionReportUrl,
} from '../reportBySessionRetry'

describe('reportBySessionRetry', () => {
  describe('isBySessionReportUrl', () => {
    it('detects Titan v2 by-session report URLs', () => {
      expect(API_V2_REPORTS_BY_SESSION_PATH).toContain('/by-session/')
      expect(isBySessionReportUrl(`/api/v2/valuations/reports/by-session/val_abc123`)).toBe(true)
      expect(isBySessionReportUrl(`/api/v2/valuations/reports/not-by-session/uuid`)).toBe(false)
    })

    it('rejects empty / whitespace-only', () => {
      expect(isBySessionReportUrl('')).toBe(false)
      expect(isBySessionReportUrl('   ')).toBe(false)
      expect(isBySessionReportUrl('\t\n')).toBe(false)
    })

    it('strips hash fragments before matching', () => {
      expect(isBySessionReportUrl(`/api/v2/valuations/reports/by-session/val_x#fragment`)).toBe(
        true
      )
      expect(
        isBySessionReportUrl(`https://api.example.com/api/v2/valuations/reports/by-session/k#x`)
      ).toBe(true)
    })

    it('matches absolute http(s) URLs by pathname', () => {
      expect(
        isBySessionReportUrl(
          'https://titan.example.com/api/v2/valuations/reports/by-session/val_abc'
        )
      ).toBe(true)
      expect(isBySessionReportUrl('https://titan.example.com/api/v2/valuations/reports/uuid')).toBe(
        false
      )
    })

    it('falls back to substring when absolute URL parse fails', () => {
      expect(isBySessionReportUrl(`not-a-url-but-${API_V2_REPORTS_BY_SESSION_PATH}val_x`)).toBe(
        true
      )
    })

    it('matches relative paths without leading slash when segment appears', () => {
      expect(isBySessionReportUrl(`api/v2/valuations/reports/by-session/val_x`)).toBe(true)
    })
  })

  describe('buildAxiosEffectiveRequestUrl', () => {
    it('returns empty for missing config', () => {
      expect(buildAxiosEffectiveRequestUrl(undefined)).toBe('')
    })

    it('joins baseURL and relative url', () => {
      expect(
        buildAxiosEffectiveRequestUrl({
          baseURL: 'https://api.example.com',
          url: '/api/v2/valuations/reports/by-session/val_1',
        })
      ).toBe('https://api.example.com/api/v2/valuations/reports/by-session/val_1')
    })

    it('normalizes trailing slash on baseURL', () => {
      expect(
        buildAxiosEffectiveRequestUrl({
          baseURL: 'https://api.example.com/',
          url: 'api/v2/valuations/reports/by-session/val_1',
        })
      ).toBe('https://api.example.com/api/v2/valuations/reports/by-session/val_1')
    })

    it('returns absolute url unchanged when url is already absolute', () => {
      expect(
        buildAxiosEffectiveRequestUrl({
          baseURL: 'https://ignored.example.com',
          url: 'https://other.example.com/api/v2/valuations/reports/by-session/x',
        })
      ).toBe('https://other.example.com/api/v2/valuations/reports/by-session/x')
    })

    it('returns base only when url empty after trim', () => {
      expect(
        buildAxiosEffectiveRequestUrl({ baseURL: 'https://api.example.com/', url: '  ' })
      ).toBe('https://api.example.com')
    })

    it('prefers path-only when no baseURL', () => {
      expect(
        buildAxiosEffectiveRequestUrl({ url: '/api/v2/valuations/reports/by-session/k' })
      ).toBe('/api/v2/valuations/reports/by-session/k')
    })

    it('combined URL passes isBySessionReportUrl for interceptor matching', () => {
      const effective = buildAxiosEffectiveRequestUrl({
        baseURL: 'https://mercury.local',
        url: '/api/v2/valuations/reports/by-session/val_test',
      })
      expect(isBySessionReportUrl(effective)).toBe(true)
    })
  })
})
