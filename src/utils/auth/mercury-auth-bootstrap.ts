/**
 * Mercury → Venus auth bootstrap channel.
 *
 * When Venus runs inside Mercury's `VenusEmbeddedModal` iframe, Mercury
 * `postMessage`s the authenticated user as soon as the iframe `load` fires
 * (envelope: `MERCURY_TO_ENGINE_MESSAGE_TYPES.authBootstrap`). Capturing it
 * before bootstrap runs lets `AuthResolver` skip the same-origin
 * `/api/auth/me` round-trip — saving 200–800 ms on warm modal opens and
 * eliminating one BFF hop on the critical path.
 *
 * Security:
 *   - Only accepts messages whose `event.origin` is Mercury's derived URL.
 *   - Only accepts payloads whose `source === 'mercury'` and `issuedAt` is
 *     within a 30 s freshness window (defends against replay of an old
 *     postMessage queued before the user logged out).
 */

import { getMercuryUrl } from '../getMercuryUrl'

const AUTH_BOOTSTRAP_TYPE = 'upswitch-auth-bootstrap'
const AUTH_BOOTSTRAP_MAX_AGE_MS = 30_000

export type MercuryBootstrapUser = {
  id: string
  email?: string
  role?: string | null
  firstName?: string
  lastName?: string
  languagePreference?: string
  /**
   * Mercury-supplied plan_type hint (free / starter / pro / expert /
   * enterprise / premium). Used to plan-gate UI on the warm path so Venus
   * can skip its `/credits` round-trip while the JWT-backed credits query
   * runs in the background. The JWT is still authoritative for any
   * server-side authorization decision.
   */
  planType?: string | null
}

export type MercuryAuthBootstrap = {
  user: MercuryBootstrapUser
  mode?: 'accountant' | 'seller'
  receivedAt: number
}

let captured: MercuryAuthBootstrap | null = null
const waiters: Array<(value: MercuryAuthBootstrap) => void> = []
let listenerInstalled = false

function isAllowedMercuryOrigin(origin: string): boolean {
  if (!origin) return false
  let allowed: string
  try {
    allowed = new URL(getMercuryUrl()).origin
  } catch {
    return false
  }
  if (origin === allowed) return true
  if (process.env.NODE_ENV !== 'production') {
    // Tolerate localhost variants in dev (Mercury at :3000, Venus at :3001).
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  }
  return false
}

function looksLikeBootstrap(data: unknown): data is {
  type: string
  source?: string
  issuedAt?: number
  mode?: 'accountant' | 'seller'
  user?: MercuryBootstrapUser
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === AUTH_BOOTSTRAP_TYPE
  )
}

function handleMessage(event: MessageEvent) {
  if (!isAllowedMercuryOrigin(event.origin)) return
  const data = event.data
  if (!looksLikeBootstrap(data)) return
  if (data.source && data.source !== 'mercury') return
  if (
    typeof data.issuedAt === 'number' &&
    Math.abs(Date.now() - data.issuedAt) > AUTH_BOOTSTRAP_MAX_AGE_MS
  ) {
    return
  }
  const user = data.user
  if (!user?.id) return
  captured = {
    user,
    mode: data.mode,
    receivedAt: Date.now(),
  }
  while (waiters.length > 0) {
    const resolve = waiters.shift()
    resolve?.(captured)
  }
}

/**
 * Install the listener as early as possible. Safe to call multiple times —
 * subsequent calls are no-ops.
 */
export function installMercuryAuthBootstrapListener(): void {
  if (listenerInstalled) return
  if (typeof window === 'undefined') return
  // Only meaningful when running inside an iframe (Mercury embedded modal).
  // Outside the iframe the listener is harmless but unnecessary.
  listenerInstalled = true
  window.addEventListener('message', handleMessage)
}

/** Synchronously read any already-captured bootstrap (no waiting). */
export function getCapturedMercuryAuthBootstrap(): MercuryAuthBootstrap | null {
  return captured
}

/**
 * Resolve to the bootstrap payload either immediately (if already captured)
 * or once the next valid message lands, capped by `timeoutMs`. Resolves to
 * `null` on timeout — the caller should fall back to the standard /me path.
 */
export function awaitMercuryAuthBootstrap(timeoutMs: number): Promise<MercuryAuthBootstrap | null> {
  if (captured) return Promise.resolve(captured)
  if (typeof window === 'undefined') return Promise.resolve(null)
  installMercuryAuthBootstrapListener()
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(
      () => {
        if (settled) return
        settled = true
        const idx = waiters.indexOf(onValue)
        if (idx >= 0) waiters.splice(idx, 1)
        resolve(null)
      },
      Math.max(0, timeoutMs)
    )
    const onValue = (value: MercuryAuthBootstrap) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    waiters.push(onValue)
  })
}

/** Test-only escape hatch. */
export function __resetMercuryAuthBootstrapForTests(): void {
  captured = null
  waiters.length = 0
}
