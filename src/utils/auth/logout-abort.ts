/**
 * Logout Abort Signal
 *
 * In-flight `POST /api/auth/refresh` (or any other auth-mutating fetch) can
 * complete AFTER logout clears cookies and start writing fresh
 * `Set-Cookie: upswitch_access_token=...` back into the browser. The user
 * then appears to be logged in again on the next request — exactly the
 * "I refresh and I am logged in again" symptom.
 *
 * This module provides a single shared `AbortController` whose signal is
 * passed into every auth-related fetch / axios call. When logout starts we
 * abort the controller; the browser drops the in-flight response (including
 * any `Set-Cookie` headers) per fetch spec, so the rotated tokens never
 * reach the cookie jar.
 *
 * The controller is recreated lazily after each abort so subsequent
 * sessions can subscribe to a fresh signal.
 */

let currentController: AbortController | null = null

function ensureController(): AbortController {
  if (!currentController) {
    currentController = new AbortController()
  }
  return currentController
}

/**
 * Get a signal that aborts the moment logout starts. Pass to any
 * `fetch()` / `axios.request()` whose `Set-Cookie` would undo a
 * concurrent logout.
 */
export function getLogoutAbortSignal(): AbortSignal {
  return ensureController().signal
}

/**
 * Abort every in-flight fetch that subscribed to the logout signal.
 * Call this at the top of the logout flow — BEFORE the BFF logout
 * request fires — so any refresh response in transit is dropped
 * before its `Set-Cookie` headers are applied.
 */
export function triggerLogoutAbort(): void {
  if (!currentController) return
  try {
    currentController.abort()
  } catch {
    /* aborting twice is harmless */
  }
  currentController = null
}
