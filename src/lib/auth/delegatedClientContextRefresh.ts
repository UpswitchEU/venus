/**
 * Re-fetch delegated client context when Venus navigates between Mercury handoffs
 * in the same document (initializeAuth only runs once per full page load).
 */
import { isAccountantTierRole } from '../../constants/accountantPlanMethods'
import { fetchWithBySession404Retry } from '../../utils/fetchWithBySession404Retry'
import { isSessionKey, isUuid, looksLikeExistingReportId } from '../../utils/identifiers'
import { isMercuryAdvisorModeParam } from '../../utils/reportMode'
import { shouldWaitForMercuryClientContextBeforeBootstrap } from '../mercury/sessionReadiness'
import {
  initClientContextPromise,
  rejectClientContext,
  resetDelegatedClientContextGate,
  resolveClientContext,
} from './clientContextGate'
import { API_URL } from './config'
import { isInitCompleted } from './initRuntime'
import {
  clearDelegatedClientContext,
  getDelegatedUrlClientId,
  isPersistedContextStaleForUrl,
} from './persistedClientContext'
import { useAuthStore } from './store'

export type DelegatedContextRefreshInput = {
  clientId?: string | null
  reportId?: string | null
  sourceApp?: string | null
  mercuryPersonaMode?: string | null
  clientToken?: string | null
  url?: string | null
}

let refreshInflight: Promise<void> | null = null
let lastSatisfiedRefreshKey: string | null = null

function buildRefreshKey(input: DelegatedContextRefreshInput): string {
  return [
    input.clientId?.trim() || getDelegatedUrlClientId() || '',
    input.reportId?.trim() || '',
    input.sourceApp?.trim() || '',
    input.mercuryPersonaMode?.trim() || '',
  ].join(':')
}

async function fetchClientContextById(clientId: string): Promise<void> {
  const { useClientContext } = await import('../../stores/clientContext')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${API_URL}/api/v2/auth/get-client-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to fetch client context (${response.status})`)
    }

    const context = await response.json()
    if (!context.accountantUser || !context.relationship) {
      throw new Error('Invalid client context structure received')
    }

    useClientContext.getState().setClientContext(context)
    resolveClientContext()
  } catch (error) {
    rejectClientContext(error instanceof Error ? error : new Error(String(error)))
    clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
    const message = error instanceof Error ? error.message : 'Failed to establish client context'
    useAuthStore.getState().setError(message)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function restoreClientContextFromReport(
  reportId: string,
  mercuryDelegatedExisting: boolean
): Promise<void> {
  const { useClientContext } = await import('../../stores/clientContext')
  const reportEndpoint = isSessionKey(reportId)
    ? `${API_URL}/api/v2/valuations/reports/by-session/${reportId}`
    : `${API_URL}/api/v2/valuations/reports/${reportId}`

  const reportResponse = await fetchWithBySession404Retry(
    reportEndpoint,
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
    { perAttemptTimeoutMs: 8000 }
  )

  if (!reportResponse.ok) {
    const message = `Report not accessible (${reportResponse.status})`
    if (mercuryDelegatedExisting) {
      rejectClientContext(new Error(message))
      clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
      useAuthStore.getState().setError(message)
    }
    throw new Error(message)
  }

  const reportData = await reportResponse.json()
  const report = reportData.data || reportData
  const accountantCustomerId = report.accountant_customer_id

  if (!accountantCustomerId) {
    const message =
      'This report is not linked to a client — delegated advisor context is unavailable'
    if (mercuryDelegatedExisting) {
      rejectClientContext(new Error(message))
      clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
      useAuthStore.getState().setError(message)
    }
    throw new Error(message)
  }

  const store = useClientContext.getState()
  if (store.relationshipId && store.relationshipId !== accountantCustomerId) {
    clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
  }

  await fetchClientContextById(accountantCustomerId)
}

export async function refreshDelegatedClientContextIfNeeded(
  input: DelegatedContextRefreshInput
): Promise<void> {
  if (input.clientToken?.trim()) return
  if (!isInitCompleted()) return

  const needsContext = shouldWaitForMercuryClientContextBeforeBootstrap({
    sourceApp: input.sourceApp,
    reportId: input.reportId,
    clientId: input.clientId,
    clientToken: input.clientToken,
    mercuryPersonaMode: input.mercuryPersonaMode,
    url: input.url,
  })
  if (!needsContext) return

  const user = useAuthStore.getState().user
  if (!user || !isAccountantTierRole(user.role)) return

  const refreshKey = buildRefreshKey(input)
  const { useClientContext } = await import('../../stores/clientContext')
  const store = useClientContext.getState()
  const urlClientId = input.clientId?.trim() || getDelegatedUrlClientId() || null

  if (
    refreshKey === lastSatisfiedRefreshKey &&
    store.contextGateResolved &&
    isDelegatedContextSatisfied(store, urlClientId)
  ) {
    return
  }

  if (refreshInflight) {
    await refreshInflight.catch(() => undefined)
    const latest = useClientContext.getState()
    if (
      refreshKey === lastSatisfiedRefreshKey &&
      latest.contextGateResolved &&
      isDelegatedContextSatisfied(latest, urlClientId)
    ) {
      return
    }
  }

  refreshInflight = (async () => {
    resetDelegatedClientContextGate()
    initClientContextPromise()

    const mercuryDelegatedExisting =
      input.sourceApp === 'mercury' &&
      isMercuryAdvisorModeParam(input.mercuryPersonaMode) &&
      !!input.reportId?.trim() &&
      looksLikeExistingReportId(input.reportId)

    try {
      if (urlClientId) {
        if (isPersistedContextStaleForUrl(store.relationshipId, urlClientId)) {
          clearDelegatedClientContext(() => useClientContext.getState().clearClientContext())
        }
        await fetchClientContextById(urlClientId)
      } else if (input.reportId && (isSessionKey(input.reportId) || isUuid(input.reportId))) {
        await restoreClientContextFromReport(input.reportId, mercuryDelegatedExisting)
      } else if (mercuryDelegatedExisting) {
        const message = 'Delegated client context was not available for this report'
        rejectClientContext(new Error(message))
        useAuthStore.getState().setError(message)
        throw new Error(message)
      } else {
        resolveClientContext()
      }

      lastSatisfiedRefreshKey = refreshKey
    } finally {
      refreshInflight = null
    }
  })()

  await refreshInflight.catch(() => undefined)
}

function isDelegatedContextSatisfied(
  store: {
    isActingAsClient: boolean
    accountant: { id: string } | null
    relationshipId: string | null
    contextGateResolved: boolean
  },
  urlClientId: string | null
): boolean {
  if (!store.isActingAsClient || !store.accountant?.id || !store.relationshipId) return false
  if (urlClientId) return store.relationshipId === urlClientId
  return true
}

/** @internal test helper */
export function resetDelegatedClientContextRefreshState(): void {
  refreshInflight = null
  lastSatisfiedRefreshKey = null
}
