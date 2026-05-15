/**
 * useValuationPersistenceCoordinator — race-condition regression pins.
 *
 * Before this hook existed, ManualLayout owned two debounced effects that
 * called `persistModalEdit` (one for method change, one for preparer-multiple
 * change). They mutated overlapping refs and could interleave under load:
 * a method switch firing while a preparer persist was in flight produced
 * last-write-wins inversion on `setResult` / `setReport`.
 *
 * The tests below pin the behaviour that prevents that:
 *   • Single in-flight run per coordinator
 *   • Method intents abort in-flight preparer runs (via AbortSignal)
 *   • Queued runs drain in method-first order after the in-flight completes
 *   • Baseline dedup at execution time (not enqueue time) so rapid
 *     A → B → A clicks don't fast-path through the dedup and leave the UI
 *     showing B
 *   • Unmount aborts every layer
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type PersistIntent,
  type PersistRunner,
  useValuationPersistenceCoordinator,
  type ValuationPersistenceCoordinatorParams,
} from './useValuationPersistenceCoordinator'

type DeferredRun = {
  intent: PersistIntent
  signal: AbortSignal
  resolve: () => void
  reject: (err: unknown) => void
  promise: Promise<void>
}

function makeDeferredRunner(): {
  runner: PersistRunner
  runs: DeferredRun[]
  inFlight: () => DeferredRun | undefined
} {
  const runs: DeferredRun[] = []
  const runner: PersistRunner = (intent, signal) => {
    let resolveFn: () => void = () => {}
    let rejectFn: (err: unknown) => void = () => {}
    const promise = new Promise<void>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    runs.push({ intent, signal, resolve: resolveFn, reject: rejectFn, promise })
    return promise
  }
  return {
    runner,
    runs,
    inFlight: () => runs.find((r) => !r.signal.aborted),
  }
}

function setup(overrides: Partial<ValuationPersistenceCoordinatorParams> = {}) {
  const deferred = makeDeferredRunner()
  const onSuccess = vi.fn()
  const onError = vi.fn()
  const params: ValuationPersistenceCoordinatorParams = {
    reportId: 'report-1',
    runner: deferred.runner,
    onSuccess,
    onError,
    initialBaseline: { method: 'dcf', preparerSignature: 'sig-0' },
    debounceMs: { method: 500, preparer: 700 },
    ...overrides,
  }
  const { result, rerender, unmount } = renderHook(
    (p: ValuationPersistenceCoordinatorParams) => useValuationPersistenceCoordinator(p),
    { initialProps: params }
  )
  return { result, rerender, unmount, deferred, onSuccess, onError, params }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function flushMicrotasks() {
  // `await Promise.resolve()` once is enough for a single .then chain; do it
  // a few times for nested .then/.finally drainage.
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
  }
}

describe('useValuationPersistenceCoordinator', () => {
  describe('debounce + dedup', () => {
    it('runs the method persist once after the debounce window', async () => {
      const { result, deferred } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      expect(deferred.runs.length).toBe(0)
      expect(result.current.isPersisting).toBe(true)

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(1)
      expect(deferred.runs[0].intent.kind).toBe('method')
      expect((deferred.runs[0].intent as Extract<PersistIntent, { kind: 'method' }>).method).toBe(
        'ebitda'
      )
    })

    it('collapses rapid method changes inside the debounce window into one persist', async () => {
      const { result, deferred } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      act(() => {
        result.current.enqueueMethod({ method: 'sde', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      act(() => {
        result.current.enqueueMethod({ method: 'dcf_terminal', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(1)
      expect((deferred.runs[0].intent as Extract<PersistIntent, { kind: 'method' }>).method).toBe(
        'dcf_terminal'
      )
    })

    it('skips the runner entirely when the enqueued method matches the baseline', async () => {
      const { result, deferred } = setup({ initialBaseline: { method: 'ebitda' } })
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'ebitda' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(0)
      expect(result.current.isPersisting).toBe(false)
    })

    it('skips the preparer runner when the signature matches the baseline', async () => {
      const { result, deferred } = setup({ initialBaseline: { preparerSignature: 'sig-7' } })
      act(() => {
        result.current.enqueuePreparer({
          method: 'ebitda',
          payload: { x: 1 },
          clear: false,
          signature: 'sig-7',
        })
      })
      act(() => {
        vi.advanceTimersByTime(700)
      })
      expect(deferred.runs.length).toBe(0)
      expect(result.current.isPersisting).toBe(false)
    })

    it('treats `reportId === null` as enqueue no-op', async () => {
      const { result, deferred } = setup({ reportId: null })
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        result.current.enqueuePreparer({
          method: 'ebitda',
          payload: null,
          clear: true,
          signature: 'x',
        })
      })
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(deferred.runs.length).toBe(0)
      expect(result.current.isPersisting).toBe(false)
    })
  })

  describe('race-condition kill', () => {
    it('aborts an in-flight preparer when a method intent is enqueued (the canary regression)', async () => {
      const { result, deferred, onSuccess } = setup()

      // Start a preparer persist; let the debounce fire and the runner start.
      act(() => {
        result.current.enqueuePreparer({
          method: 'ebitda',
          payload: { preparer_ev_ebitda_median: 4.2 },
          clear: false,
          signature: 'sig-A',
        })
      })
      act(() => {
        vi.advanceTimersByTime(700)
      })
      expect(deferred.runs.length).toBe(1)
      const preparerRun = deferred.runs[0]
      expect(preparerRun.signal.aborted).toBe(false)

      // While the preparer is in flight, user clicks a different method.
      act(() => {
        result.current.enqueueMethod({ method: 'sde', previousMethod: 'ebitda' })
      })
      // Method enqueue must abort the in-flight preparer immediately.
      expect(preparerRun.signal.aborted).toBe(true)

      // Resolve the preparer late — onSuccess must NOT fire (it was aborted).
      preparerRun.resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(onSuccess).not.toHaveBeenCalled()

      // Method debounces, then runs.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(2)
      const methodRun = deferred.runs[1]
      expect(methodRun.intent.kind).toBe('method')
      expect(
        (methodRun.intent as Extract<PersistIntent, { kind: 'method' }>).method
      ).toBe('sde')

      methodRun.resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSuccess.mock.calls[0][0].kind).toBe('method')
    })

    it('drops a queued preparer when a method intent supersedes it', async () => {
      const { result, deferred } = setup()
      act(() => {
        result.current.enqueuePreparer({
          method: 'ebitda',
          payload: { x: 1 },
          clear: false,
          signature: 'sig-A',
        })
      })
      // Preparer debounce in flight; method enqueue drops it.
      act(() => {
        vi.advanceTimersByTime(200)
      })
      act(() => {
        result.current.enqueueMethod({ method: 'sde', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(700)
      })
      // Only the method should run.
      expect(deferred.runs.length).toBe(1)
      expect(deferred.runs[0].intent.kind).toBe('method')
    })

    it('queues a method behind an in-flight method and runs them in order', async () => {
      const { result, deferred, onSuccess } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(1)
      const firstRun = deferred.runs[0]
      expect(
        (firstRun.intent as Extract<PersistIntent, { kind: 'method' }>).method
      ).toBe('ebitda')

      // User clicks SDE while ebitda is still in flight.
      act(() => {
        result.current.enqueueMethod({ method: 'sde', previousMethod: 'dcf' })
      })
      // Debounce must elapse first before the next slot is populated.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // Second run NOT started yet — first is still in flight.
      expect(deferred.runs.length).toBe(1)

      // Resolve first run; the drain should fire the second.
      firstRun.resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(deferred.runs.length).toBe(2)
      expect(
        (deferred.runs[1].intent as Extract<PersistIntent, { kind: 'method' }>).method
      ).toBe('sde')

      deferred.runs[1].resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(onSuccess).toHaveBeenCalledTimes(2)
      expect(onSuccess.mock.calls[0][0]).toMatchObject({ kind: 'method', method: 'ebitda' })
      expect(onSuccess.mock.calls[1][0]).toMatchObject({ kind: 'method', method: 'sde' })
    })

    it('drains preparer after method completes (method-first priority)', async () => {
      const { result, deferred } = setup()

      // Enqueue both; method (500ms) fires first.
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      // Preparer must be enqueued AFTER the method so it isn't superseded.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // Method now in flight.
      expect(deferred.runs.length).toBe(1)
      const methodRun = deferred.runs[0]

      act(() => {
        result.current.enqueuePreparer({
          method: 'ebitda',
          payload: { p: 1 },
          clear: false,
          signature: 'sig-B',
        })
      })
      act(() => {
        vi.advanceTimersByTime(700)
      })
      // Preparer debounce elapsed; queued behind in-flight method.
      expect(deferred.runs.length).toBe(1)

      methodRun.resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(deferred.runs.length).toBe(2)
      expect(deferred.runs[1].intent.kind).toBe('preparer')
    })

    it('still runs the second click after a rapid A → B → A sequence (no fast-path dedup)', async () => {
      // The would-be bug: enqueue-time dedup (intent.method === baseline) would
      // see "A === A" on the second click and no-op, while the in-flight B
      // commits and leaves the UI on B. Execution-time dedup avoids this.
      const { result, deferred } = setup({ initialBaseline: { method: 'A' } })

      // Click B.
      act(() => {
        result.current.enqueueMethod({ method: 'B', previousMethod: 'A' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(1)
      const runB = deferred.runs[0]

      // Click back to A while B is still in flight.
      act(() => {
        result.current.enqueueMethod({ method: 'A', previousMethod: 'A' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // B still in flight; A queued behind it.
      expect(deferred.runs.length).toBe(1)

      // Resolve B — baseline becomes 'B'; drain runs A (now A !== baseline).
      runB.resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(deferred.runs.length).toBe(2)
      expect(
        (deferred.runs[1].intent as Extract<PersistIntent, { kind: 'method' }>).method
      ).toBe('A')
    })
  })

  describe('error handling', () => {
    it('calls onError when the runner rejects (and not onSuccess)', async () => {
      const { result, deferred, onSuccess, onError } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      const run = deferred.runs[0]
      const err = new Error('boom')
      run.reject(err)
      await act(async () => {
        await flushMicrotasks()
      })
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0][0]).toMatchObject({ kind: 'method', method: 'ebitda' })
      expect(onError.mock.calls[0][1]).toBe(err)
      expect(result.current.isPersisting).toBe(false)
    })

    it('keeps the baseline unchanged on error so a retry of the same method still fires', async () => {
      const { result, deferred } = setup({ initialBaseline: { method: 'dcf' } })
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      deferred.runs[0].reject(new Error('boom'))
      await act(async () => {
        await flushMicrotasks()
      })

      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // Baseline is still 'dcf' (the failed run did not advance it), so ebitda runs again.
      expect(deferred.runs.length).toBe(2)
    })
  })

  describe('lifecycle', () => {
    it('aborts the in-flight run on unmount and never invokes onSuccess/onError', async () => {
      const { result, deferred, onSuccess, onError, unmount } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      const run = deferred.runs[0]
      expect(run.signal.aborted).toBe(false)

      unmount()
      expect(run.signal.aborted).toBe(true)

      run.resolve()
      await flushMicrotasks()
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })

    it('aborts pending debounce timers on unmount (runner never called)', async () => {
      const { result, deferred, unmount } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      unmount()
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(deferred.runs.length).toBe(0)
    })

    it('resets baselines and aborts in-flight when reportId changes', async () => {
      const { result, rerender, deferred, params, onSuccess } = setup()
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      const run = deferred.runs[0]

      // Same report → no change.
      rerender({ ...params, reportId: 'report-1' })
      expect(run.signal.aborted).toBe(false)

      // Different report → abort.
      rerender({ ...params, reportId: 'report-2' })
      expect(run.signal.aborted).toBe(true)

      // After report change the previous baseline ('dcf') is cleared, so a
      // fresh dcf enqueue must run (previously dedup'd as no-op).
      act(() => {
        result.current.enqueueMethod({ method: 'dcf', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(2)
      expect(
        (deferred.runs[1].intent as Extract<PersistIntent, { kind: 'method' }>).method
      ).toBe('dcf')
      expect(onSuccess).not.toHaveBeenCalled() // aborted call never fired success
    })

    it('setBaseline overrides server-side state without aborting in-flight', async () => {
      const { result, deferred } = setup({ initialBaseline: { method: 'dcf' } })
      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(1)

      // Server already advanced the baseline (someone else persisted ebitda) —
      // setBaseline lets the caller sync. The in-flight run continues; it will
      // also try to set ebitda → onSuccess updates baseline to ebitda (a no-op
      // since setBaseline already did).
      act(() => {
        result.current.setBaseline({ method: 'ebitda' })
      })

      // A *different* method enqueued now still runs.
      deferred.runs[0].resolve()
      await act(async () => {
        await flushMicrotasks()
      })

      act(() => {
        result.current.enqueueMethod({ method: 'sde', previousMethod: 'ebitda' })
      })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(deferred.runs.length).toBe(2)
      expect(
        (deferred.runs[1].intent as Extract<PersistIntent, { kind: 'method' }>).method
      ).toBe('sde')
    })
  })

  describe('isPersisting', () => {
    it('is true during debounce and in-flight, false after settle', async () => {
      const { result, deferred } = setup()
      expect(result.current.isPersisting).toBe(false)

      act(() => {
        result.current.enqueueMethod({ method: 'ebitda', previousMethod: 'dcf' })
      })
      expect(result.current.isPersisting).toBe(true) // debouncing

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(result.current.isPersisting).toBe(true) // in flight

      deferred.runs[0].resolve()
      await act(async () => {
        await flushMicrotasks()
      })
      expect(result.current.isPersisting).toBe(false)
    })
  })
})
