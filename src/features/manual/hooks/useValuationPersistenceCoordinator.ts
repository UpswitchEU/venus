'use client'

/**
 * useValuationPersistenceCoordinator — single serialized queue for the two
 * concurrent post-edit persist paths (`selected_method` change and
 * `preparer_ev_ebitda` override) that used to live as two debounced effects
 * in `ManualLayout`. Both effects called the same `persistModalEdit` API,
 * mutated overlapping refs (`lastPersistedMethodRef`, `lastPersistedPreparerRef`,
 * `pendingOverrideRef`, `isMethodSwitchRendering`), and could interleave —
 * a method switch firing mid-flight against a preparer multiple persist
 * produced last-write-wins inversion on `setResult`/`setReport`.
 *
 * Design:
 *   • One `AbortController` per in-flight run; superseded runs see
 *     `signal.aborted === true` and never call `onSuccess`.
 *   • Two debounce timers (method default 500ms, preparer default 700ms).
 *   • Single-slot pending queue per intent kind; drainage is method-first.
 *   • Method intents supersede pending/in-flight preparer intents (a new
 *     method may invalidate the preparer payload's method binding).
 *   • Baseline dedup at execution time, not at enqueue time, so a "click
 *     ebitda, then click back to dcf while ebitda is still in flight" path
 *     resolves to two server-side persists in the correct order (no
 *     fast-path early-return that would leave the UI showing ebitda).
 *
 * The runner is opaque to the hook: caller-supplied `(intent, signal) => Promise`.
 * The runner is expected to check `signal.aborted` between its own awaits and
 * skip UI writes if aborted — that gives the hook genuine cancellation
 * semantics without plumbing `AbortSignal` through axios.
 *
 * Public API:
 *   • `enqueueMethod(intent)` — schedules a method-change persist
 *   • `enqueuePreparer(intent)` — schedules a preparer-multiple persist
 *   • `setBaseline({ method?, preparerSignature? })` — server-driven baseline
 *      sync (call from a small effect when `result` changes so the dedup
 *      reflects the latest persisted state)
 *   • `isPersisting` — true while a runner is in flight; consumed by the
 *      spinner that used to read `isMethodSwitchRendering`
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsMountedRef, useLatestRef } from './useNavigationCancellation'

export type MethodPersistIntent = {
  readonly kind: 'method'
  readonly method: string
  readonly previousMethod: string
  readonly overrideReason?: string
  readonly overrideNote?: string
}

export type PreparerPersistIntent = {
  readonly kind: 'preparer'
  readonly method: string
  readonly payload: Record<string, unknown> | null
  readonly clear: boolean
  /** Stable signature of the payload — used to dedup against the last successful run. */
  readonly signature: string
}

export type PersistIntent = MethodPersistIntent | PreparerPersistIntent

export type PersistRunner = (intent: PersistIntent, signal: AbortSignal) => Promise<void>

export interface ValuationPersistenceCoordinatorParams {
  /** Stable identity of the resource. When null, enqueues are no-ops. */
  reportId: string | null
  /** Performs the API call + post-resolve UI writes. Must honour the signal. */
  runner: PersistRunner
  /** Fires once the runner resolves and the run was not aborted. */
  onSuccess?: (intent: PersistIntent) => void
  /** Fires once the runner rejects and the run was not aborted/unmounted. */
  onError?: (intent: PersistIntent, error: unknown) => void
  /** Initial server-side baselines for first-render dedup. */
  initialBaseline?: { method?: string; preparerSignature?: string }
  /** Debounce windows; defaults: method 500, preparer 700. */
  debounceMs?: { method?: number; preparer?: number }
}

export interface ValuationPersistenceCoordinator {
  enqueueMethod: (intent: Omit<MethodPersistIntent, 'kind'>) => void
  enqueuePreparer: (intent: Omit<PreparerPersistIntent, 'kind'>) => void
  /** Sync server-confirmed baseline (call when `result` changes). */
  setBaseline: (baseline: { method?: string; preparerSignature?: string }) => void
  isPersisting: boolean
}

const DEFAULT_METHOD_DEBOUNCE_MS = 500
const DEFAULT_PREPARER_DEBOUNCE_MS = 700

export function useValuationPersistenceCoordinator(
  params: ValuationPersistenceCoordinatorParams
): ValuationPersistenceCoordinator {
  const { reportId, runner, onSuccess, onError, initialBaseline, debounceMs } = params

  const methodDebounceMs = debounceMs?.method ?? DEFAULT_METHOD_DEBOUNCE_MS
  const preparerDebounceMs = debounceMs?.preparer ?? DEFAULT_PREPARER_DEBOUNCE_MS

  const runnerRef = useLatestRef(runner)
  const onSuccessRef = useLatestRef(onSuccess)
  const onErrorRef = useLatestRef(onError)
  const reportIdRef = useLatestRef(reportId)
  const mountedRef = useIsMountedRef()

  const lastMethodRef = useRef<string | undefined>(initialBaseline?.method)
  const lastSignatureRef = useRef<string | undefined>(initialBaseline?.preparerSignature)
  const pendingMethodRef = useRef<MethodPersistIntent | null>(null)
  const pendingPreparerRef = useRef<PreparerPersistIntent | null>(null)
  const methodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preparerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightControllerRef = useRef<AbortController | null>(null)
  const inFlightKindRef = useRef<PersistIntent['kind'] | null>(null)

  const [isPersisting, setIsPersisting] = useState(false)

  const recomputeIsPersisting = useCallback(() => {
    if (!mountedRef.current) return
    const next =
      inFlightControllerRef.current !== null ||
      pendingMethodRef.current !== null ||
      pendingPreparerRef.current !== null ||
      methodTimerRef.current !== null ||
      preparerTimerRef.current !== null
    setIsPersisting((prev) => (prev === next ? prev : next))
  }, [mountedRef])

  // Forward-declared so `runIntent.finally` can drain the queue after a
  // successful or failed run. The actual function is assigned below.
  const drainQueueRef = useRef<() => void>(() => {})

  const runIntent = useCallback(
    (intent: PersistIntent): void => {
      const controller = new AbortController()
      inFlightControllerRef.current = controller
      inFlightKindRef.current = intent.kind
      recomputeIsPersisting()

      runnerRef.current(intent, controller.signal)
        .then(() => {
          if (controller.signal.aborted) return
          if (intent.kind === 'method') {
            lastMethodRef.current = intent.method
          } else {
            lastSignatureRef.current = intent.signature
          }
          onSuccessRef.current?.(intent)
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          if (!mountedRef.current) return
          onErrorRef.current?.(intent, err)
        })
        .finally(() => {
          if (inFlightControllerRef.current === controller) {
            inFlightControllerRef.current = null
            inFlightKindRef.current = null
          }
          drainQueueRef.current()
          recomputeIsPersisting()
        })
    },
    [mountedRef, onErrorRef, onSuccessRef, recomputeIsPersisting, runnerRef]
  )

  const drainQueue = useCallback((): void => {
    if (inFlightControllerRef.current !== null) return
    if (pendingMethodRef.current) {
      const next = pendingMethodRef.current
      pendingMethodRef.current = null
      if (next.method === lastMethodRef.current) {
        // No-op dedup at execution time. Recurse to attempt a preparer drain.
        drainQueue()
        return
      }
      runIntent(next)
      return
    }
    if (pendingPreparerRef.current) {
      const next = pendingPreparerRef.current
      pendingPreparerRef.current = null
      if (next.signature === lastSignatureRef.current) {
        drainQueue()
        return
      }
      runIntent(next)
      return
    }
  }, [runIntent])

  drainQueueRef.current = drainQueue

  const clearMethodTimer = useCallback(() => {
    if (methodTimerRef.current !== null) {
      clearTimeout(methodTimerRef.current)
      methodTimerRef.current = null
    }
  }, [])

  const clearPreparerTimer = useCallback(() => {
    if (preparerTimerRef.current !== null) {
      clearTimeout(preparerTimerRef.current)
      preparerTimerRef.current = null
    }
  }, [])

  const abortInFlight = useCallback(() => {
    if (inFlightControllerRef.current !== null) {
      inFlightControllerRef.current.abort()
      inFlightControllerRef.current = null
      inFlightKindRef.current = null
    }
  }, [])

  const enqueueMethod = useCallback(
    (intent: Omit<MethodPersistIntent, 'kind'>): void => {
      if (!reportIdRef.current) return

      // Method supersedes preparer at every layer: pending timer, queued
      // intent, in-flight run. Different method → preparer payload's method
      // binding may be wrong.
      clearPreparerTimer()
      pendingPreparerRef.current = null
      if (inFlightKindRef.current === 'preparer') {
        abortInFlight()
      }

      clearMethodTimer()
      methodTimerRef.current = setTimeout(() => {
        methodTimerRef.current = null
        pendingMethodRef.current = { kind: 'method', ...intent }
        drainQueue()
        recomputeIsPersisting()
      }, methodDebounceMs)
      recomputeIsPersisting()
    },
    [
      abortInFlight,
      clearMethodTimer,
      clearPreparerTimer,
      drainQueue,
      methodDebounceMs,
      recomputeIsPersisting,
      reportIdRef,
    ]
  )

  const enqueuePreparer = useCallback(
    (intent: Omit<PreparerPersistIntent, 'kind'>): void => {
      if (!reportIdRef.current) return

      clearPreparerTimer()
      preparerTimerRef.current = setTimeout(() => {
        preparerTimerRef.current = null
        pendingPreparerRef.current = { kind: 'preparer', ...intent }
        drainQueue()
        recomputeIsPersisting()
      }, preparerDebounceMs)
      recomputeIsPersisting()
    },
    [clearPreparerTimer, drainQueue, preparerDebounceMs, recomputeIsPersisting, reportIdRef]
  )

  const setBaseline = useCallback(
    (baseline: { method?: string; preparerSignature?: string }): void => {
      if (baseline.method !== undefined) lastMethodRef.current = baseline.method
      if (baseline.preparerSignature !== undefined) {
        lastSignatureRef.current = baseline.preparerSignature
      }
    },
    []
  )

  // Reset everything when reportId changes. We deliberately skip the very
  // first run so the initialBaseline isn't immediately overwritten.
  const previousReportIdRef = useRef<string | null>(reportId)
  useEffect(() => {
    if (previousReportIdRef.current === reportId) return
    previousReportIdRef.current = reportId
    clearMethodTimer()
    clearPreparerTimer()
    pendingMethodRef.current = null
    pendingPreparerRef.current = null
    if (inFlightControllerRef.current !== null) {
      inFlightControllerRef.current.abort()
      inFlightControllerRef.current = null
      inFlightKindRef.current = null
    }
    lastMethodRef.current = undefined
    lastSignatureRef.current = undefined
    recomputeIsPersisting()
  }, [reportId, clearMethodTimer, clearPreparerTimer, recomputeIsPersisting])

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (methodTimerRef.current !== null) {
        clearTimeout(methodTimerRef.current)
        methodTimerRef.current = null
      }
      if (preparerTimerRef.current !== null) {
        clearTimeout(preparerTimerRef.current)
        preparerTimerRef.current = null
      }
      if (inFlightControllerRef.current !== null) {
        inFlightControllerRef.current.abort()
        inFlightControllerRef.current = null
        inFlightKindRef.current = null
      }
    }
  }, [])

  return { enqueueMethod, enqueuePreparer, setBaseline, isPersisting }
}
