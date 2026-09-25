import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isLegalFormBusinessTypeValue,
  looksLikeNaceCode,
  naceBusinessTypeService,
} from './naceBusinessTypeService'

describe('looksLikeNaceCode', () => {
  it('accepts division and group-level NACE codes from primary mappings', () => {
    expect(looksLikeNaceCode('84')).toBe(true)
    expect(looksLikeNaceCode('82.9')).toBe(true)
    expect(looksLikeNaceCode('10.7')).toBe(true)
  })

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

  it('passes guaranteed-resolution flag when requested', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          business_type: {
            id: 'professional-services',
            title: 'Professional Services',
            category_id: 'professional',
          },
        }),
        { status: 200 }
      )
    )

    const result = await naceBusinessTypeService.getBusinessTypeForNaceCode(
      '82.99',
      undefined,
      'BE',
      { guaranteeResolution: true }
    )

    expect(fetch).toHaveBeenCalledWith(
      '/api/nace/search?naceCode=82.99&country_code=BE&guarantee_resolution=1',
      expect.objectContaining({ method: 'GET' })
    )
    expect(result?.id).toBe('professional-services')
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

  // E-05a: Titan's last-resort tiers answer "some type from the same sector" (e.g. arts &
  // crafts for a manufacturer). Applied silently, that picked the wrong peer group.
  it.each([
    ['a same-sector fallback', { resolver_path: 'section_category', confidence: 0.35 }],
    ['the generic default', { resolver_path: 'global_default', confidence: 0.2 }],
    ['a low-confidence match without a resolver path', { confidence: 0.3 }],
  ])('returns and caches null for %s', async (_label, resolution) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          business_type_id: 'arts-crafts',
          business_type: { id: 'arts-crafts', title: 'Arts & Crafts', category_id: 'creative' },
          ...resolution,
        }),
        { status: 200 }
      )
    )

    const first = await naceBusinessTypeService.getBusinessTypeForNaceCode(
      '25.11',
      undefined,
      'BE',
      { guaranteeResolution: true }
    )
    const second = await naceBusinessTypeService.getBusinessTypeForNaceCode(
      '25.11',
      undefined,
      'BE',
      { guaranteeResolution: true }
    )

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a database mapping at 0.9', { resolver_path: 'db_mapping', confidence: 0.9 }],
    ['a label keyword at 0.5', { resolver_path: 'label_keyword', confidence: 0.5 }],
    ['a response without resolver path', { confidence: 0.75 }],
    ['a response without resolver path or confidence', {}],
  ])('applies %s', async (_label, resolution) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          business_type_id: 'software',
          business_type: { id: 'software', title: 'Software', category_id: 'software' },
          ...resolution,
        }),
        { status: 200 }
      )
    )

    const result = await naceBusinessTypeService.getBusinessTypeForNaceCode(
      '62.01',
      undefined,
      'BE',
      { guaranteeResolution: true }
    )

    expect(result).toMatchObject({ id: 'software', name: 'Software', category: 'software' })
  })
})
