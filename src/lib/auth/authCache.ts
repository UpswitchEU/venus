import type { User } from '../../contexts/AuthContextTypes'

// Cache auth checks briefly to prevent redundant /me calls.
interface CachedAuth {
  user: User | null
  expiresAt: number
}

let authCache: CachedAuth | null = null
const AUTH_CACHE_TTL = 3 * 60 * 1000 // 3 minutes (matches Mercury's optimized timing)

export function getAuthCache(): User | null {
  if (!authCache) return null
  if (Date.now() > authCache.expiresAt) {
    authCache = null
    return null
  }
  return authCache.user
}

export function setAuthCache(user: User | null): void {
  authCache = {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL,
  }
}

export function clearAuthCache(): void {
  authCache = null
}
