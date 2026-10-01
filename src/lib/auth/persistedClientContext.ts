/**
 * Persisted client-context helpers (localStorage + Zustand persist).
 *
 * Mercury handoffs carry `?clientId=` (accountant_customers.id). Stale
 * `relationshipId` in localStorage must never satisfy auth/bootstrap gates.
 */
import { looksLikeExistingReportId } from '../../utils/identifiers'
import { isMercuryAdvisorModeParam } from '../../utils/reportMode'

export type PersistedClientContextSlice = {
  isActingAsClient: boolean
  accountant: unknown
  client: unknown
  relationshipId: string | null
  relationshipCustomerName: string | null
  lastValidatedAt: number | null
}

const CLIENT_CONTEXT_STORAGE_KEY = 'client-context'
const CLIENT_CONTEXT_VERSION_KEY = 'client-context-version'

export function getDelegatedUrlClientId(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('clientId')?.trim() || null
}

/** True when initializeAuth must exchange or restore delegated context for this URL. */
export function urlRequiresDelegatedClientContext(): boolean {
  if (typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  if (params.get('clientToken')?.trim() || params.get('clientId')?.trim()) {
    return true
  }

  if (params.get('source') === 'mercury' && isMercuryAdvisorModeParam(params.get('mode'))) {
    const reportIdMatch = window.location.pathname.match(/\/reports\/([^/]+)/)
    const reportId = reportIdMatch?.[1]
    if (reportId && looksLikeExistingReportId(reportId)) {
      return true
    }
  }

  return false
}

export function isPersistedContextStaleForUrl(
  relationshipId: string | null | undefined,
  urlClientId: string | null = getDelegatedUrlClientId()
): boolean {
  const expectedClientId = urlClientId?.trim() || ''
  const storedRelationshipId = relationshipId?.trim() || ''
  if (!expectedClientId || !storedRelationshipId) return false
  return storedRelationshipId !== expectedClientId
}

export function clearPersistedClientContextStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CLIENT_CONTEXT_STORAGE_KEY)
      localStorage.removeItem(CLIENT_CONTEXT_VERSION_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function discardStalePersistedClientContextOnRehydrate(
  state: PersistedClientContextSlice | undefined
): void {
  if (!state) return
  if (
    !isPersistedContextStaleForUrl(state.relationshipId) &&
    (!state.isActingAsClient || isClientContextTimestampFresh(state.lastValidatedAt))
  )
    return

  state.isActingAsClient = false
  state.accountant = null
  state.client = null
  state.relationshipId = null
  state.relationshipCustomerName = null
  state.lastValidatedAt = null
  clearPersistedClientContextStorage()
}

/**
 * Full delegated-context teardown: store slice, localStorage, in-memory gate, and
 * in-session refresh dedupe. Required whenever Venus leaves a Mercury handoff.
 */
export function clearDelegatedClientContext(clearStore: () => void): void {
  clearStore()
  clearPersistedClientContextStorage()
  void import('./clientContextGate')
    .then((m) => {
      m.resetDelegatedClientContextGate()
    })
    .catch(() => undefined)
  void import('./delegatedClientContextRefresh')
    .then((m) => {
      m.resetDelegatedClientContextRefreshState()
    })
    .catch(() => undefined)
}

const CONTEXT_TTL_MS = 24 * 60 * 60 * 1000
export function isClientContextTimestampFresh(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value <= Date.now() &&
    Date.now() - value < CONTEXT_TTL_MS
  )
}

/** Only explicitly typed display/navigation data may enter the store from disk. */
export function validatedPersistedClientContext(value: unknown) {
  const record = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v)
  const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 1_000
  const person = (v: unknown) => {
    if (!record(v) || !text(v.id) || !v.id || !text(v.email) || !text(v.fullName)) return null
    return { id: v.id, email: v.email, fullName: v.fullName }
  }
  if (
    !record(value) ||
    value.isActingAsClient !== true ||
    !isClientContextTimestampFresh(value.lastValidatedAt) ||
    !text(value.relationshipId) ||
    !value.relationshipId ||
    isPersistedContextStaleForUrl(value.relationshipId)
  ) {
    clearPersistedClientContextStorage()
    return {}
  }
  const accountant = person(value.accountant)
  const client = value.client === null ? null : person(value.client)
  if (!accountant || (value.client !== null && !client)) {
    clearPersistedClientContextStorage()
    return {}
  }
  return {
    isActingAsClient: true,
    accountant,
    client: client ? { ...client, avatarUrl: null } : null,
    relationshipId: value.relationshipId,
    relationshipCustomerName: text(value.relationshipCustomerName)
      ? value.relationshipCustomerName
      : null,
    lastValidatedAt: value.lastValidatedAt,
  }
}
