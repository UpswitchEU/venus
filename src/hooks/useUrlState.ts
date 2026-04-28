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
import { parseReportModeSearchParam, shouldPreserveMercuryEmbedMode } from '@/utils/reportMode'

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
  const targetStateRef = useRef<UrlState | null>(null)

  // Read initial state from URL
  // SECURITY: prefilledQuery is read-only from URL (backward compatibility)
  // It should not be synced back to URL - it's stored in session data instead
  const versionParam = searchParams?.get('version') ?? undefined
  const urlState: UrlState = {
    mode: parseReportModeSearchParam(searchParams?.get('mode')),
    version: versionParam !== undefined ? parseInt(versionParam, 10) : undefined,
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
        // UI `edit` normally omits `mode` — but Mercury uses `mode=accountant` for advisor context
        // (cross-app contract). Stripping `mode` would remove that signal on sync; preserve it.
        if (updates.mode !== undefined) {
          if (updates.mode === 'edit') {
            // Strip redundant UI `mode` — keep Mercury persona params (`accountant`, `seller` embed)
            const rawMode = currentUrl.searchParams.get('mode')
            if (!shouldPreserveMercuryEmbedMode(rawMode)) {
              currentUrl.searchParams.delete('mode')
            }
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
        targetStateRef.current = newState

        // Notify parent component of state change
        if (onStateChange) {
          onStateChange(newState)
        }

        // RACE CONDITION FIX: Delay reset so Next.js can propagate searchParams.
        // Resetting immediately causes effects to re-run with stale searchParams → duplicate updateUrl → loop.
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = setTimeout(() => {
          updateTimeoutRef.current = null
          targetStateRef.current = null
          isUpdatingRef.current = false
        }, URL_UPDATE_RESET_DELAY_MS)
      } catch (err) {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current)
          updateTimeoutRef.current = null
        }
        targetStateRef.current = null
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
      const pv = searchParams?.get('version') ?? undefined
      const newState: UrlState = {
        mode: parseReportModeSearchParam(searchParams?.get('mode')),
        version: pv !== undefined ? parseInt(pv, 10) : undefined,
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

  // Initialize lastStateRef snapshot (run once; URL-derived state recreated each render elsewhere)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount baseline only — adding urlState reruns unnecessarily
  useEffect(() => {
    lastStateRef.current = urlState
  }, [])

  // EARLY RESET: When searchParams update and match target, reset immediately (no need to wait for timeout)
  useEffect(() => {
    if (!isUpdatingRef.current || !targetStateRef.current) return

    const target = targetStateRef.current
    const modeMatch = (urlState.mode ?? 'edit') === (target.mode ?? 'edit')
    const versionMatch = (urlState.version ?? null) === (target.version ?? null)
    const flowMatch = (urlState.flow ?? 'manual') === (target.flow ?? 'manual')
    const autoSendMatch = (urlState.autoSend ?? false) === (target.autoSend ?? false)

    if (modeMatch && versionMatch && flowMatch && autoSendMatch) {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      targetStateRef.current = null
      isUpdatingRef.current = false
    }
  }, [urlState.mode, urlState.version, urlState.flow, urlState.autoSend])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      targetStateRef.current = null
    }
  }, [])

  return {
    urlState,
    updateUrl,
    syncStateToUrl,
  }
}
