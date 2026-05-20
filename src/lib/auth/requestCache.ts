import { generalLogger } from '../../utils/logger'

/**
 * BANK GRADE: Request Deduplication Cache
 * Prevents parallel API calls to the same endpoint.
 */
const requestCache = new Map<string, Promise<unknown>>()

export function getCachedRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const cached = requestCache.get(key)
  if (cached) {
    generalLogger.debug('[Auth] Reusing cached request', { key })
    return cached as Promise<T>
  }

  const promise = factory().finally(() => {
    requestCache.delete(key)
  })

  requestCache.set(key, promise)
  return promise
}
