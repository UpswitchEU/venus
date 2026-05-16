/**
 * Tests for the cross-company poisoning guard around the
 * `venus_new_valuation_prefill` sessionStorage entry. Mirrors the
 * "orphaned-seller bug" regression test on the server side
 * (`apps/titan-api/src/valuations/sessions/bootstrap/bootstrap.service.spec.ts`)
 * but exercises the read/write helpers directly without spinning up jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __test,
  buildIdentityFingerprint,
  clearNewValuationPrefill,
  fingerprintsMatch,
  readNewValuationPrefill,
  writeNewValuationPrefill,
} from '../newValuationPrefillStorage'

const STORAGE_KEY = __test.STORAGE_KEY

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  get length(): number {
    return this.store.size
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('window', { sessionStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildIdentityFingerprint', () => {
  it('reads snake_case form fields (KBO/VAT/company_name)', () => {
    const fp = buildIdentityFingerprint({
      company_name: 'Restaurant AB',
      kbo_number: '0123.456.789',
      vat_number: 'BE0123456789',
    })
    expect(fp).toEqual({
      kboNumber: '0123456789',
      vatNumber: 'BE0123456789',
      companyName: 'RESTAURANTAB',
    })
  })

  it('reads camelCase bootstrap CompanyInfo (companyName/kboNumber)', () => {
    const fp = buildIdentityFingerprint({
      companyName: 'Restaurant AB',
      kboNumber: '0123456789',
    })
    expect(fp).toEqual({
      kboNumber: '0123456789',
      companyName: 'RESTAURANTAB',
    })
  })

  it('reads nested companyInfo when handed the full prefill envelope', () => {
    const fp = buildIdentityFingerprint({
      companyInfo: { companyName: 'Bakkerij Van Damme', kboNumber: '0987654321' },
    })
    expect(fp).toEqual({
      kboNumber: '0987654321',
      companyName: 'BAKKERIJVANDAMME',
    })
  })

  it('returns undefined when no usable identifier is present', () => {
    expect(buildIdentityFingerprint({})).toBeUndefined()
    expect(buildIdentityFingerprint(null)).toBeUndefined()
    expect(buildIdentityFingerprint({ company_name: '   ' })).toBeUndefined()
  })

  it('strips non-digit characters from KBO and non-alphanumerics from VAT/name', () => {
    const fp = buildIdentityFingerprint({
      kbo_number: 'BE 0123-456-789',
      vat_number: 'be-0123.456.789',
      company_name: "  L'Atelier d'Été — N°1  ",
    })
    expect(fp?.kboNumber).toBe('0123456789')
    expect(fp?.vatNumber).toBe('BE0123456789')
    expect(fp?.companyName).toBe('LATELIERDTN1')
  })
})

describe('fingerprintsMatch', () => {
  it('matches by KBO number when present on both sides', () => {
    expect(fingerprintsMatch({ kboNumber: '0123456789' }, { kboNumber: '0123456789' })).toBe(true)
    expect(fingerprintsMatch({ kboNumber: '0123456789' }, { kboNumber: '9999999999' })).toBe(false)
  })

  it('does NOT fall through to company name when KBOs differ', () => {
    // Even if the company name happens to match, a KBO conflict is decisive.
    expect(
      fingerprintsMatch(
        { kboNumber: '0123456789', companyName: 'RESTAURANTAB' },
        { kboNumber: '9999999999', companyName: 'RESTAURANTAB' }
      )
    ).toBe(false)
  })

  it('falls back to VAT then company name when KBO is missing on one side', () => {
    expect(fingerprintsMatch({ vatNumber: 'BE0123456789' }, { vatNumber: 'BE0123456789' })).toBe(
      true
    )
    expect(
      fingerprintsMatch({ companyName: 'RESTAURANTAB' }, { companyName: 'RESTAURANTAB' })
    ).toBe(true)
  })

  it('returns false when either side has no fingerprint', () => {
    expect(fingerprintsMatch(undefined, { kboNumber: '0123456789' })).toBe(false)
    expect(fingerprintsMatch({ kboNumber: '0123456789' }, undefined)).toBe(false)
    expect(fingerprintsMatch(undefined, undefined)).toBe(false)
  })
})

describe('writeNewValuationPrefill', () => {
  it('persists payload with derived identity fingerprint and norm count', () => {
    const ok = writeNewValuationPrefill(
      {
        company_name: 'Restaurant AB',
        kbo_number: '0123456789',
        revenue: 850000,
        ebitda: 95000,
      },
      { normCount: 3 }
    )
    expect(ok).toBe(true)
    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed._fromNewValuation).toBe(true)
    expect(parsed._normCount).toBe(3)
    expect(parsed._identityFingerprint).toEqual({
      kboNumber: '0123456789',
      companyName: 'RESTAURANTAB',
    })
    expect(parsed.revenue).toBe(850000)
    expect(parsed.ebitda).toBe(95000)
  })

  it('refuses to write when no usable identity fingerprint can be derived', () => {
    const ok = writeNewValuationPrefill({ revenue: 100, ebitda: 10 })
    expect(ok).toBe(false)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('strips non-serializable / blob fields before writing', () => {
    writeNewValuationPrefill({
      company_name: 'Restaurant AB',
      revenue: 100,
      html_report: '<huge html>',
      valuation_result: { huge: true },
      callback: () => 1,
    })
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) as string)
    expect(parsed.html_report).toBeUndefined()
    expect(parsed.valuation_result).toBeUndefined()
    expect(parsed.callback).toBeUndefined()
  })
})

describe('readNewValuationPrefill — cross-company poisoning guard', () => {
  it('reproduces the BAKKERIJ vs RESTAURANT AB regression: mismatch ⇒ no restore', () => {
    // 1. Owner valuated BAKKERIJ first — snapshot is stored.
    writeNewValuationPrefill({
      company_name: 'Bakkerij Van Damme',
      kbo_number: '0987654321',
      city: 'Brugge',
      revenue: 350000,
      ebitda: 40000,
      number_of_employees: 4,
    })

    // 2. Owner now bootstraps a NEW valuation for RESTAURANT AB.
    const target = buildIdentityFingerprint({
      companyName: 'RESTAURANT AB',
      kboNumber: '0123456789',
    })
    const restored = readNewValuationPrefill(target)

    // 3. Storage MUST NOT bleed across companies — neither identity nor
    //    financials. The user is starting a different valuation.
    expect(restored).toBeNull()
    // And the poisoned entry is cleared so the next bootstrap is clean too.
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('discards storage when bootstrap returned no identity (target undefined)', () => {
    // Edge case: empty profile / first-time owner whose bootstrap returned
    // no companyInfo at all (e.g. anonymous landing on /reports/new with no
    // profile and no prefilledQuery). We cannot verify the stored
    // fingerprint matches the new attempt, so the safe behaviour is to
    // discard rather than risk silently restoring financials onto a
    // company we have no identity confirmation for.
    writeNewValuationPrefill({
      company_name: 'Restaurant AB',
      kbo_number: '0123456789',
      revenue: 500000,
    })

    const restored = readNewValuationPrefill(undefined)

    expect(restored).toBeNull()
    // And the entry is consumed so it cannot fire again on a future load
    // where bootstrap *does* return identity (preventing a delayed-trigger
    // poisoning vector).
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores non-identity fields when the bootstrap target matches', () => {
    writeNewValuationPrefill({
      company_name: 'Restaurant AB',
      kbo_number: '0123456789',
      city: 'Gent',
      revenue: 850000,
      ebitda: 95000,
      number_of_employees: 6,
    })

    const target = buildIdentityFingerprint({
      companyName: 'Restaurant AB',
      kboNumber: '0123456789',
    })
    const restored = readNewValuationPrefill(target)

    expect(restored).not.toBeNull()
    expect(restored?.matched).toBe(true)
    expect(restored?.legacy).toBe(false)
    // Identity fields stripped defensively even on a fingerprint match —
    // bootstrap is the single source of truth for "which company is this?".
    expect(restored?.data.company_name).toBeUndefined()
    expect(restored?.data.kbo_number).toBeUndefined()
    expect(restored?.data.city).toBeUndefined()
    // Financial inputs the user typed survive — that is the whole point of
    // the "Nieuwe schatting" prefill.
    expect(restored?.data.revenue).toBe(850000)
    expect(restored?.data.ebitda).toBe(95000)
    expect(restored?.data.number_of_employees).toBe(6)
  })

  it('handles legacy storage without a fingerprint by stripping identity only', () => {
    // Simulate an entry written before this helper landed: no
    // `_identityFingerprint` field at all. We must NOT reject it (that
    // would break in-flight "Nieuwe schatting" sessions during deploy)
    // but we also must NOT let it overwrite identity.
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        _fromNewValuation: true,
        _normCount: 2,
        company_name: 'Bakkerij Van Damme',
        kbo_number: '0987654321',
        city: 'Brugge',
        revenue: 350000,
        ebitda: 40000,
      })
    )

    const target = buildIdentityFingerprint({
      companyName: 'RESTAURANT AB',
      kboNumber: '0123456789',
    })
    const restored = readNewValuationPrefill(target)

    expect(restored).not.toBeNull()
    expect(restored?.legacy).toBe(true)
    expect(restored?.matched).toBe(false)
    expect(restored?.data.company_name).toBeUndefined()
    expect(restored?.data.kbo_number).toBeUndefined()
    expect(restored?.data.city).toBeUndefined()
    expect(restored?.data.revenue).toBe(350000)
    expect(restored?.data.ebitda).toBe(40000)
  })

  it('clears storage on every read — poisoned entries cannot keep firing', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ _fromNewValuation: true, company_name: 'X' }))
    readNewValuationPrefill(buildIdentityFingerprint({ companyName: 'Y' }))
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null on malformed JSON without throwing', () => {
    storage.setItem(STORAGE_KEY, '{not json')
    expect(() =>
      readNewValuationPrefill(buildIdentityFingerprint({ companyName: 'Y' }))
    ).not.toThrow()
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null when no storage entry exists', () => {
    const restored = readNewValuationPrefill(
      buildIdentityFingerprint({ companyName: 'Restaurant AB' })
    )
    expect(restored).toBeNull()
  })
})

describe('clearNewValuationPrefill', () => {
  it('removes the storage entry and is safe to call when nothing is stored', () => {
    storage.setItem(STORAGE_KEY, '{"_fromNewValuation":true}')
    clearNewValuationPrefill()
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    expect(() => clearNewValuationPrefill()).not.toThrow()
  })
})
