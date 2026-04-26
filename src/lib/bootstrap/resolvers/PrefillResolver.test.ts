import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parsePrefilledQueryIdentifiers, PrefillResolver } from './PrefillResolver'

describe('PrefillResolver session fallback years', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the filing year when current_year_data has values but no year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const resolver = new PrefillResolver()
    const result = (resolver as any).extractSessionPrefill({
      company_name: 'Northwind BV',
      current_year_data: {
        revenue: 1_000_000,
        ebitda: 120_000,
      },
    })

    expect(result.financials?.yearData).toEqual({
      2024: { revenue: 1_000_000, ebitda: 120_000 },
    })
  })
})

describe('parsePrefilledQueryIdentifiers', () => {
  it('extracts a Belgian KBO with BE prefix and dot separators', () => {
    const result = parsePrefilledQueryIdentifiers('RESTAURANT AB BE0861.786.602 47110')
    expect(result.kboNumber).toBe('0861.786.602')
    expect(result.vatNumber).toBe('BE0861786602')
    expect(result.naceCode).toBe('47110')
    expect(result.cleanedName).toBe('RESTAURANT AB')
  })

  it('extracts a KBO without dots and without BE prefix', () => {
    const result = parsePrefilledQueryIdentifiers('Northwind BV 0861786602')
    expect(result.kboNumber).toBe('0861.786.602')
    expect(result.vatNumber).toBe('BE0861786602')
    expect(result.naceCode).toBeUndefined()
    expect(result.cleanedName).toBe('Northwind BV')
  })

  it('does not extract NACE when no KBO is present (avoids name false positives)', () => {
    // 4-digit token in a name without a KBO is more likely a year/postal code
    // than a NACE code. Skip the heuristic to avoid corrupting the search query.
    const result = parsePrefilledQueryIdentifiers('Cafe 2002')
    expect(result.kboNumber).toBeUndefined()
    expect(result.naceCode).toBeUndefined()
    expect(result.cleanedName).toBe('Cafe 2002')
  })

  it('rejects 9-digit and 11-digit numbers that are not valid KBOs', () => {
    expect(parsePrefilledQueryIdentifiers('Foo 086178660').kboNumber).toBeUndefined()
    expect(parsePrefilledQueryIdentifiers('Foo 08617866020').kboNumber).toBeUndefined()
  })

  it('returns the raw query when no identifier is present', () => {
    const result = parsePrefilledQueryIdentifiers('Le Bistro')
    expect(result.kboNumber).toBeUndefined()
    expect(result.vatNumber).toBeUndefined()
    expect(result.cleanedName).toBe('Le Bistro')
  })

  it('handles empty input safely', () => {
    const result = parsePrefilledQueryIdentifiers('')
    expect(result).toEqual({ cleanedName: '' })
  })

  it('extracts an 8-digit Dutch KVK number', () => {
    const result = parsePrefilledQueryIdentifiers('ASML Holding NV 12345678')
    expect(result.kvkNumber).toBe('12345678')
    expect(result.kboNumber).toBeUndefined()
    expect(result.cleanedName).toBe('ASML Holding NV')
  })

  it('extracts a KVK number and NACE/SBI code together', () => {
    const result = parsePrefilledQueryIdentifiers('De Hollandse Bakker 12345678 10711')
    expect(result.kvkNumber).toBe('12345678')
    expect(result.naceCode).toBe('10711')
    expect(result.cleanedName).toBe('De Hollandse Bakker')
  })

  it('does not match a 10-digit Belgian KBO as a KVK', () => {
    const result = parsePrefilledQueryIdentifiers('Foo NV 0861786602')
    expect(result.kvkNumber).toBeUndefined()
    expect(result.kboNumber).toBe('0861.786.602')
  })

  it('does not match a 7-digit or 9-digit number as KVK', () => {
    expect(parsePrefilledQueryIdentifiers('Foo 1234567').kvkNumber).toBeUndefined()
    expect(parsePrefilledQueryIdentifiers('Foo 123456789').kvkNumber).toBeUndefined()
  })

  it('handles a bare 8-digit KVK query (number-only search)', () => {
    const result = parsePrefilledQueryIdentifiers('12345678')
    expect(result.kvkNumber).toBe('12345678')
    expect(result.cleanedName).toBe('')
  })
})

describe('PrefillResolver KVK lookup routing', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes KVK numbers through registry/search with country_code=NL, never kbo/lookup', async () => {
    const resolver = new PrefillResolver()
    // Call fetchKBO with a query containing an 8-digit KVK number
    await (resolver as any).fetchKBO('ASML Holding NV 12345678', 'NL')

    const calls = fetchSpy.mock.calls.map(([url]) => String(url))
    // Must NOT call the BE-only kbo/lookup endpoint
    expect(calls.some((u) => u.includes('kbo/lookup'))).toBe(false)
    // Must call registry/search (the NL-aware endpoint)
    expect(calls.some((u) => u.includes('registry/search'))).toBe(true)
    // The search body must include country_code NL and the KVK number as query
    const searchCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('registry/search'))
    const body = JSON.parse(searchCall![1]?.body as string)
    expect(body.country_code).toBe('NL')
    expect(body.company_name).toBe('12345678')
  })

  it('still routes Belgian KBO numbers through kbo/lookup', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: null }), { status: 404 }),
    )
    const resolver = new PrefillResolver()
    await (resolver as any).fetchKBO('RESTAURANT AB BE0861.786.602', 'BE')

    const calls = fetchSpy.mock.calls.map(([url]) => String(url))
    expect(calls.some((u) => u.includes('kbo/lookup'))).toBe(true)
    expect(calls.some((u) => u.includes('registry/search') && JSON.parse(fetchSpy.mock.calls.find(([u2]) => String(u2).includes('registry/search'))?.[1]?.body as string ?? '{}')?.country_code === 'NL')).toBe(false)
  })

  it('propagates activity_code from the registry response into companyInfo and kboData', async () => {
    // KvkService always returns activity_code (5-digit SBI) alongside the
    // 4-digit nace_code. Venus must carry it through so the NACE fallback
    // uses the more specific code and the engine receives the full SBI token.
    const kvkPayload = {
      results: [
        {
          kbo_number: '12345678',
          company_name: 'ASML Holding NV',
          country_code: 'NL',
          nace_code: '6201',
          activity_code: '62011',
          activity_label: 'Ontwikkelen en produceren van software (maatwerk)',
          business_type_id: 'bt_software',
          business_type_title: 'Software & IT',
        },
      ],
    }
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(kvkPayload), { status: 200 }),
    )

    const resolver = new PrefillResolver()
    const result = await (resolver as any).fetchKBO('ASML Holding NV 12345678', 'NL')

    expect(result).not.toBeNull()
    expect(result.companyInfo.activityCode).toBe('62011')
    expect(result.companyInfo.naceCode).toBe('6201')
    expect(result.kboData.activityCode).toBe('62011')
    expect(result.kboData.naceCode).toBe('6201')
    expect(result.companyInfo.businessTypeId).toBe('bt_software')
  })
})

describe('PrefillResolver.mergeCompanyInfo precedence', () => {
  const resolver = new PrefillResolver()
  const merge = (resolver as any).mergeCompanyInfo.bind(resolver)

  it('lets KBO override the user business card for company identity (orphaned-seller bug)', () => {
    // Reproduces the production bug: a Bakkerij Van Damme owner valuing
    // RESTAURANT AB via the dashboard "Vul uw cijfers in" CTA. The URL
    // prefilledQuery is the explicit signal of which company they're
    // valuing — the signed-in user's business card must not overwrite it.
    const profile = {
      companyName: 'BAKKERIJ VAN DAMME',
      kboNumber: '0123.456.789',
      naceCode: '10710',
      city: 'Brugge',
    }
    const kbo = {
      companyName: 'RESTAURANT AB',
      kboNumber: '0861.786.602',
      vatNumber: 'BE0861786602',
      naceCode: '47110',
      city: 'Gent',
      legalForm: 'BV',
    }

    const merged = merge(undefined, profile, kbo)

    expect(merged.companyName).toBe('RESTAURANT AB')
    expect(merged.kboNumber).toBe('0861.786.602')
    expect(merged.vatNumber).toBe('BE0861786602')
    expect(merged.naceCode).toBe('47110')
    expect(merged.city).toBe('Gent')
    expect(merged.legalForm).toBe('BV')
  })

  it('falls back to profile fields not provided by KBO', () => {
    const profile = {
      companyName: 'BAKKERIJ VAN DAMME',
      industry: 'food-and-beverage',
    } as any
    const kbo = {
      companyName: 'RESTAURANT AB',
      kboNumber: '0861.786.602',
    }

    const merged = merge(undefined, profile, kbo)

    expect(merged.companyName).toBe('RESTAURANT AB')
    expect(merged.industry).toBe('food-and-beverage')
  })

  it('keeps prior session>profile precedence when no KBO is present', () => {
    const profile = { companyName: 'Profile Co', city: 'Brussels' }
    const session = { companyName: 'Session Co' }

    const merged = merge(session, profile, undefined)

    expect(merged.companyName).toBe('Session Co')
    expect(merged.city).toBe('Brussels')
  })

  it('returns undefined when all sources are absent', () => {
    expect(merge(undefined, undefined, undefined)).toBeUndefined()
  })
})
