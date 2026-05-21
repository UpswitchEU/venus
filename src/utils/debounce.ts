/**
 * Debounce Utility
 *
 * Delays execution of async functions until a specified time has passed
 * without any new calls. Useful for throttling API requests.
 *
 * @param fn - The async function to debounce
 * @param delay - Delay in milliseconds before execution
 * @returns Debounced version of the function
 */
type AsyncFunction<Args extends unknown[], Result> = (...args: Args) => Promise<Result>

export function debounce<Args extends unknown[], Result>(
  fn: AsyncFunction<Args, Result>,
  delay: number
): AsyncFunction<Args, Result> {
  let timeoutId: NodeJS.Timeout | null = null
  let lastPromise: Promise<Result> | null = null

  return (...args: Args) => {
    // Clear any pending timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // If there's no active promise, execute immediately
    if (!lastPromise) {
      lastPromise = fn(...args).finally(() => {
        lastPromise = null
      })
      return lastPromise
    }

    // Otherwise, debounce the call
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        timeoutId = null
        fn(...args)
          .then(resolve)
          .catch(reject)
      }, delay)
    })
  }
}

export interface DebouncedWithFlush<Args extends unknown[], Result> {
  (...args: Args): Promise<Result>
  flush: () => Promise<void>
}

/**
 * Debounce with flush support for page unload scenarios.
 * Use flush() to execute any pending call immediately (e.g. on beforeunload).
 */
export function debounceWithFlush<Args extends unknown[], Result>(
  fn: AsyncFunction<Args, Result>,
  delay: number
): DebouncedWithFlush<Args, Result> {
  let timeoutId: NodeJS.Timeout | null = null
  let lastArgs: Args | null = null
  let inFlight: Promise<Result> | null = null
  let pendingResolvers: {
    resolve: (value: Result) => void
    reject: (error: unknown) => void
  }[] = []

  const drainQueue = async (args: Args): Promise<Result> => {
    inFlight = fn(...args)
    try {
      const result = await inFlight
      inFlight = null
      if (lastArgs) {
        const queued = lastArgs
        lastArgs = null
        return drainQueue(queued)
      }
      return result
    } catch (err) {
      inFlight = null
      throw err
    }
  }

  const settleAll = (resultPromise: Promise<Result>) => {
    const captured = pendingResolvers.splice(0)
    for (const { resolve, reject } of captured) {
      resultPromise.then(resolve, reject)
    }
  }

  const debounced = ((...args: Args) => {
    lastArgs = args
    if (timeoutId) clearTimeout(timeoutId)
    return new Promise<Result>((resolve, reject) => {
      pendingResolvers.push({ resolve, reject })
      timeoutId = setTimeout(() => {
        timeoutId = null
        const argsToUse = lastArgs
        lastArgs = null
        if (!argsToUse) return
        if (inFlight) {
          lastArgs = argsToUse
          return
        }
        const p = drainQueue(argsToUse)
        settleAll(p)
      }, delay)
    })
  }) as DebouncedWithFlush<Args, Result>

  debounced.flush = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (lastArgs) {
      const argsToUse = lastArgs
      lastArgs = null
      if (inFlight) {
        lastArgs = argsToUse
        const existing = inFlight
        settleAll(existing)
        await existing
        return
      }
      const p = drainQueue(argsToUse)
      settleAll(p)
      await p
    } else if (inFlight) {
      settleAll(inFlight)
      await inFlight
    }
  }

  return debounced
}
