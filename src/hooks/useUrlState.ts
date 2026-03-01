/**
 * URL State Management Hook
 *
 * World-Class URL State Management:
 * - Preserves query parameters (mode, version, flow) in URL
 * - Supports browser back/forward navigation
 * - Updates URL when state changes
 * - Syncs URL with component state
 */

import { useSearchParams } from 'next/navigation'
import { useTransitionRouter } from 'next-view-transitions'
import { useCallback, useEffect, useRef } from 'react'

interface UrlState {
  mode?: 'edit' | 'view'
  version?: number
  flow?: 'manual' | 'conversational'
  prefilledQuery?: string
  autoSend?: boolean
}

interface UseUrlStateOptions {
  reportId: string
  onStateChange?: (state: UrlState) => void
}

interface UseUrlStateReturn {
  urlState: UrlState
  updateUrl: (updates: Partial<UrlState>, options?: { replace?: boolean }) => void
  syncStateToUrl: (state: Partial<UrlState>) => void
}

/**
 * Hook for managing URL state synchronization
 *
 * Features:
 * - Reads initial state from URL
 * - Updates URL when state changes
 * - Handles browser navigation (back/forward)
 * - Preserves other query parameters
 */
/** Delay before resetting isUpdatingRef - gives Next.js time to propagate searchParams (RACE_CONDITION_FIX) */
const URL_UPDATE_RESET_DELAY_MS = 400

export function useUrlState({ reportId, onStateChange }: UseUrlStateOptions): UseUrlStateReturn {
  const router = useTransitionRouter()
  const searchParams = useSearchParams()
  const isUpdatingRef = useRef(false)
  const lastStateRef = useRef<UrlState>({})
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read initial state from URL
  // SECURITY: prefilledQuery is read-only from URL (backward compatibility)
  // It should not be synced back to URL - it's stored in session data instead
  const urlState: UrlState = {
    mode: (searchParams?.get('mode') as 'edit' | 'view') || undefined,
    version: searchParams?.get('version') ? parseInt(searchParams.get('version')!) : undefined,
    flow: (searchParams?.get('flow') as 'manual' | 'conversational') || undefined,
    prefilledQuery: searchParams?.get('prefilledQuery') || undefined, // Read-only for backward compatibility
    autoSend: searchParams?.get('autoSend') === 'true',
  }

  // Update URL with new state
  const updateUrl = useCallback(
    (updates: Partial<UrlState>, options?: { replace?: boolean }) => {
      if (isUpdatingRef.current) return

      isUpdatingRef.current = true

      try {
        const currentUrl = new URL(window.location.href)
        const newState = { ...lastStateRef.current, ...updates }

        // Update query parameters
        if (updates.mode !== undefined) {
          if (updates.mode === 'edit') {
            currentUrl.searchParams.delete('mode') // Edit is default, don't need in URL
          } else {
            currentUrl.searchParams.set('mode', updates.mode)
          }
        }

        if (updates.version !== undefined) {
          if (updates.version === undefined || updates.version === null) {
            currentUrl.searchParams.delete('version')
          } else {
            currentUrl.searchParams.set('version', updates.version.toString())
          }
        }

        if (updates.flow !== undefined) {
          if (updates.flow === 'manual') {
            currentUrl.searchParams.delete('flow') // Manual is default
          } else {
            currentUrl.searchParams.set('flow', updates.flow)
          }
        }

        // SECURITY: Don't write prefilledQuery to URL - it's stored in session data
        // Only read it from URL for backward compatibility
        // if (updates.prefilledQuery !== undefined) {
        //   // Removed - prefilledQuery should not be synced to URL
        // }

        if (updates.autoSend !== undefined) {
          if (updates.autoSend) {
            currentUrl.searchParams.set('autoSend', 'true')
          } else {
            currentUrl.searchParams.delete('autoSend')
          }
        }

        // Preserve other query parameters (like clientToken, return_url, etc.)
        const newUrl = currentUrl.pathname + (currentUrl.search ? currentUrl.search : '')

        // Update URL
        if (options?.replace) {
          router.replace(newUrl)
        } else {
          router.push(newUrl)
        }

        lastStateRef.current = newState

        // Notify parent component of state change
        if (onStateChange) {
          onStateChange(newState)
        }

        // RACE CONDITION FIX: Delay reset so Next.js can propagate searchParams.
        // Resetting immediately causes effects to re-run with stale searchParams → duplicate updateUrl → loop.
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = setTimeout(() => {
          updateTimeoutRef.current = null
          isUpdatingRef.current = false
        }, URL_UPDATE_RESET_DELAY_MS)
      } catch (err) {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current)
          updateTimeoutRef.current = null
        }
        isUpdatingRef.current = false
        throw err
      }
    },
    [router, onStateChange]
  )

  // Sync component state to URL (for external state changes)
  const syncStateToUrl = useCallback(
    (state: Partial<UrlState>) => {
      updateUrl(state, { replace: true })
    },
    [updateUrl]
  )

  // Listen for browser navigation (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      // URL changed via browser navigation - read new state
      const newState: UrlState = {
        mode: (searchParams?.get('mode') as 'edit' | 'view') || undefined,
        version: searchParams?.get('version') ? parseInt(searchParams.get('version')!) : undefined,
        flow: (searchParams?.get('flow') as 'manual' | 'conversational') || undefined,
        prefilledQuery: searchParams?.get('prefilledQuery') || undefined, // Read-only for backward compatibility
        autoSend: searchParams?.get('autoSend') === 'true',
      }

      // Only notify if state actually changed
      if (JSON.stringify(newState) !== JSON.stringify(lastStateRef.current)) {
        lastStateRef.current = newState
        if (onStateChange) {
          onStateChange(newState)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [searchParams, onStateChange])

  // Initialize lastStateRef
  useEffect(() => {
    lastStateRef.current = urlState
  }, []) // Only on mount

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
    }
  }, [])

  return {
    urlState,
    updateUrl,
    syncStateToUrl,
  }
}
