import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRestorationObserved,
  getMercuryDelegatedAutosaveDeferRemainingMs,
  getMercurySourceApp,
  getSessionAutosaveDeferRemainingMs,
  MERCURY_DELEGATED_AUTOSAVE_DEFER_MS,
  observeMercuryDelegatedRestoration,
  resetRestorationObservedForTests,
  shouldDeferMercuryDelegatedFormAutosave,
  shouldDeferSessionAutosave,
} from '../formSessionAutosaveDefer'
import {
  recordSessionPoolPressure503,
  resetSessionPoolPressureCircuitForTests,
} from '../sessionPoolPressureCircuit'

const EXISTING_REPORT_ID = '35a422c3-028f-4d46-88e5-27ac5519826c'

describe('formSessionAutosaveDefer', () => {
  beforeEach(() => {
    resetRestorationObservedForTests()
    resetSessionPoolPressureCircuitForTests()
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

  it('defers autosave while session is still loading', () => {
    expect(
      shouldDeferSessionAutosave({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sessionStatus: 'loading',
      })
    ).toBe(true)
    expect(
      getSessionAutosaveDeferRemainingMs({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sessionStatus: 'loading',
      })
    ).toBe(Number.POSITIVE_INFINITY)
  })

  it('defers autosave while pool-pressure circuit is open', () => {
    const now = 3_000_000
    recordSessionPoolPressure503(now)
    expect(
      shouldDeferSessionAutosave({
        reportId: EXISTING_REPORT_ID,
        restorationComplete: true,
        sessionStatus: 'loaded',
        now: now + 100,
      })
    ).toBe(true)
  })
})
