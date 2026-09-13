import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionEngine, resetSessionEngine } from './SessionEngineFactory'
import { useSessionStore } from '../../store/useSessionStore'
import type { IdentityState } from '../../lib/bootstrap/types'

const client = (relationshipId: string): IdentityState => ({
  type: 'accountant_for_client',
  userId: 'advisor-a',
  clientContext: {
    accountantUserId: 'advisor-a',
    clientUserId: null,
    relationshipId,
    permissions: { canCreateValuations: true, canViewReports: true, canEditReports: true },
  },
})
afterEach(() => {
  resetSessionEngine()
  useSessionStore.setState({ engine: null, session: null })
})

describe('session engines across authenticated users and client dossiers', () => {
  it('reuses the same engine only within the same authenticated client context', () => {
    const a = createSessionEngine(client('client-a'))
    a.hydrateSession({
      reportId: 'val_report_a',
      sessionData: { company_name: 'Client A', revenue: 1450000 },
    })
    expect(createSessionEngine(client('client-a'))).toBe(a)
    const b = createSessionEngine(client('client-b'))
    expect(b).not.toBe(a)
    expect(b.getSession()).toBeNull()
    expect(createSessionEngine(client('client-a')).getSessionData()?.revenue).toBe(1450000)
    expect(
      createSessionEngine({ type: 'authenticated', userId: 'other-user' }).getSession()
    ).toBeNull()
  })

  it('does not hydrate a new client engine with the previous client session', () => {
    useSessionStore.getState().setEngine(client('client-a'))
    useSessionStore.getState().engine!.hydrateSession({
      reportId: 'val_report_a',
      sessionData: { company_name: 'Client A', revenue: 1450000 },
    })
    useSessionStore.setState({
      session: useSessionStore.getState().engine!.getSession(),
      hasUnsavedChanges: true,
      dirtyVersion: 7,
    })
    useSessionStore.getState().setEngine(client('client-b'))
    expect(useSessionStore.getState().session).toBeNull()
    expect(useSessionStore.getState().engine!.getSession()).toBeNull()
    useSessionStore.getState().setEngine(client('client-a'))
    expect(useSessionStore.getState().session?.sessionData.revenue).toBe(1450000)
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
    expect(useSessionStore.getState().dirtyVersion).toBe(7)
  })

  it('isolates two reports for the same client without losing the first report draft', () => {
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_a')
    const first = useSessionStore.getState().engine!
    first.hydrateSession({ reportId: 'val_report_a', sessionData: { revenue: 1450000 } })
    useSessionStore.setState({
      session: first.getSession(),
      hasUnsavedChanges: true,
      dirtyVersion: 7,
    })
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_b')
    expect(useSessionStore.getState().engine).not.toBe(first)
    expect(useSessionStore.getState().session).toBeNull()
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_a')
    expect(useSessionStore.getState().engine).toBe(first)
    expect(useSessionStore.getState().session?.sessionData.revenue).toBe(1450000)
    expect(useSessionStore.getState().dirtyVersion).toBe(7)
  })

  it('retains the same engine and draft when a confirmed save promotes the report UUID', () => {
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_a')
    const engine = useSessionStore.getState().engine!
    engine.hydrateSession({ reportId: 'val_report_a', sessionData: { revenue: 1450000 } })
    const uuid = 'e6308cd8-2dbd-4283-988d-7071cfcd9403'
    engine.promoteReportIdentity!('val_report_a', uuid)
    useSessionStore.setState({
      session: engine.getSession(),
      hasUnsavedChanges: true,
      dirtyVersion: 7,
    })
    useSessionStore.getState().setEngine(client('client-a'), uuid)
    expect(useSessionStore.getState().engine).toBe(engine)
    expect(useSessionStore.getState().session?.reportId).toBe(uuid)
    expect(useSessionStore.getState().session?.sessionData.revenue).toBe(1450000)
    expect(useSessionStore.getState().dirtyVersion).toBe(7)
  })

  it.each([
    'success',
    'failure',
  ])('ignores a late %s callback from another client engine', async (outcome) => {
    useSessionStore.getState().setEngine(client('client-a'))
    const engine = useSessionStore.getState().engine!
    engine.hydrateSession({ reportId: 'val_report_a', sessionData: { revenue: 1450000 } })
    useSessionStore.setState({
      session: engine.getSession(),
      hasUnsavedChanges: true,
      dirtyVersion: 7,
    })
    let finish!: () => void
    let fail!: (error: Error) => void
    vi.spyOn(engine, 'saveSession').mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          finish = resolve
          fail = reject
        })
    )
    const saving = useSessionStore.getState().saveSession('user')
    useSessionStore.getState().setEngine(client('client-b'))
    const nextEngine = useSessionStore.getState().engine!
    nextEngine.hydrateSession({ reportId: 'val_report_b', sessionData: { revenue: 200000 } })
    useSessionStore.setState({
      session: nextEngine.getSession(),
      hasUnsavedChanges: true,
      dirtyVersion: 2,
    })
    if (outcome === 'success') finish()
    else fail(new Error('Old client save failed'))
    await saving
    expect(useSessionStore.getState().session?.reportId).toBe('val_report_b')
    expect(useSessionStore.getState().session?.sessionData.revenue).toBe(200000)
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
    expect(useSessionStore.getState().dirtyVersion).toBe(2)
    expect(useSessionStore.getState().errorMessage).toBeNull()
  })

  it('does not mark a returning report draft saved when an obsolete save completes', async () => {
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_a')
    const engine = useSessionStore.getState().engine!
    engine.hydrateSession({ reportId: 'val_report_a', sessionData: { revenue: 1450000 } })
    useSessionStore.setState({
      session: engine.getSession(),
      hasUnsavedChanges: true,
      dirtyVersion: 7,
    })
    let finish!: () => void
    vi.spyOn(engine, 'saveSession').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const saving = useSessionStore.getState().saveSession('user')
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_b')
    useSessionStore.getState().setEngine(client('client-a'), 'val_report_a')
    finish()
    await saving
    expect(useSessionStore.getState().engine).toBe(engine)
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
    expect(useSessionStore.getState().dirtyVersion).toBe(7)
  })
})
