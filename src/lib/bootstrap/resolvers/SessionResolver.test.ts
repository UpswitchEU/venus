import { describe, expect, it } from 'vitest'
import { SessionResolver } from './SessionResolver'

describe('SessionResolver readiness helpers', () => {
  const resolver = new SessionResolver() as any

  it('treats html-only completed payloads as valuation output', () => {
    expect(
      resolver.hasValuationResult({
        session_data: {
          _htmlReport: '<html>ready</html>',
        },
      })
    ).toBe(true)
  })

  it('treats _businessInfo-only identity as existing input data', () => {
    expect(
      resolver.hasExistingData({
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

    expect(resolver.hasExistingData(session)).toBe(true)
    expect(resolver.hasValuationResult(session)).toBe(true)
  })

  it('treats year_data nested under _businessInfo as existing input data', () => {
    expect(
      resolver.hasExistingData({
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
      resolver.hasValuationResult({
        session_data: {
          company_name: 'UpSwitch BV',
          revenue: 1000000,
        },
      })
    ).toBe(false)
  })
})
