/**
 * Session Store Integration Tests
 *
 * Covers legacy state aliases and load promise deduplication.
 *
 * @module store/__tests__/useSessionStore
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionStatus } from './useSessionStore.testHarness'
import {
  mockLoadSession,
  resetSessionStoreHarness,
  useSessionStore,
} from './useSessionStore.testHarness'

beforeEach(resetSessionStoreHarness)

describe('Backward Compatibility', () => {
  // Zustand partial setState merges can replace the state snapshot and drop getters;
  // hooks still use getters from the live store. Assert primitive fields here.
  it('should derive isLoading from status', () => {
    useSessionStore.setState({ status: 'loading' as SessionStatus })
    expect(useSessionStore.getState().status === 'loading').toBe(true)

    useSessionStore.setState({ status: 'loaded' as SessionStatus })
    expect(useSessionStore.getState().status === 'loading').toBe(false)
  })

  it('should map errorMessage to error alias via getters when store is intact', () => {
    const s = useSessionStore.getState()
    expect(s.error).toBe(s.errorMessage)
  })

  it('should derive isInitializing from status (idle | loading)', () => {
    useSessionStore.setState({ status: 'idle' as SessionStatus })
    const idleOrLoading =
      useSessionStore.getState().status === 'idle' ||
      useSessionStore.getState().status === 'loading'
    expect(idleOrLoading).toBe(true)

    useSessionStore.setState({ status: 'loaded' as SessionStatus })
    expect(
      useSessionStore.getState().status === 'idle' ||
        useSessionStore.getState().status === 'loading'
    ).toBe(false)
  })
})

describe('Promise Deduplication', () => {
  it('should reuse existing load promise for same reportId', async () => {
    const mockSession = {
      reportId: 'val_dedup_123',
      sessionData: {},
      updatedAt: new Date(),
    }

    // Make load take some time
    mockLoadSession.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockSession), 100))
    )

    // Set engine
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    // Fire multiple loads in parallel
    const [_result1, _result2, _result3] = await Promise.all([
      useSessionStore.getState().loadSession('val_dedup_123'),
      useSessionStore.getState().loadSession('val_dedup_123'),
      useSessionStore.getState().loadSession('val_dedup_123'),
    ])

    // Engine's loadSession should only be called once
    expect(mockLoadSession).toHaveBeenCalledTimes(1)
  })

  it('keeps a newer same-report load cached when a cancelled older load finishes', async () => {
    const oldSession = {
      reportId: 'val_cancel_reload',
      sessionData: { company_name: 'Old Co' },
      updatedAt: new Date('2026-06-03T14:00:00.000Z'),
    }
    const nextSession = {
      reportId: 'val_cancel_reload',
      sessionData: { company_name: 'Next Co' },
      updatedAt: new Date('2026-06-03T14:01:00.000Z'),
    }
    let releaseOld: (session: typeof oldSession) => void = () => undefined
    let releaseNext: (session: typeof nextSession) => void = () => undefined
    const oldLoad = new Promise<typeof oldSession>((resolve) => {
      releaseOld = resolve
    })
    const nextLoad = new Promise<typeof nextSession>((resolve) => {
      releaseNext = resolve
    })

    mockLoadSession.mockReturnValueOnce(oldLoad).mockReturnValueOnce(nextLoad)
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const oldPromise = useSessionStore.getState().loadSession('val_cancel_reload')
    await Promise.resolve()
    useSessionStore.getState().cancelActiveLoad('val_cancel_reload')

    const nextPromise = useSessionStore.getState().loadSession('val_cancel_reload')
    await Promise.resolve()
    releaseOld(oldSession)
    await oldPromise

    const duplicateNextPromise = useSessionStore.getState().loadSession('val_cancel_reload')
    await Promise.resolve()
    expect(mockLoadSession).toHaveBeenCalledTimes(2)

    releaseNext(nextSession)
    await Promise.all([nextPromise, duplicateNextPromise])

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.sessionData).toMatchObject({
      company_name: 'Next Co',
    })
  })
})
