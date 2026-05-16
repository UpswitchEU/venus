/**
 * Tests for Venus drawer's response-shape adapters.
 *
 * Mirrors `apps/mercury/tests/unit/ai-dock-tool-card-parser.test.ts` for
 * the sellability + extractErrorMessage adapters, with two Venus-specific
 * additions:
 *   - Optional `confidence` field is surfaced when the BFF includes it
 *     (Venus drawer shows it in the toast; Mercury dock doesn't render it).
 *   - `extractErrorMessage` reads `error` FIRST then `message` (Venus
 *     /api/sellability/score proxy emits `{ success: false, error }` on
 *     non-OK responses, opposite of Mercury's order).
 *
 * If either of these divergences is reverted to Mercury parity, this
 * test file will flag the change explicitly.
 */

import { describe, expect, it } from 'vitest'
import { extractErrorMessage, parseSellabilityScoreResponse } from '../tool-card-response-parsers'

describe('parseSellabilityScoreResponse', () => {
  it('returns null when input is null / non-object', () => {
    expect(parseSellabilityScoreResponse(null)).toBeNull()
    expect(parseSellabilityScoreResponse(undefined)).toBeNull()
    expect(parseSellabilityScoreResponse('string')).toBeNull()
    expect(parseSellabilityScoreResponse(42)).toBeNull()
  })

  it('parses top-level shape: { score, band }', () => {
    expect(parseSellabilityScoreResponse({ score: 67, band: 'sale_ready_in_most_ways' })).toEqual({
      score: 67,
      band: 'sale_ready_in_most_ways',
    })
  })

  it('parses BFF-wrapped shape: { success, data: { score, band } }', () => {
    expect(
      parseSellabilityScoreResponse({
        success: true,
        data: { score: 50, band: 'foundations_in_place' },
      })
    ).toEqual({ score: 50, band: 'foundations_in_place' })
  })

  it('surfaces optional confidence at top level when present', () => {
    expect(
      parseSellabilityScoreResponse({
        score: 67,
        band: 'high',
        confidence: 'high',
      })
    ).toEqual({ score: 67, band: 'high', confidence: 'high' })
  })

  it('surfaces optional confidence under data.* when present', () => {
    expect(
      parseSellabilityScoreResponse({
        data: { score: 50, band: 'mid', confidence: 'med' },
      })
    ).toEqual({ score: 50, band: 'mid', confidence: 'med' })
  })

  it('omits confidence key entirely when absent (no "undefined" leakage)', () => {
    const result = parseSellabilityScoreResponse({ score: 67, band: 'high' })
    expect(result).toEqual({ score: 67, band: 'high' })
    expect(result).not.toHaveProperty('confidence')
  })

  it('drops non-string confidence field gracefully', () => {
    const result = parseSellabilityScoreResponse({
      score: 67,
      band: 'high',
      confidence: 42, // wrong type
    })
    expect(result).toEqual({ score: 67, band: 'high' })
    expect(result).not.toHaveProperty('confidence')
  })

  it('prefers top-level over data.* when both are present', () => {
    expect(
      parseSellabilityScoreResponse({
        score: 70,
        band: 'sale_ready_today',
        data: { score: 50, band: 'foundations_in_place' },
      })
    ).toEqual({ score: 70, band: 'sale_ready_today' })
  })

  it('rejects coerced string scores (no implicit number conversion)', () => {
    // Same defensive policy as Mercury — stringified numbers indicate a
    // typing bug upstream and would break formatting downstream.
    expect(parseSellabilityScoreResponse({ score: '67', band: 'high' })).toBeNull()
    expect(parseSellabilityScoreResponse({ data: { score: '50', band: 'mid' } })).toBeNull()
  })

  it('rejects half-shapes (only score, only band)', () => {
    expect(parseSellabilityScoreResponse({ score: 67 })).toBeNull()
    expect(parseSellabilityScoreResponse({ band: 'high' })).toBeNull()
    expect(parseSellabilityScoreResponse({ data: { score: 67 } })).toBeNull()
    expect(parseSellabilityScoreResponse({ data: { band: 'high' } })).toBeNull()
  })

  it('accepts score=0 (valid PLG-low-end value, not falsy)', () => {
    expect(parseSellabilityScoreResponse({ score: 0, band: 'significant_work_to_do' })).toEqual({
      score: 0,
      band: 'significant_work_to_do',
    })
  })
})

describe('extractErrorMessage', () => {
  it('prefers `error` over `message` (Venus convention — opposite of Mercury)', () => {
    // Venus's /api/sellability/score proxy emits `{success:false, error:'...'}`
    // on non-OK, while Mercury BFFs emit `{message:'...'}`. Both should yield
    // a useful toast for the user, so each app reads its preferred key first.
    expect(
      extractErrorMessage(
        { error: 'Sellability service unavailable', message: 'should NOT be used' },
        503
      )
    ).toBe('Sellability service unavailable')
  })

  it('falls back to `message` when `error` is absent', () => {
    expect(extractErrorMessage({ message: 'Owner profile incomplete' }, 422)).toBe(
      'Owner profile incomplete'
    )
  })

  it('falls back to "HTTP <status>" when neither field is usable', () => {
    expect(extractErrorMessage({}, 500)).toBe('HTTP 500')
    expect(extractErrorMessage({ code: 'internal' }, 503)).toBe('HTTP 503')
  })

  it('falls back to "HTTP <status>" on null / non-object input', () => {
    expect(extractErrorMessage(null, 500)).toBe('HTTP 500')
    expect(extractErrorMessage(undefined, 502)).toBe('HTTP 502')
    expect(extractErrorMessage('not an object', 503)).toBe('HTTP 503')
  })

  it('falls back when fields are empty strings (no blank toast)', () => {
    expect(extractErrorMessage({ error: '' }, 500)).toBe('HTTP 500')
    expect(extractErrorMessage({ error: '', message: '' }, 502)).toBe('HTTP 502')
  })

  it('falls back when fields are non-strings (defensive against any-typed payloads)', () => {
    expect(extractErrorMessage({ error: 42 }, 500)).toBe('HTTP 500')
    expect(extractErrorMessage({ message: { nested: 'thing' } }, 502)).toBe('HTTP 502')
  })
})
