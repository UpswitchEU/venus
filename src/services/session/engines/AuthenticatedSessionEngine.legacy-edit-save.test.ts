import { beforeEach, describe, expect, it } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import { normalizeSessionDates } from '../../../utils/sessionHelpers'
import {
  AuthenticatedSessionEngine,
  deferred,
  getSessionServiceMocks,
  resetAuthenticatedSessionEngineHarness,
} from './AuthenticatedSessionEngine.testHarness'

const mocks = getSessionServiceMocks()
const historical = [{ year: 2024, revenue: 11_000_000, ebitda: 2_000_000 }]
function restoredSession() {
  return normalizeSessionDates({
    reportId: 'val_imported_manual_overrides',
    currentView: 'manual',
    dataSource: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    sessionData: {
      current_year_data: { year: 2025, revenue: 12_484_755.94, ebitda: 2_399_239.12 },
      historical_years_data: [],
    },
    partialData: {},
  })
}

describe('saving edits after legacy session hydration', () => {
  beforeEach(resetAuthenticatedSessionEngineHarness)

  it('persists manual historical overrides instead of the duplicate imported snapshot', async () => {
    const initial = restoredSession()
    expect(initial.partialData.historical_years_data).toEqual([])
    mocks.loadSession.mockResolvedValue(initial)
    mocks.saveSession.mockImplementation(async (_id, payload) =>
      normalizeSessionDates({ ...initial, sessionData: payload, partialData: {} })
    )
    const engine = new AuthenticatedSessionEngine()
    await engine.loadSession(initial.reportId)
    engine.updateSession({ sessionData: { historical_years_data: historical } })
    await engine.saveSession('user')
    expect(mocks.saveSession).toHaveBeenLastCalledWith(
      initial.reportId,
      expect.objectContaining({ historical_years_data: historical })
    )
    expect(engine.getSession()?.sessionData.historical_years_data).toEqual(historical)
    // Explicit removals must also replace the old alias, not resurrect the year.
    engine.updateSession({ sessionData: { historical_years_data: [] } })
    await engine.saveSession('user')
    expect(mocks.saveSession).toHaveBeenLastCalledWith(
      initial.reportId,
      expect.objectContaining({ historical_years_data: [] })
    )
  })

  it('preserves partialData edits when a later sessionData edit changes another field', async () => {
    const engine = new AuthenticatedSessionEngine()
    engine.hydrateSession(restoredSession())
    engine.updateSession({ partialData: { historical_years_data: historical } })
    engine.updateSession({
      sessionData: { ...engine.getSession()?.sessionData, company_name: 'Imported company' },
    })
    mocks.saveSession.mockResolvedValue(null)
    await engine.saveSession('user')
    expect(mocks.saveSession).toHaveBeenLastCalledWith(
      'val_imported_manual_overrides',
      expect.objectContaining({
        company_name: 'Imported company',
        historical_years_data: historical,
      })
    )
  })

  it('retains newer edits across an older response and saves their acknowledged revision', async () => {
    const initial = restoredSession()
    const oldResponse = deferred<ValuationSession>()
    const engine = new AuthenticatedSessionEngine()
    engine.hydrateSession(initial)
    mocks.saveSession
      .mockReturnValueOnce(oldResponse.promise)
      .mockImplementation(async (_id, payload) =>
        normalizeSessionDates({ ...initial, sessionData: payload, partialData: {} })
      )
    const saving = engine.saveSession('user')
    await Promise.resolve()
    engine.updateSession({ sessionData: { historical_years_data: historical } })
    oldResponse.resolve(initial)
    await saving
    expect(mocks.saveSession).toHaveBeenLastCalledWith(
      initial.reportId,
      expect.objectContaining({ historical_years_data: historical })
    )
    expect(engine.getSession()?.sessionData.historical_years_data).toEqual(historical)
  })
})
