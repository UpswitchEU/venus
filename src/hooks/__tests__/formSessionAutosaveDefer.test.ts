import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  clearRestorationObserved,
  getMercuryDelegatedAutosaveDeferRemainingMs,
  getMercurySourceApp,
  MERCURY_DELEGATED_AUTOSAVE_DEFER_MS,
  observeMercuryDelegatedRestoration,
  resetRestorationObservedForTests,
  shouldDeferMercuryDelegatedFormAutosave,
} from '../formSessionAutosaveDefer'

const EXISTING_REPORT_ID = '35a422c3-028f-4d46-88e5-27ac5519826c'

describe('formSessionAutosaveDefer', () => {
  beforeEach(() => {
    resetRestorationObservedForTests()
    vi.stubGlobal('window', {
      location: { search: '' },
    })
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
    })
  })

  it('defers autosave for Mercury existing-report handoffs immediately after restoration', () => {
    const now = 1_000_000
    observeMercuryDelegatedRestoration({
      reportId: EXISTING_REPORT_ID,
      restorationComplete: true,
      sourceApp: 'mercury',
      now,
    })
    expect(
      shouldDeferMercuryDelegatedFormAutosave({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sourceApp: 'mercury',
        now,
      })
    ).toBe(true)
    expect(
      getMercuryDelegatedAutosaveDeferRemainingMs({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sourceApp: 'mercury',
        now: now + MERCURY_DELEGATED_AUTOSAVE_DEFER_MS - 1,
      })
    ).toBe(1)
  })

  it('allows autosave after the settle window elapses', () => {
    const now = 2_000_000
    observeMercuryDelegatedRestoration({
      reportId: EXISTING_REPORT_ID,
      restorationComplete: true,
      sourceApp: 'mercury',
      now,
    })
    expect(
      shouldDeferMercuryDelegatedFormAutosave({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sourceApp: 'mercury',
        now: now + MERCURY_DELEGATED_AUTOSAVE_DEFER_MS,
      })
    ).toBe(false)
  })

  it('does not defer new reports, non-uuid ids, or direct Venus opens', () => {
    expect(
      shouldDeferMercuryDelegatedFormAutosave({
        reportId: 'new',
        restorationComplete: true,
        sourceApp: 'mercury',
      })
    ).toBe(false)
    expect(
      shouldDeferMercuryDelegatedFormAutosave({
        reportId: 'report-1',
        restorationComplete: true,
        sourceApp: 'mercury',
      })
    ).toBe(false)
    expect(
      shouldDeferMercuryDelegatedFormAutosave({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sourceApp: 'direct',
      })
    ).toBe(false)
  })

  it('clears observation when navigating away from a report', () => {
    const now = 1_000_000
    observeMercuryDelegatedRestoration({
      reportId: EXISTING_REPORT_ID,
      restorationComplete: true,
      sourceApp: 'mercury',
      now,
    })
    clearRestorationObserved(EXISTING_REPORT_ID)
    observeMercuryDelegatedRestoration({
      reportId: EXISTING_REPORT_ID,
      restorationComplete: true,
      sourceApp: 'mercury',
      now: now + 500,
    })
    expect(
      getMercuryDelegatedAutosaveDeferRemainingMs({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sourceApp: 'mercury',
        now: now + 600,
      })
    ).toBe(MERCURY_DELEGATED_AUTOSAVE_DEFER_MS - 100)
  })

  it('reads mercury source from URL when sessionStorage is empty', () => {
    vi.stubGlobal('window', {
      location: { search: '?source=mercury&clientId=abc' },
    })
    expect(getMercurySourceApp()).toBe('mercury')
  })
})
