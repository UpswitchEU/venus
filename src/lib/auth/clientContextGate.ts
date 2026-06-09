/**
 * BANK GRADE: Client Context Initialization Tracking
 * Uses a deferred promise to prevent API requests from firing before client
 * context is loaded.
 */
import { useClientContext } from '../../stores/clientContext'
import { getDelegatedUrlClientId, urlRequiresDelegatedClientContext } from './persistedClientContext'

let clientContextInitialized = false
let clientContextPromise: Promise<void> | null = null
let clientContextResolver: (() => void) | null = null
let clientContextRejecter: ((error: Error) => void) | null = null

function urlRequiresAsyncClientContext(): boolean {
  return urlRequiresDelegatedClientContext()
}

export function initClientContextPromise(): Promise<void> {
  if (!clientContextPromise) {
    clientContextPromise = new Promise<void>((resolve, reject) => {
      clientContextResolver = resolve
      clientContextRejecter = reject
    })
  }
  return clientContextPromise
}

function syncContextGateResolvedToStore(resolved: boolean): void {
  useClientContext.setState({ contextGateResolved: resolved })
}

/** Reset gate when Venus navigates to a different delegated handoff in-session. */
export function resetDelegatedClientContextGate(): void {
  clientContextInitialized = false
  clientContextPromise = null
  clientContextResolver = null
  clientContextRejecter = null
  useClientContext.setState({ contextGateResolved: false })
}

export function resolveClientContext(): void {
  clientContextInitialized = true
  syncContextGateResolvedToStore(true)
  if (clientContextResolver) {
    clientContextResolver()
    clientContextResolver = null
    clientContextRejecter = null
  }
}

export function rejectClientContext(error: Error): void {
  clientContextInitialized = false
  syncContextGateResolvedToStore(false)
  if (clientContextRejecter) {
    clientContextRejecter(error)
    clientContextResolver = null
    clientContextRejecter = null
  }
}

function isDelegatedGateSatisfied(): boolean {
  if (!urlRequiresAsyncClientContext()) return true
  return useClientContext.getState().contextGateResolved
}

export function isClientContextReady(): boolean {
  return clientContextInitialized && isDelegatedGateSatisfied()
}

export function waitForClientContext(): Promise<void> {
  if (clientContextInitialized && isDelegatedGateSatisfied()) {
    return Promise.resolve()
  }

  // clearClientContext can drop store.contextGateResolved without resetting this module;
  // discard a settled promise so callers wait for the next resolve/reject cycle.
  if (clientContextPromise && !isDelegatedGateSatisfied()) {
    clientContextPromise = null
    clientContextResolver = null
    clientContextRejecter = null
    clientContextInitialized = false
  }

  if (clientContextPromise) {
    return clientContextPromise
  }

  if (urlRequiresAsyncClientContext()) {
    return initClientContextPromise()
  }

  return Promise.resolve()
}

/** After bootstrap syncs authoritative relationshipId, re-open the gate when it matches the URL. */
export function resolveDelegatedContextGateIfBootstrapSynced(relationshipId: string | null): void {
  if (!urlRequiresDelegatedClientContext() || !relationshipId?.trim()) return

  const urlClientId = getDelegatedUrlClientId()
  if (urlClientId && urlClientId !== relationshipId.trim()) return

  if (!useClientContext.getState().contextGateResolved) {
    resolveClientContext()
  }
}
