import { describe, expect, it } from 'vitest'
import {
  computeNavBookReferences,
  computeNavPrefill,
  NAV_TAX_LATENCY_DEFAULT_BE_PCT,
  NAV_TAX_LATENCY_DEFAULT_NL_PCT,
  resolveCountryTaxLatencyPct,
} from './navPrefill'

describe('resolveCountryTaxLatencyPct', () => {
  it.each([
    ['BE', NAV_TAX_LATENCY_DEFAULT_BE_PCT],
    ['be', NAV_TAX_LATENCY_DEFAULT_BE_PCT],
    [' BEL ', NAV_TAX_LATENCY_DEFAULT_BE_PCT],
    ['NL', NAV_TAX_LATENCY_DEFAULT_NL_PCT],
    ['NLD', NAV_TAX_LATENCY_DEFAULT_NL_PCT],
  ])('returns the country default for %s', (code, expected) => {
    expect(resolveCountryTaxLatencyPct(code)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    '   ',
    'FR',
    'DE',
    'US',
  ])('returns null for unsupported / blank input %p', (input) => {
    expect(resolveCountryTaxLatencyPct(input)).toBeNull()
  })
})

describe('computeNavPrefill', () => {
  it('seeds tax latency from a Belgian country code when not yet entered', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      existing: { nav_tax_latency_pct: undefined, nav_real_estate_book_value: undefined },
    })
    expect(snapshot.values.nav_tax_latency_pct).toBe(25)
    expect(snapshot.provenance.nav_tax_latency_pct).toMatchObject({
      source: 'country_default',
      captionKey: 'taxLatencyFromCountry',
      context: { country: 'BE' },
    })
  })

  it('seeds tax latency from a Dutch country code', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'NL',
      realEstateCarveOutBookValue: null,
      existing: { nav_tax_latency_pct: undefined, nav_real_estate_book_value: undefined },
    })
    expect(snapshot.values.nav_tax_latency_pct).toBe(25.8)
  })

  it('respects the user-typed tax latency rate (never overwrites)', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      existing: { nav_tax_latency_pct: 0, nav_real_estate_book_value: undefined },
    })
    expect(snapshot.values.nav_tax_latency_pct).toBeUndefined()
    expect(snapshot.provenance.nav_tax_latency_pct).toBeUndefined()
  })

  it('seeds the real-estate book value from the carve-out field', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      existing: { nav_tax_latency_pct: 25, nav_real_estate_book_value: undefined },
    })
    expect(snapshot.values.nav_real_estate_book_value).toBe(750_000)
    expect(snapshot.provenance.nav_real_estate_book_value).toMatchObject({
      source: 'real_estate_carveout',
      captionKey: 'realEstateFromCarveOut',
    })
  })

  it('skips real-estate prefill when the carve-out is zero or missing', () => {
    expect(
      computeNavPrefill({
        countryCode: 'BE',
        realEstateCarveOutBookValue: 0,
        existing: { nav_tax_latency_pct: 25, nav_real_estate_book_value: undefined },
      }).values.nav_real_estate_book_value
    ).toBeUndefined()

    expect(
      computeNavPrefill({
        countryCode: 'BE',
        realEstateCarveOutBookValue: null,
        existing: { nav_tax_latency_pct: 25, nav_real_estate_book_value: undefined },
      }).values.nav_real_estate_book_value
    ).toBeUndefined()
  })

  it('respects an explicitly-typed real-estate book value', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      existing: { nav_tax_latency_pct: 25, nav_real_estate_book_value: 500_000 },
    })
    expect(snapshot.values.nav_real_estate_book_value).toBeUndefined()
  })

  it('returns an empty snapshot when the country is unrecognised and no carve-out exists', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'FR',
      realEstateCarveOutBookValue: null,
      existing: { nav_tax_latency_pct: undefined, nav_real_estate_book_value: undefined },
    })
    expect(snapshot.values).toEqual({})
    expect(snapshot.provenance).toEqual({})
  })

  // Round-5: the helper itself ignores `existing` when called with an
  // empty stub — that's the contract used by the React effect, which
  // does its own current-vs-applied reconciliation.
  it('produces the desired snapshot regardless of form state when existing is blank', () => {
    // Even though "the user already has 30% in form state", we want the
    // helper to tell us what the *desired* prefill is for the country.
    // The reconcile happens in the caller.
    const snapshot = computeNavPrefill({
      countryCode: 'NL',
      realEstateCarveOutBookValue: 750_000,
      existing: {}, // round-5: caller passes empty existing
    })
    expect(snapshot.values.nav_tax_latency_pct).toBe(25.8)
    expect(snapshot.values.nav_real_estate_book_value).toBe(750_000)
  })

  // Round-3 fix verification: once the user types into the field the
  // snapshot must drop the prefill (no overwrite, no stale badge upstream).
  it('idempotency — second call after the value lands writes nothing more', () => {
    // 1st call: nothing exists yet → prefill applies
    const first = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      existing: { nav_tax_latency_pct: undefined, nav_real_estate_book_value: undefined },
    })
    expect(first.values.nav_tax_latency_pct).toBe(25)
    expect(first.values.nav_real_estate_book_value).toBe(750_000)

    // 2nd call: caller has applied the values and now passes them as `existing`
    // (mirrors how the React effect re-runs after onFieldChange takes effect).
    // The snapshot must be empty so the effect is a no-op.
    const second = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      existing: { nav_tax_latency_pct: 25, nav_real_estate_book_value: 750_000 },
    })
    expect(second.values).toEqual({})
    expect(second.provenance).toEqual({})
  })
})

describe('computeNavBookReferences', () => {
  it('returns book equity when both sides of the balance sheet are present', () => {
    expect(
      computeNavBookReferences({
        totalAssets: 1_000_000,
        totalLiabilities: 400_000,
      }).bookEquity
    ).toBe(600_000)
  })

  it('returns null book equity when either side is missing', () => {
    expect(
      computeNavBookReferences({ totalAssets: 1_000_000, totalLiabilities: null }).bookEquity
    ).toBeNull()
    expect(
      computeNavBookReferences({ totalAssets: null, totalLiabilities: 400_000 }).bookEquity
    ).toBeNull()
  })

  it('passes inventory + receivables references through unchanged when finite', () => {
    expect(
      computeNavBookReferences({ inventory: 120_000, accountsReceivable: 80_000 })
    ).toMatchObject({ inventory: 120_000, accountsReceivable: 80_000 })
  })

  it('coerces non-finite inputs to null', () => {
    expect(
      computeNavBookReferences({
        inventory: Number.NaN,
        accountsReceivable: Number.POSITIVE_INFINITY,
        goodwill: undefined,
      })
    ).toMatchObject({ inventory: null, accountsReceivable: null, goodwill: null })
  })
})
