import { describe, expect, it } from 'vitest'

import {
  isLocalHostname,
  isVenusGeneratedDraftReportId,
  shouldAllowLocalDevelopmentVenusDraftReport,
} from './localDevelopmentDraftReport'

describe('localDevelopmentDraftReport', () => {
  it('recognizes localhost hostnames and host:port values', () => {
    expect(isLocalHostname('localhost')).toBe(true)
    expect(isLocalHostname('localhost:3001')).toBe(true)
    expect(isLocalHostname('127.0.0.1')).toBe(true)
    expect(isLocalHostname('127.0.0.1:3001')).toBe(true)
    expect(isLocalHostname('::1')).toBe(true)
    expect(isLocalHostname('[::1]:3001')).toBe(true)
    expect(isLocalHostname('valuation.upswitch.app')).toBe(false)
  })

  it('recognizes only Venus-generated draft report IDs', () => {
    expect(isVenusGeneratedDraftReportId('val_1780386483187_v024ec083e')).toBe(true)
    expect(isVenusGeneratedDraftReportId('val_1780386483187_m024ec083e')).toBe(false)
    expect(isVenusGeneratedDraftReportId('report-123')).toBe(false)
  })

  it('allows local draft access only for standalone Venus drafts in development', () => {
    const reportId = 'val_1780386483187_v024ec083e'

    expect(
      shouldAllowLocalDevelopmentVenusDraftReport({
        reportId,
        hostname: 'localhost:3001',
        nodeEnv: 'development',
      })
    ).toBe(true)

    expect(
      shouldAllowLocalDevelopmentVenusDraftReport({
        reportId,
        hostname: 'localhost:3001',
        sourceApp: 'mercury',
        nodeEnv: 'development',
      })
    ).toBe(false)

    expect(
      shouldAllowLocalDevelopmentVenusDraftReport({
        reportId,
        hostname: 'localhost:3001',
        clientId: 'client-1',
        nodeEnv: 'development',
      })
    ).toBe(false)

    expect(
      shouldAllowLocalDevelopmentVenusDraftReport({
        reportId,
        hostname: 'localhost:3001',
        nodeEnv: 'production',
      })
    ).toBe(false)
  })
})
