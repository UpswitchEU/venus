import { describe, expect, it } from 'vitest'
import type { BootstrapContext, BootstrapHints, IdentityState } from '../types'
import { SessionResolver } from './SessionResolver'
import { sessionHasExistingData, sessionHasValuationResult } from './SessionResolverModel'

const REPORT_UUID = '46e05c0c-6f40-4527-82cb-4560d6eee0ad'

type TestableSessionResolver = {
  resolve(
    context: BootstrapContext,
    hints: BootstrapHints,
    identity?: IdentityState
  ): ReturnType<SessionResolver['resolve']>
}

describe('SessionResolver readiness helpers', () => {
  const resolver = new SessionResolver() as unknown as TestableSessionResolver

  it('treats html-only completed payloads as valuation output', () => {
    expect(
      sessionHasValuationResult({
        session_data: {
          _htmlReport: '<html>ready</html>',
        },
      })
    ).toBe(true)
  })

  it('treats _businessInfo-only identity as existing input data', () => {
    expect(
      sessionHasExistingData({
        session_data: {
          _businessInfo: {
            company_name: 'Nested BV',
            kbo_number: '0123456789',
          },
        },
      })
    ).toBe(true)
  })

  it('treats synthetic valuation payloads as existing data and output', () => {
    const session = {
      session_data: {
        _valuationResult: {
          equity_value_mid: 123,
        },
      },
    }

    expect(sessionHasExistingData(session)).toBe(true)
    expect(sessionHasValuationResult(session)).toBe(true)
  })

  it('treats year_data nested under _businessInfo as existing input data', () => {
    expect(
      sessionHasExistingData({
        session_data: {
          _businessInfo: {
            year_data: { '2023': { revenue: 1, ebitda: 1 } },
          },
        },
      })
    ).toBe(true)
  })

  it('does not treat input-only sessions as valuation output', () => {
    expect(
      sessionHasValuationResult({
        session_data: {
          company_name: 'UpSwitch BV',
          revenue: 1000000,
        },
      })
    ).toBe(false)
  })

  it('does not turn a missing UUID report handoff into a new draft', async () => {
    const result = await resolver.resolve(
      { url: `/nl/reports/${REPORT_UUID}`, reportId: REPORT_UUID, locale: 'nl' },
      {
        hasClientToken: false,
        hasReportId: true,
        hasPrefilledQuery: false,
        isNewReport: false,
        isEmbedded: false,
        requestedFlow: null,
        requestedMode: null,
        locale: 'nl',
      },
      { type: 'authenticated', userId: 'user-1' }
    )

    expect(result.success).toBe(false)
    expect(result.source).toBe('existing_lookup_failed')
    expect(result.data.mode).toBe('existing')
    expect(result.data.reportId).toBe(REPORT_UUID)
    expect(result.data.reportReady).toBe(false)
  })

  it('still allows a freshly minted Venus session key to bootstrap as a draft', async () => {
    const reportId = 'val_1780417472000_vfreshdraft'
    const result = await resolver.resolve(
      { url: `/nl/reports/${reportId}`, reportId, locale: 'nl' },
      {
        hasClientToken: false,
        hasReportId: true,
        hasPrefilledQuery: false,
        isNewReport: false,
        isEmbedded: false,
        requestedFlow: null,
        requestedMode: null,
        locale: 'nl',
      },
      { type: 'authenticated', userId: 'user-1' }
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('new_with_id')
    expect(result.data.mode).toBe('new')
    expect(result.data.reportId).toBe(reportId)
  })
})
