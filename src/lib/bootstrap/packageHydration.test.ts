import { describe, expect, it } from 'vitest'
import { shouldHydrateBootstrapPackage } from './packageHydration'

describe('shouldHydrateBootstrapPackage', () => {
  it('hydrates only when an existing report is explicitly ready', () => {
    expect(
      shouldHydrateBootstrapPackage(
        { mode: 'existing', reportReady: true },
        {
          htmlReport: '<html></html>',
          pricingRange: null,
          versions: { current: 1, total: 1 },
          pdf: { url: null, status: 'none' },
        }
      )
    ).toBe(true)
  })

  it('does not hydrate partial existing reports before readiness', () => {
    expect(
      shouldHydrateBootstrapPackage(
        { mode: 'existing', reportReady: false },
        {
          htmlReport: null,
          pricingRange: { min: 1, mid: 2, max: 3, currency: 'EUR' },
          versions: { current: 1, total: 1 },
          pdf: { url: null, status: 'none' },
        }
      )
    ).toBe(false)
  })

  it('does not hydrate new reports', () => {
    expect(
      shouldHydrateBootstrapPackage(
        { mode: 'new', reportReady: true },
        {
          htmlReport: '<html></html>',
          pricingRange: null,
          versions: { current: 1, total: 1 },
          pdf: { url: null, status: 'none' },
        }
      )
    ).toBe(false)
  })
})
