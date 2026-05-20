import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isLegalFormBusinessTypeValue,
  looksLikeNaceCode,
  naceBusinessTypeService,
} from './naceBusinessTypeService'

describe('looksLikeNaceCode', () => {
  it('accepts dotted NACE codes', () => {
    expect(looksLikeNaceCode('56.101')).toBe(true)
    expect(looksLikeNaceCode('62.01')).toBe(true)
  })

  it('accepts compact numeric NACE codes used in search input', () => {
    expect(looksLikeNaceCode('56101')).toBe(true)
    expect(looksLikeNaceCode('6201')).toBe(true)
  })

  it('rejects non-NACE values', () => {
    expect(looksLikeNaceCode('mix-media')).toBe(false)
    expect(looksLikeNaceCode('abc123')).toBe(false)
  })
})

describe('isLegalFormBusinessTypeValue', () => {
  it('detects legal structure values that must not become business_type_id', () => {
    expect(isLegalFormBusinessTypeValue('company')).toBe(true)
    expect(isLegalFormBusinessTypeValue('BV')).toBe(true)
    expect(isLegalFormBusinessTypeValue('limited liability company')).toBe(true)
  })

  it('does not flag sector ids', () => {
    expect(isLegalFormBusinessTypeValue('restaurant')).toBe(false)
    expect(isLegalFormBusinessTypeValue('consulting-it')).toBe(false)
  })
})

describe('naceBusinessTypeService', () => {
  beforeEach(() => {
    naceBusinessTypeService.clearCache()
    vi.mocked(fetch).mockReset()
  })

  it('maps Titan proxy responses and normalizes UK country code to GB', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          business_type: {
            id: 'restaurant',
            title: 'Restaurant',
            description: 'Food service business',
            category_id: 'restaurant',
            emoji: '\u{1F37D}\uFE0F',
            code: '56.101',
          },
        }),
        { status: 200 }
      )
    )

    const result = await naceBusinessTypeService.getBusinessTypeForNaceCode(
      '56.101',
      undefined,
      'uk'
    )

    expect(fetch).toHaveBeenCalledWith('/api/nace/search?naceCode=56.101&country_code=GB', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: expect.any(AbortSignal),
    })
    expect(result).toMatchObject({
      id: 'restaurant',
      code: '56.101',
      name: 'Restaurant',
      category: 'food',
      description: 'Food service business',
      emoji: '\u{1F37D}\uFE0F',
    })
  })

  it('caches successful lookups by NACE and country', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          business_type: {
            id: 'software',
            title: 'Software',
            category_id: 'software',
          },
        }),
        { status: 200 }
      )
    )

    const first = await naceBusinessTypeService.getBusinessTypeForNaceCode('62.01', undefined, 'BE')
    const second = await naceBusinessTypeService.getBusinessTypeForNaceCode(
      '62.01',
      undefined,
      'BE'
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('returns and caches null for malformed Titan payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ business_type: { title: 'Missing id' } }), { status: 200 })
    )

    const first = await naceBusinessTypeService.getBusinessTypeForNaceCode('70.22')
    const second = await naceBusinessTypeService.getBusinessTypeForNaceCode('70.22')

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws on non-OK proxy responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 502 }))

    await expect(naceBusinessTypeService.getBusinessTypeForNaceCode('62.01')).rejects.toThrow(
      'BUSINESS_TYPE_FETCH_FAILED'
    )
  })
})
