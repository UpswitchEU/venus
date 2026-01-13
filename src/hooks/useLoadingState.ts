/**
 * Loading State Management Hook
 *
 * World-Class Loading State Management:
 * - Centralized loading state
 * - Progress indicators
 * - Skeleton screens
 * - Loading timeouts
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface LoadingState {
  isLoading: boolean
  progress: number // 0-100
  message: string | null
  error: string | null
  startTime: number | null
}

interface UseLoadingStateOptions {
  timeout?: number // Timeout in milliseconds (default: 30s)
  onTimeout?: () => void
  initialMessage?: string
}

interface UseLoadingStateReturn {
  loadingState: LoadingState
  startLoading: (message?: string) => void
  updateProgress: (progress: number, message?: string) => void
  stopLoading: (error?: string) => void
  reset: () => void
}

/**
 * Hook for managing loading state with progress tracking
 */
export function useLoadingState(options: UseLoadingStateOptions = {}): UseLoadingStateReturn {
  const {
    timeout = 30000, // 30 seconds default
    onTimeout,
    initialMessage = null,
  } = options

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    message: initialMessage,
    error: null,
    startTime: null,
  })

  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const startLoading = useCallback(
    (message?: string) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      setLoadingState({
        isLoading: true,
        progress: 0,
        message: message || initialMessage,
        error: null,
        startTime: Date.now(),
      })

      // Set timeout
      if (timeout > 0) {
        timeoutRef.current = setTimeout(() => {
          setLoadingState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Operation timed out. Please try again.',
          }))

          if (onTimeout) {
            onTimeout()
          }
        }, timeout)
      }
    },
    [timeout, onTimeout, initialMessage]
  )

  const updateProgress = useCallback((progress: number, message?: string) => {
    setLoadingState((prev) => ({
      ...prev,
      progress: Math.max(0, Math.min(100, progress)),
      message: message || prev.message,
    }))
  }, [])

  const stopLoading = useCallback((error?: string) => {
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setLoadingState((prev) => ({
      isLoading: false,
      progress: error ? prev.progress : 100,
      message: null,
      error: error || null,
      startTime: null,
    }))
  }, [])

  const reset = useCallback(() => {
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setLoadingState({
      isLoading: false,
      progress: 0,
      message: initialMessage,
      error: null,
      startTime: null,
    })
  }, [initialMessage])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    loadingState,
    startLoading,
    updateProgress,
    stopLoading,
    reset,
  }
}

/**
 * Hook for managing multiple loading states (e.g., for different operations)
 */
export function useMultipleLoadingStates() {
  const statesRef = useRef<Map<string, LoadingState>>(new Map())
  const [, forceUpdate] = useState(0)

  const getState = useCallback((key: string): LoadingState => {
    return (
      statesRef.current.get(key) || {
        isLoading: false,
        progress: 0,
        message: null,
        error: null,
        startTime: null,
      }
    )
  }, [])

  const startLoading = useCallback((key: string, message?: string) => {
    statesRef.current.set(key, {
      isLoading: true,
      progress: 0,
      message: message || null,
      error: null,
      startTime: Date.now(),
    })
    forceUpdate((n) => n + 1)
  }, [])

  const updateProgress = useCallback((key: string, progress: number, message?: string) => {
    const current = statesRef.current.get(key)
    if (current) {
      statesRef.current.set(key, {
        ...current,
        progress: Math.max(0, Math.min(100, progress)),
        message: message || current.message,
      })
      forceUpdate((n) => n + 1)
    }
  }, [])

  const stopLoading = useCallback((key: string, error?: string) => {
    const current = statesRef.current.get(key)
    if (current) {
      statesRef.current.set(key, {
        ...current,
        isLoading: false,
        progress: error ? current.progress : 100,
        error: error || null,
      })
      forceUpdate((n) => n + 1)
    }
  }, [])

  const reset = useCallback((key: string) => {
    statesRef.current.delete(key)
    forceUpdate((n) => n + 1)
  }, [])

  const isAnyLoading = useCallback((): boolean => {
    return Array.from(statesRef.current.values()).some((state) => state.isLoading)
  }, [])

  return {
    getState,
    startLoading,
    updateProgress,
    stopLoading,
    reset,
    isAnyLoading,
  }
}
