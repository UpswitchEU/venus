/**
 * BANK GRADE: Client Context Initialization Tracking
 * Uses a deferred promise to prevent API requests from firing before client
 * context is loaded.
 */
import { looksLikeExistingReportId } from '../../utils/identifiers'
import { isMercuryAdvisorModeParam } from '../../utils/reportMode'

let clientContextInitialized = false
let clientContextPromise: Promise<void> | null = null
let clientContextResolver: (() => void) | null = null
let clientContextRejecter: ((error: Error) => void) | null = null

function urlRequiresAsyncClientContext(): boolean {
  if (typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  if (params.get('clientToken')?.trim() || params.get('clientId')?.trim()) {
    return true
  }

  // Mercury advisor opens existing reports with `mode=accountant` but may omit
  // `clientId` in the URL; initializeAuth restores context via the report row.
  if (params.get('source') === 'mercury' && isMercuryAdvisorModeParam(params.get('mode'))) {
    const reportIdMatch = window.location.pathname.match(/\/reports\/([^/]+)/)
    const reportId = reportIdMatch?.[1]
    if (reportId && looksLikeExistingReportId(reportId)) {
      return true
    }
  }

  return false
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

export function resolveClientContext(): void {
  clientContextInitialized = true
  if (clientContextResolver) {
    clientContextResolver()
    clientContextResolver = null
    clientContextRejecter = null
  }
}

export function rejectClientContext(error: Error): void {
  clientContextInitialized = false
  if (clientContextRejecter) {
    clientContextRejecter(error)
    clientContextResolver = null
    clientContextRejecter = null
  }
}

export function isClientContextReady(): boolean {
  return clientContextInitialized
}

export function waitForClientContext(): Promise<void> {
  if (clientContextInitialized) {
    return Promise.resolve()
  }

  if (clientContextPromise) {
    return clientContextPromise
  }

  if (urlRequiresAsyncClientContext()) {
    return initClientContextPromise()
  }

  return Promise.resolve()
}
