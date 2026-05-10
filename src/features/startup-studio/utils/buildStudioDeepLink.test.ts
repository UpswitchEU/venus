/**
 * buildStudioDeepLink — contract tests.
 *
 * Pins the URL shape the Venus studio's first-mount prefill effect
 * consumes (`apps/venus/src/features/startup-studio/components/CompanyCardStep.tsx`),
 * so any future rename / drop of a param breaks this test instead of
 * silently breaking Mercury → Venus deep-links.
 */

import { describe, expect, it } from 'vitest'
import { buildStudioDeepLink } from './buildStudioDeepLink'

describe('buildStudioDeepLink', () => {
  it('always pins selected_method=startup_valuation', () => {
    const url = buildStudioDeepLink('/en/reports/new')
    expect(url).toContain('selected_method=startup_valuation')
  })

  it('omits empty / missing params silently', () => {
    const url = buildStudioDeepLink('/en/reports/new', {})
    expect(url).toBe('/en/reports/new?selected_method=startup_valuation')
  })

  it('round-trips a fully-populated envelope', () => {
    const url = buildStudioDeepLink('/en/reports/new', {
      companyName: 'Henchman',
      stage: 'seed',
      sector: 'saas',
      country: 'BE',
      mrr: 12_000,
      raise: 750_000,
      pitch: 'AI assistant for Belgian law firms.',
    })
    expect(url).toContain('companyName=Henchman')
    expect(url).toContain('stage=seed')
    expect(url).toContain('sector=saas')
    expect(url).toContain('country=BE')
    expect(url).toContain('mrr=12000')
    expect(url).toContain('raise=750000')
    expect(url).toContain('pitch=AI+assistant+for+Belgian+law+firms.')
  })

  it('uppercases country codes and rejects non-2-letter values', () => {
    expect(buildStudioDeepLink('/x', { country: 'be' })).toContain('country=BE')
    expect(buildStudioDeepLink('/x', { country: 'belgium' })).not.toContain('country=')
    expect(buildStudioDeepLink('/x', { country: '' })).not.toContain('country=')
  })

  it('clamps companyName to 120 characters and pitch to 240', () => {
    const longName = 'a'.repeat(200)
    const longPitch = 'b'.repeat(400)
    const url = buildStudioDeepLink('/x', { companyName: longName, pitch: longPitch })
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('companyName')).toHaveLength(120)
    expect(params.get('pitch')).toHaveLength(240)
  })

  it('rejects invalid stage / sector enum values', () => {
    // @ts-expect-error — invalid stage on purpose
    const u1 = buildStudioDeepLink('/x', { stage: 'growth' })
    expect(u1).not.toContain('stage=')
    // @ts-expect-error — invalid sector on purpose
    const u2 = buildStudioDeepLink('/x', { sector: 'rocketry' })
    expect(u2).not.toContain('sector=')
  })

  it('drops non-positive / NaN numeric values', () => {
    const url = buildStudioDeepLink('/x', {
      mrr: 0,
      arr: -100,
      raise: Number.NaN,
    })
    expect(url).not.toContain('mrr=')
    expect(url).not.toContain('arr=')
    expect(url).not.toContain('raise=')
  })

  it('rounds numeric values to integers', () => {
    const url = buildStudioDeepLink('/x', { mrr: 12_345.67, raise: 750_000.4 })
    expect(url).toContain('mrr=12346')
    expect(url).toContain('raise=750000')
  })

  it('appends to an existing query string with & rather than ?', () => {
    const url = buildStudioDeepLink('/x?utm_source=email', { stage: 'seed' })
    expect(url.startsWith('/x?utm_source=email&')).toBe(true)
  })

  it('strips leading/trailing whitespace on string fields', () => {
    const url = buildStudioDeepLink('/x', {
      companyName: '   Henchman   ',
      pitch: '   AI assistant   ',
    })
    expect(url).toContain('companyName=Henchman')
    // Note: + is the URL-encoded form of space
    expect(url).toContain('pitch=AI+assistant')
  })
})
