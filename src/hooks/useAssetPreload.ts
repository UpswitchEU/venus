/**
 * useAssetPreload Hook
 *
 * PERFORMANCE OPTIMIZATION: Triggers background asset loading after UI renders.
 *
 * Usage:
 * ```tsx
 * function ReportPage({ reportId }) {
 *   // This will preload HTML reports in the background after mount
 *   useAssetPreload(reportId, 'manual')
 *
 *   // ... rest of component renders immediately with summary data
 * }
 * ```
 *
 * @module hooks/useAssetPreload
 */

import { useEffect, useRef } from 'react'
import { AssetPreloadService } from '../services/asset/AssetPreloadService'
import { generalLogger } from '../utils/logger'

/**
 * Hook to preload assets in the background after component mounts
 *
 * @param reportId - Session key or report ID
 * @param flowType - 'manual' or 'conversational' to determine which store to update
 * @param enabled - Whether to enable preloading (default: true)
 */
export function useAssetPreload(
  reportId: string | null,
  flowType: 'manual' | 'conversational' = 'manual',
  enabled: boolean = true
): void {
  // Track the last reportId we initiated preload for
  // This prevents duplicate preloads for the same reportId
  const lastPreloadedRef = useRef<string | null>(null)

  useEffect(() => {
    // Skip if disabled or no reportId
    if (!enabled || !reportId) {
      return
    }

    // Skip if we already preloaded this exact reportId
    // (This check is stable across re-renders)
    if (lastPreloadedRef.current === reportId) {
      return
    }

    // Skip if service is already preloading this reportId
    if (AssetPreloadService.isPreloading(reportId)) {
      generalLogger.debug('[useAssetPreload] Already preloading, skipping', {
        reportId: reportId.substring(0, 20) + '...',
      })
      // Still mark as initiated to prevent future attempts
      lastPreloadedRef.current = reportId
      return
    }

    // Store cleanup variables
    let idleId: number | null = null
    let timerId: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false

    // Start preload after a short delay to ensure UI has rendered
    const schedulePreload = () => {
      // Check if effect was cleaned up before callback fired
      if (isCancelled) return

      generalLogger.debug('[useAssetPreload] Scheduling asset preload', {
        reportId: reportId.substring(0, 20) + '...',
        flowType,
      })

      // Mark as initiated before starting (prevents duplicate calls on rapid re-renders)
      lastPreloadedRef.current = reportId

      // Fire and forget - don't await
      AssetPreloadService.preloadAssets(reportId, flowType).catch((error) => {
        generalLogger.warn('[useAssetPreload] Preload failed (non-critical)', {
          reportId: reportId.substring(0, 20) + '...',
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(schedulePreload, {
        timeout: 2000, // Max wait 2 seconds
      })
    } else {
      timerId = setTimeout(schedulePreload, 100)
    }

    // Cleanup: cancel pending callbacks
    // Note: We don't reset lastPreloadedRef here - that's intentional!
    // The ref should persist to prevent re-preloading the same reportId
    return () => {
      isCancelled = true
      if (idleId !== null) {
        ;(window as any).cancelIdleCallback(idleId)
      }
      if (timerId !== null) {
        clearTimeout(timerId)
      }
    }
  }, [reportId, flowType, enabled])

  // Reset ref only on unmount, not on reportId change
  // This allows preload state to clear when navigating away entirely
  useEffect(() => {
    return () => {
      lastPreloadedRef.current = null
    }
  }, []) // Empty deps = only runs on unmount
}
