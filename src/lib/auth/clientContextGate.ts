/**
 * BANK GRADE: Client Context Initialization Tracking
 * Uses a deferred promise to prevent API requests from firing before client
 * context is loaded.
 */
let clientContextInitialized = false
let clientContextPromise: Promise<void> | null = null
let clientContextResolver: (() => void) | null = null
let clientContextRejecter: ((error: Error) => void) | null = null

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

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('clientToken')) {
      return initClientContextPromise()
    }
  }

  return Promise.resolve()
}
