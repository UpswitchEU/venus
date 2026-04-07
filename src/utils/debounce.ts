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
export function debounce<T extends (...args: any[]) => Promise<any>>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout | null = null
  let lastPromise: Promise<any> | null = null

  return ((...args: any[]) => {
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
  }) as T
}

export interface DebouncedWithFlush<T extends (...args: any[]) => Promise<any>> {
  (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>
  flush: () => Promise<void>
}

/**
 * Debounce with flush support for page unload scenarios.
 * Use flush() to execute any pending call immediately (e.g. on beforeunload).
 */
export function debounceWithFlush<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number
): DebouncedWithFlush<T> {
  let timeoutId: NodeJS.Timeout | null = null
  let lastArgs: Parameters<T> | null = null
  let inFlight: Promise<any> | null = null

  const drainQueue = async (args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
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

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args
    if (timeoutId) clearTimeout(timeoutId)
    return new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        timeoutId = null
        const argsToUse = lastArgs
        lastArgs = null
        if (!argsToUse) return
        if (inFlight) {
          lastArgs = argsToUse
          return
        }
        drainQueue(argsToUse).then(resolve).catch(reject)
      }, delay)
    })
  }) as DebouncedWithFlush<T>

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
        await inFlight
        return
      }
      await drainQueue(argsToUse)
    } else if (inFlight) {
      await inFlight
    }
  }

  return debounced
}
