/**
 * Shared cancellation primitives used by any panel-scoped async path that
 * calls `setResult` / `setReport` / similar global-store writes after an
 * `await`. The pattern (component-mounted flag + latest-prop ref) is the
 * minimum needed to close the cross-report `setResult` clobber the Phase
 * 4c.2 audit documented:
 *
 * - Without `useIsMountedRef`: an async resolving after the component
 *   unmounts still writes to the global store, clobbering whatever the
 *   next route is rendering.
 * - Without `useLatestRef`: an async resolving after an in-layout
 *   navigation (same component, different `reportId`) still writes to
 *   the global store with the OLD report's data.
 *
 * Both utilities are intentionally tiny. They live in the manual feature
 * because that's where every consumer lives today; if they spread, lift
 * to `@/hooks/`.
 */

import { useEffect, useRef, type MutableRefObject } from 'react'

/**
 * Returns a ref whose `current` is `true` while the component is mounted
 * and `false` after unmount. Read it after every `await` in long-running
 * async paths to guard against post-unmount global-store writes.
 *
 * Pattern:
 * ```ts
 * const mountedRef = useIsMountedRef()
 * const fresh = await api.get(...)
 * if (!mountedRef.current) return
 * setResult(fresh)
 * ```
 */
export function useIsMountedRef(): MutableRefObject<boolean> {
  const ref = useRef(true)
  useEffect(() => {
    ref.current = true
    return () => {
      ref.current = false
    }
  }, [])
  return ref
}

/**
 * Returns a ref whose `current` always tracks the latest value of `value`.
 * Useful for capturing a value at the start of an async operation and
 * comparing against the latest value at await-resolution, to detect
 * in-component prop changes (e.g. report navigation that doesn't unmount).
 *
 * Pattern:
 * ```ts
 * const reportIdRef = useLatestRef(reportId)
 * const myStartId = reportId
 * const fresh = await api.get(myStartId)
 * if (reportIdRef.current !== myStartId) return // navigated mid-flight
 * setResult(fresh)
 * ```
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
