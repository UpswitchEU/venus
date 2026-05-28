import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ENGINE_TO_MERCURY_MESSAGE_TYPES } from '../constants/crossAppMessages'
import { generalLogger } from '../utils/logger'

export const EMBEDDED_STORAGE_KEY = 'upswitch_venus_embedded'

/**
 * Close embedded view by posting venus-close to parent.
 * Callable from non-React code (e.g. Zustand store).
 */
export function closeEmbeddedIfActive(): void {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true') {
      window.parent.postMessage(
        { type: ENGINE_TO_MERCURY_MESSAGE_TYPES.engineClose, source: 'venus' },
        '*'
      )
    }
  } catch {
    // Ignore
  }
}

/**
 * Hook to detect if Venus is running in embedded mode (iframe within Mercury)
 * and provide utilities for communicating with the parent window
 *
 * BANK-GRADE: Persists embedded state to sessionStorage to survive internal navigation.
 * When Venus navigates from /reports/xxx?embedded=true to /valuation/new, the URL
 * param is lost. This hook preserves the embedded state for the entire session.
 */
export function useEmbeddedMode() {
  const searchParams = useSearchParams()
  const urlHasEmbedded = searchParams?.get('embedded') === 'true'
  const [isEmbedded, setIsEmbedded] = useState(false)

  // Initialize and persist embedded state
  useEffect(() => {
    if (typeof window === 'undefined') return

    // If URL has embedded=true, persist it
    if (urlHasEmbedded) {
      try {
        sessionStorage.setItem(EMBEDDED_STORAGE_KEY, 'true')
        setIsEmbedded(true)
      } catch (error) {
        generalLogger.warn('[useEmbeddedMode] Failed to persist embedded state', { error })
        setIsEmbedded(true) // Still set state even if storage fails
      }
    } else {
      // Check sessionStorage for persisted state
      try {
        const persistedEmbedded = sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true'
        setIsEmbedded(persistedEmbedded)
      } catch (error) {
        generalLogger.warn('[useEmbeddedMode] Failed to read persisted embedded state', { error })
        setIsEmbedded(false)
      }
    }
  }, [urlHasEmbedded])

  // Also check if we're actually in an iframe (additional detection)
  useEffect(() => {
    if (typeof window === 'undefined') return

    // If we're in an iframe and parent is Mercury, we're embedded
    try {
      const inIframe = window.self !== window.top
      if (inIframe && !isEmbedded) {
        // We're in an iframe but didn't detect embedded mode - set it
        generalLogger.debug('[useEmbeddedMode] Detected iframe context, enabling embedded mode')
        sessionStorage.setItem(EMBEDDED_STORAGE_KEY, 'true')
        setIsEmbedded(true)
      }
    } catch (_error) {
      // Can't access window.top due to same-origin policy = we're in cross-origin iframe
      // This is expected when Venus is embedded in Mercury
      if (!isEmbedded) {
        generalLogger.debug(
          '[useEmbeddedMode] Cross-origin iframe detected, enabling embedded mode'
        )
        try {
          sessionStorage.setItem(EMBEDDED_STORAGE_KEY, 'true')
        } catch (_storageError) {
          // Ignore storage errors
        }
        setIsEmbedded(true)
      }
    }
  }, [isEmbedded])

  // Notify parent (Mercury) that the engine is ready
  useEffect(() => {
    if (isEmbedded && typeof window !== 'undefined') {
      window.parent.postMessage(
        {
          type: ENGINE_TO_MERCURY_MESSAGE_TYPES.engineReady,
          timestamp: Date.now(),
        },
        '*'
      ) // Mercury verifies origin on receipt
    }
  }, [isEmbedded])

  const closeEmbedded = () => {
    if (typeof window === 'undefined') return

    // When a Mercury handoff exists, navigate the parent shell instead of only
    // closing the iframe (seller dashboard Doorgaan / close parity).
    if (isEmbedded) {
      try {
        const localeMatch = window.location.pathname.match(/^\/(en|nl)/)
        const locale = localeMatch?.[1] ?? 'en'
        const returnUrl = sessionStorage.getItem('upswitch_return_url')
        const sourceApp = sessionStorage.getItem('upswitch_source')
        if (returnUrl || sourceApp) {
          void import('../features/manual/utils/manualMercuryNavigate').then(
            ({ navigateToMercuryFromManualHandoff }) => {
              navigateToMercuryFromManualHandoff({
                currentLocale: locale,
                hasCompletedValuation: false,
              })
            }
          )
          return
        }
      } catch (error) {
        generalLogger.warn('[useEmbeddedMode] Mercury handoff close failed, falling back', {
          error,
        })
      }
    }

    // Clear persisted embedded state
    try {
      sessionStorage.removeItem(EMBEDDED_STORAGE_KEY)
    } catch (error) {
      generalLogger.warn('[useEmbeddedMode] Failed to clear embedded state', { error })
    }

    // Send close message to parent (always try, even if we're not sure we're embedded)
    // Mercury verifies the source origin before honouring this.
    try {
      window.parent.postMessage(
        {
          type: ENGINE_TO_MERCURY_MESSAGE_TYPES.engineClose,
          timestamp: Date.now(),
        },
        '*'
      )
      generalLogger.debug('[useEmbeddedMode] Sent engine-close message to parent')
    } catch (error) {
      generalLogger.warn('[useEmbeddedMode] Failed to send engine-close message', { error })
    }
  }

  const notifyValuationComplete = (reportId: string) => {
    if (typeof window === 'undefined') return

    // Always try to notify parent (Mercury will ignore if not relevant)
    try {
      window.parent.postMessage(
        {
          type: ENGINE_TO_MERCURY_MESSAGE_TYPES.valuationComplete,
          data: { reportId },
          timestamp: Date.now(),
        },
        '*'
      )
    } catch (error) {
      generalLogger.warn('[useEmbeddedMode] Failed to send valuation complete message', { error })
    }
  }

  return { isEmbedded, closeEmbedded, notifyValuationComplete }
}
