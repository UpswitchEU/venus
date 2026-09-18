import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../lib/auth/store'
import { useClientContext } from '../../stores/clientContext'
import { mergePersistedVersionHistory, useVersionHistoryStore } from '../useVersionHistoryStore'

const version = {
  id: 'v1',
  reportId: 'report-a',
  versionNumber: 1,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  formData: {},
} as any
const scopeFor = (userId: string | null) => JSON.stringify([userId, null, null])
const snapshot = (userId: string | null) => ({
  scope: scopeFor(userId),
  versions: { 'report-a': [version] },
  activeVersions: { 'report-a': 1 },
})

describe('version history persistence is scoped to the signed-in user', () => {
  beforeEach(() => {
    useClientContext.setState({ isActingAsClient: false, accountant: null, relationshipId: null })
    useAuthStore.setState({ user: null } as never)
    useVersionHistoryStore.setState({ versions: {}, activeVersions: {}, syncStatus: {} })
  })

  it('never hydrates a snapshot written by another signed-in user', () => {
    useAuthStore.setState({ user: { id: 'user-b' } } as never)
    const merged = mergePersistedVersionHistory(
      snapshot('user-a'),
      useVersionHistoryStore.getState()
    )
    expect(merged.versions).toEqual({})
    expect(merged.activeVersions).toEqual({})
  })

  it('hydrates the same user\u2019s snapshot and a snapshot written before sign-in', () => {
    useAuthStore.setState({ user: { id: 'user-a' } } as never)
    expect(
      mergePersistedVersionHistory(snapshot('user-a'), useVersionHistoryStore.getState()).versions
    ).toEqual({ 'report-a': [version] })
    expect(
      mergePersistedVersionHistory(snapshot(null), useVersionHistoryStore.getState()).versions
    ).toEqual({ 'report-a': [version] })
  })

  it('keeps a snapshot on a cold start where the auth store has not resolved yet', () => {
    expect(
      mergePersistedVersionHistory(snapshot('user-a'), useVersionHistoryStore.getState()).versions
    ).toEqual({ 'report-a': [version] })
  })

  it('does not leak the scope marker into the store state', () => {
    const merged = mergePersistedVersionHistory(snapshot(null), useVersionHistoryStore.getState())
    expect(merged).not.toHaveProperty('scope')
  })

  it('drops the in-memory history when a different user signs in on the same tab', () => {
    useAuthStore.setState({ user: { id: 'user-a' } } as never)
    useVersionHistoryStore.setState({
      versions: { 'report-a': [version] },
      activeVersions: { 'report-a': 1 },
    })
    useAuthStore.setState({ user: { id: 'user-b' } } as never)
    expect(useVersionHistoryStore.getState().versions).toEqual({})
    expect(useVersionHistoryStore.getState().activeVersions).toEqual({})
  })

  it('keeps the history across the cold-start sign-in (no user -> user)', () => {
    useVersionHistoryStore.setState({
      versions: { 'report-a': [version] },
      activeVersions: { 'report-a': 1 },
    })
    useAuthStore.setState({ user: { id: 'user-a' } } as never)
    expect(useVersionHistoryStore.getState().versions).toEqual({ 'report-a': [version] })
  })

  it('drops the history on sign-out', () => {
    useAuthStore.setState({ user: { id: 'user-a' } } as never)
    useVersionHistoryStore.setState({ versions: { 'report-a': [version] } })
    useAuthStore.setState({ user: null } as never)
    expect(useVersionHistoryStore.getState().versions).toEqual({})
  })
})
