import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const EMBEDDED_STORAGE_KEY = 'upswitch_venus_embedded'

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
        console.warn('[useEmbeddedMode] Failed to persist embedded state:', error)
        setIsEmbedded(true) // Still set state even if storage fails
      }
    } else {
      // Check sessionStorage for persisted state
      try {
        const persistedEmbedded = sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true'
        setIsEmbedded(persistedEmbedded)
      } catch (error) {
        console.warn('[useEmbeddedMode] Failed to read persisted embedded state:', error)
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
        console.log('[useEmbeddedMode] Detected iframe context, enabling embedded mode')
        sessionStorage.setItem(EMBEDDED_STORAGE_KEY, 'true')
        setIsEmbedded(true)
      }
    } catch (error) {
      // Can't access window.top due to same-origin policy = we're in cross-origin iframe
      // This is expected when Venus is embedded in Mercury
      if (!isEmbedded) {
        console.log('[useEmbeddedMode] Cross-origin iframe detected, enabling embedded mode')
        try {
          sessionStorage.setItem(EMBEDDED_STORAGE_KEY, 'true')
        } catch (storageError) {
          // Ignore storage errors
        }
        setIsEmbedded(true)
      }
    }
  }, [isEmbedded])

  // Notify parent (Mercury) that Venus is ready
  useEffect(() => {
    if (isEmbedded && typeof window !== 'undefined') {
      window.parent.postMessage(
        {
          type: 'venus-ready',
          timestamp: Date.now(),
        },
        '*'
      ) // Mercury will verify origin
    }
  }, [isEmbedded])

  const closeEmbedded = () => {
    if (typeof window === 'undefined') return

    // Clear persisted embedded state
    try {
      sessionStorage.removeItem(EMBEDDED_STORAGE_KEY)
    } catch (error) {
      console.warn('[useEmbeddedMode] Failed to clear embedded state:', error)
    }

    // Send close message to parent (always try, even if we're not sure we're embedded)
    // Mercury will ignore messages from non-Venus origins
    try {
      window.parent.postMessage(
        {
          type: 'venus-close',
          timestamp: Date.now(),
        },
        '*'
      )
      console.log('[useEmbeddedMode] Sent venus-close message to parent')
    } catch (error) {
      console.warn('[useEmbeddedMode] Failed to send venus-close message:', error)
    }
  }

  const notifyValuationComplete = (reportId: string) => {
    if (typeof window === 'undefined') return

    // Always try to notify parent (Mercury will ignore if not relevant)
    try {
      window.parent.postMessage(
        {
          type: 'venus-valuation-complete',
          data: { reportId },
          timestamp: Date.now(),
        },
        '*'
      )
    } catch (error) {
      console.warn('[useEmbeddedMode] Failed to send valuation complete message:', error)
    }
  }

  return { isEmbedded, closeEmbedded, notifyValuationComplete }
}
