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
