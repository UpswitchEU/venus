/**
 * landingStudioHandoff — localStorage round-trip + TTL contract.
 *
 * Pins the anonymous-landing → authenticated-Venus bridge so a
 * regression that quietly drops the founder's pre-signup wizard inputs
 * is caught at unit-test time, not when a Wintercircus founder lands
 * authenticated and sees a blank wizard.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeLandingStudioHandoff,
  hasLandingStudioHandoff,
  type LandingStudioHandoff,
  writeLandingStudioHandoff,
} from './landingStudioHandoff'

const STORAGE_KEY = 'venus_landing_studio_handoff'
const TTL_MS = 24 * 60 * 60 * 1000

const SAMPLE_STUDIO = {
  stage: 'seed',
  country_code: 'BE',
  sector: 'saas',
  sound_idea: 70,
  prototype_status: 60,
} as const
const SAMPLE_FORM_DATA = {
  company_name: 'Acme Robotics',
  country_code: 'BE',
  business_type_id: 'bt_saas_b2b',
} as const

describe('landingStudioHandoff', () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  it('writes a snapshot that consume reads back verbatim', () => {
    writeLandingStudioHandoff({ studio: SAMPLE_STUDIO, formData: SAMPLE_FORM_DATA })
    const out = consumeLandingStudioHandoff()
    expect(out).not.toBeNull()
    expect(out?.studio).toEqual(SAMPLE_STUDIO)
    expect(out?.formData).toEqual(SAMPLE_FORM_DATA)
    expect(out?.source).toBe('landing')
    expect(typeof out?.written_at_ms).toBe('number')
  })

  it('consume clears the snapshot — second call returns null', () => {
    writeLandingStudioHandoff({ studio: SAMPLE_STUDIO, formData: SAMPLE_FORM_DATA })
    expect(consumeLandingStudioHandoff()).not.toBeNull()
    expect(consumeLandingStudioHandoff()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null when no snapshot was queued', () => {
    expect(consumeLandingStudioHandoff()).toBeNull()
    expect(hasLandingStudioHandoff()).toBe(false)
  })

  it('returns null and drops the entry when the snapshot is malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not-json')
    expect(consumeLandingStudioHandoff()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null when the snapshot is missing the studio block', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ formData: SAMPLE_FORM_DATA, written_at_ms: Date.now() }),
    )
    expect(consumeLandingStudioHandoff()).toBeNull()
  })

  it('returns null when the snapshot is missing the formData block', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ studio: SAMPLE_STUDIO, written_at_ms: Date.now() }),
    )
    expect(consumeLandingStudioHandoff()).toBeNull()
  })

  it('returns null and drops the entry when older than the TTL', () => {
    const stale: LandingStudioHandoff = {
      studio: SAMPLE_STUDIO,
      formData: SAMPLE_FORM_DATA,
      // Pretend we wrote it 25 hours ago.
      written_at_ms: Date.now() - (TTL_MS + 60 * 60 * 1000),
      source: 'landing',
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stale))
    expect(consumeLandingStudioHandoff()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null when written_at_ms is non-numeric', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studio: SAMPLE_STUDIO,
        formData: SAMPLE_FORM_DATA,
        written_at_ms: 'not-a-number',
        source: 'landing',
      }),
    )
    expect(consumeLandingStudioHandoff()).toBeNull()
  })

  it('hasLandingStudioHandoff peeks without consuming', () => {
    writeLandingStudioHandoff({ studio: SAMPLE_STUDIO, formData: SAMPLE_FORM_DATA })
    expect(hasLandingStudioHandoff()).toBe(true)
    // Peeking didn't drop the entry.
    expect(hasLandingStudioHandoff()).toBe(true)
    expect(consumeLandingStudioHandoff()).not.toBeNull()
    expect(hasLandingStudioHandoff()).toBe(false)
  })

  it('hasLandingStudioHandoff returns false on stale entries', () => {
    const stale: LandingStudioHandoff = {
      studio: SAMPLE_STUDIO,
      formData: SAMPLE_FORM_DATA,
      written_at_ms: Date.now() - (TTL_MS + 1),
      source: 'landing',
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stale))
    expect(hasLandingStudioHandoff()).toBe(false)
  })

  it('rejects array-shaped studio / formData payloads', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studio: [1, 2, 3],
        formData: SAMPLE_FORM_DATA,
        written_at_ms: Date.now(),
        source: 'landing',
      }),
    )
    expect(consumeLandingStudioHandoff()).toBeNull()
  })

  it('write is silent when localStorage throws (Safari private mode)', () => {
    const setItemSpy = vi
      .spyOn(window.localStorage.__proto__ as Storage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    expect(() =>
      writeLandingStudioHandoff({ studio: SAMPLE_STUDIO, formData: SAMPLE_FORM_DATA }),
    ).not.toThrow()
    setItemSpy.mockRestore()
  })
})
