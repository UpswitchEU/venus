/**
 * Performance Utilities
 *
 * Utilities for optimizing React component performance:
 * - Memoization helpers
 * - Debouncing and throttling
 * - Performance monitoring
 *
 * @module utils/performance
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Custom hook for debounced values
 *
 * Usage:
 * ```tsx
 * const debouncedSearch = useDebounce(searchQuery, 300);
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Custom hook for throttled callbacks
 *
 * Usage:
 * ```tsx
 * const throttledScroll = useThrottle(handleScroll, 100);
 * ```
 */
export function useThrottle<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
  delay: number
): (...args: TArgs) => void {
  const lastRun = useRef(Date.now())

  return useCallback(
    (...args: TArgs) => {
      const now = Date.now()
      if (now - lastRun.current >= delay) {
        callback(...args)
        lastRun.current = now
      }
    },
    [callback, delay]
  )
}

/**
 * Custom hook for stable callbacks
 * Like useCallback but with stable identity
 *
 * Usage:
 * ```tsx
 * const handleClick = useStableCallback((id) => {
 *   // Can safely use latest props/state without re-creating
 *   doSomething(id, latestValue);
 * });
 * ```
 */
export function useStableCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  return useCallback((...args: TArgs) => {
    return callbackRef.current(...args)
  }, [])
}

/**
 * Custom hook for expensive computations with memoization
 *
 * Usage:
 * ```tsx
 * const result = useMemoizedComputation(
 *   () => expensiveCalculation(data),
 *   [data],
 *   (prev, next) => prev.id === next.id // Custom equality
 * );
 * ```
 */
export function useMemoizedComputation<T>(
  compute: () => T,
  deps: React.DependencyList,
  isEqual?: (prev: T, next: T) => boolean
): T {
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps is intentionally dynamic for utility function
  const memoizedValue = useMemo(compute, deps)
  const prevValueRef = useRef<T>(memoizedValue)

  if (isEqual && prevValueRef.current !== undefined) {
    if (isEqual(prevValueRef.current, memoizedValue)) {
      return prevValueRef.current
    }
  }

  prevValueRef.current = memoizedValue
  return memoizedValue
}

/**
 * Custom hook for measuring component render performance
 * Only active in development mode
 *
 * Usage:
 * ```tsx
 * useRenderPerformance('MyComponent');
 * ```
 */
export function useRenderPerformance(componentName: string) {
  if (process.env.NODE_ENV === 'development') {
    const renderCount = useRef(0)
    const renderStart = useRef(performance.now())

    useEffect(() => {
      renderCount.current += 1
      const renderTime = performance.now() - renderStart.current

      if (renderTime > 16) {
        // Slower than 60fps
        // Use structured logging in production - console.warn is acceptable for dev-only performance warnings
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[Performance] ${componentName} render #${renderCount.current} took ${renderTime.toFixed(2)}ms`
          )
        }
      }

      renderStart.current = performance.now()
    })
  }
}

/**
 * Helper to create shallow comparison function for memoization
 */
export function shallowEqual<T extends Record<string, unknown>>(objA: T, objB: T): boolean {
  if (Object.is(objA, objB)) {
    return true
  }

  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false
  }

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (!(key in objB) || !Object.is(objA[key], objB[key])) {
      return false
    }
  }

  return true
}

/**
 * Helper to create deep comparison function for memoization
 */
export function deepEqual(objA: unknown, objB: unknown): boolean {
  if (Object.is(objA, objB)) {
    return true
  }

  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false
  }

  const recordA = objA as Record<string, unknown>
  const recordB = objB as Record<string, unknown>
  const keysA = Object.keys(recordA)
  const keysB = Object.keys(recordB)

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (!(key in recordB) || !deepEqual(recordA[key], recordB[key])) {
      return false
    }
  }

  return true
}

/**
 * Custom hook for lazy initialization
 * Useful for expensive initial state calculations
 *
 * Usage:
 * ```tsx
 * const [state] = useState(() => useLazyInit(expensiveComputation));
 * ```
 */
export function useLazyInit<T>(init: () => T): T {
  const ref = useRef<T>()
  if (ref.current === undefined) {
    ref.current = init()
  }
  return ref.current
}
