import { describe, expect, it } from 'vitest'
import {
  computeNavBookReferences,
  computeNavPrefill,
  DEAL_BUYER_DISCOUNT_DEFAULT_PCT,
  DEAL_REGISTRATION_DUTY_BE_PCT,
  DEAL_REGISTRATION_DUTY_NL_PCT,
  NAV_EQUIPMENT_DEFAULT_AGE_YEARS,
  NAV_EQUIPMENT_DEFAULT_USEFUL_LIFE_YEARS,
  NAV_TAX_LATENCY_DEFAULT_BE_PCT,
  NAV_TAX_LATENCY_DEFAULT_NL_PCT,
  resolveCountryRegistrationDutyPct,
  resolveCountryTaxLatencyPct,
} from './navPrefill'

const emptyExisting = {
  nav_tax_latency_pct: undefined,
  nav_real_estate_book_value: undefined,
  nav_equipment_acquisition_year: undefined,
  nav_equipment_useful_life_years: undefined,
  deal_buyer_discount_rate_pct: undefined,
  deal_registration_duty_pct: undefined,
}

const appliedExisting = {
  nav_equipment_acquisition_year: 9999, // any finite value blocks the seed
  nav_equipment_useful_life_years: NAV_EQUIPMENT_DEFAULT_USEFUL_LIFE_YEARS,
  deal_buyer_discount_rate_pct: DEAL_BUYER_DISCOUNT_DEFAULT_PCT,
}

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
      existing: emptyExisting,
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
      existing: emptyExisting,
    })
    expect(snapshot.values.nav_tax_latency_pct).toBe(25.8)
  })

  it('respects the user-typed tax latency rate (never overwrites)', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      existing: { ...emptyExisting, nav_tax_latency_pct: 0 },
    })
    expect(snapshot.values.nav_tax_latency_pct).toBeUndefined()
    expect(snapshot.provenance.nav_tax_latency_pct).toBeUndefined()
  })

  it('seeds the real-estate book value from the carve-out field', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      existing: { ...emptyExisting, nav_tax_latency_pct: 25 },
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
        existing: { ...emptyExisting, nav_tax_latency_pct: 25 },
      }).values.nav_real_estate_book_value
    ).toBeUndefined()

    expect(
      computeNavPrefill({
        countryCode: 'BE',
        realEstateCarveOutBookValue: null,
        existing: { ...emptyExisting, nav_tax_latency_pct: 25 },
      }).values.nav_real_estate_book_value
    ).toBeUndefined()
  })

  it('respects an explicitly-typed real-estate book value', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      existing: {
        ...emptyExisting,
        nav_tax_latency_pct: 25,
        nav_real_estate_book_value: 500_000,
      },
    })
    expect(snapshot.values.nav_real_estate_book_value).toBeUndefined()
  })

  it('seeds equipment + deal defaults even when the country is unrecognised', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'FR',
      realEstateCarveOutBookValue: null,
      reportingYear: 2024,
      existing: emptyExisting,
    })
    // Tax latency + registration duty are country-gated — none here.
    expect(snapshot.values.nav_tax_latency_pct).toBeUndefined()
    expect(snapshot.values.deal_registration_duty_pct).toBeUndefined()
    // Equipment + buyer-discount defaults are sector-typical, country-free.
    expect(snapshot.values.nav_equipment_acquisition_year).toBe(
      2024 - NAV_EQUIPMENT_DEFAULT_AGE_YEARS
    )
    expect(snapshot.values.nav_equipment_useful_life_years).toBe(
      NAV_EQUIPMENT_DEFAULT_USEFUL_LIFE_YEARS
    )
    expect(snapshot.values.deal_buyer_discount_rate_pct).toBe(DEAL_BUYER_DISCOUNT_DEFAULT_PCT)
  })

  it('seeds equipment acquisition year off the latest reporting year', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      reportingYear: 2023,
      existing: emptyExisting,
    })
    expect(snapshot.values.nav_equipment_acquisition_year).toBe(
      2023 - NAV_EQUIPMENT_DEFAULT_AGE_YEARS
    )
    expect(snapshot.provenance.nav_equipment_acquisition_year).toMatchObject({
      source: 'sector_default',
    })
  })

  it('falls back to current year when reportingYear is missing', () => {
    const now = new Date().getFullYear()
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      existing: emptyExisting,
    })
    expect(snapshot.values.nav_equipment_acquisition_year).toBe(
      now - NAV_EQUIPMENT_DEFAULT_AGE_YEARS
    )
  })

  it('seeds BE registration duty at 12.5% movable-assets rate', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      existing: emptyExisting,
    })
    expect(snapshot.values.deal_registration_duty_pct).toBe(DEAL_REGISTRATION_DUTY_BE_PCT)
    expect(snapshot.provenance.deal_registration_duty_pct).toMatchObject({
      source: 'country_default',
      captionKey: 'dealRegistrationDutyFromCountry',
      context: { country: 'BE' },
    })
  })

  it('seeds NL registration duty at 0% (movable assets are exempt)', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'NL',
      realEstateCarveOutBookValue: null,
      existing: emptyExisting,
    })
    expect(snapshot.values.deal_registration_duty_pct).toBe(DEAL_REGISTRATION_DUTY_NL_PCT)
  })

  it('respects user-typed equipment year and useful life (never overwrites)', () => {
    const snapshot = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: null,
      reportingYear: 2024,
      existing: { ...emptyExisting, ...appliedExisting },
    })
    expect(snapshot.values.nav_equipment_acquisition_year).toBeUndefined()
    expect(snapshot.values.nav_equipment_useful_life_years).toBeUndefined()
    expect(snapshot.values.deal_buyer_discount_rate_pct).toBeUndefined()
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
      reportingYear: 2024,
      existing: {}, // round-5: caller passes empty existing
    })
    expect(snapshot.values.nav_tax_latency_pct).toBe(25.8)
    expect(snapshot.values.nav_real_estate_book_value).toBe(750_000)
    expect(snapshot.values.nav_equipment_acquisition_year).toBe(2018)
    expect(snapshot.values.deal_buyer_discount_rate_pct).toBe(DEAL_BUYER_DISCOUNT_DEFAULT_PCT)
    expect(snapshot.values.deal_registration_duty_pct).toBe(DEAL_REGISTRATION_DUTY_NL_PCT)
  })

  // Round-3 fix verification: once the user types into the field the
  // snapshot must drop the prefill (no overwrite, no stale badge upstream).
  it('idempotency — second call after every value lands writes nothing more', () => {
    // 1st call: nothing exists yet → prefill applies
    const first = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      reportingYear: 2024,
      existing: emptyExisting,
    })
    expect(first.values.nav_tax_latency_pct).toBe(25)
    expect(first.values.nav_real_estate_book_value).toBe(750_000)
    expect(first.values.nav_equipment_useful_life_years).toBe(
      NAV_EQUIPMENT_DEFAULT_USEFUL_LIFE_YEARS
    )

    // 2nd call: caller has applied every value back into `existing` (mirrors
    // how the React effect re-runs after onFieldChange takes effect).
    // The snapshot must be empty so the effect is a no-op.
    const second = computeNavPrefill({
      countryCode: 'BE',
      realEstateCarveOutBookValue: 750_000,
      reportingYear: 2024,
      existing: {
        nav_tax_latency_pct: 25,
        nav_real_estate_book_value: 750_000,
        nav_equipment_acquisition_year: 2018,
        nav_equipment_useful_life_years: NAV_EQUIPMENT_DEFAULT_USEFUL_LIFE_YEARS,
        deal_buyer_discount_rate_pct: DEAL_BUYER_DISCOUNT_DEFAULT_PCT,
        deal_registration_duty_pct: DEAL_REGISTRATION_DUTY_BE_PCT,
      },
    })
    expect(second.values).toEqual({})
    expect(second.provenance).toEqual({})
  })
})

describe('resolveCountryRegistrationDutyPct', () => {
  it.each([
    ['BE', DEAL_REGISTRATION_DUTY_BE_PCT],
    [' be ', DEAL_REGISTRATION_DUTY_BE_PCT],
    ['NL', DEAL_REGISTRATION_DUTY_NL_PCT],
    ['NLD', DEAL_REGISTRATION_DUTY_NL_PCT],
  ])('returns the country default for %s', (code, expected) => {
    expect(resolveCountryRegistrationDutyPct(code)).toBe(expected)
  })

  it.each([null, undefined, '', 'FR', 'DE', 'US'])(
    'returns null for unsupported / blank input %p',
    (input) => {
      expect(resolveCountryRegistrationDutyPct(input)).toBeNull()
    }
  )
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
