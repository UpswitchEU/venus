import { beforeEach, describe, expect, it } from 'vitest'

import { beginNewJourney, createTraceparent, getOrCreateJourneyId } from './journeyTrace'

describe('valuation journey tracing', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('keeps one journey UUID stable until a new draft starts', () => {
    const first = getOrCreateJourneyId()
    expect(getOrCreateJourneyId()).toBe(first)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)

    const next = beginNewJourney()
    expect(next).not.toBe(first)
    expect(getOrCreateJourneyId()).toBe(next)
  })

  it('creates a fresh valid W3C traceparent for every request', () => {
    const first = createTraceparent()
    const second = createTraceparent()
    expect(first).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(second).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(second).not.toBe(first)
  })
})
