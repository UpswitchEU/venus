import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Hook to detect if Venus is running in embedded mode (iframe within Mercury)
 * and provide utilities for communicating with the parent window
 */
export function useEmbeddedMode() {
  const searchParams = useSearchParams()
  const isEmbedded = searchParams?.get('embedded') === 'true'

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
    if (isEmbedded && typeof window !== 'undefined') {
      window.parent.postMessage(
        {
          type: 'venus-close',
          timestamp: Date.now(),
        },
        '*'
      )
    }
  }

  const notifyValuationComplete = (reportId: string) => {
    if (isEmbedded && typeof window !== 'undefined') {
      window.parent.postMessage(
        {
          type: 'venus-valuation-complete',
          data: { reportId },
          timestamp: Date.now(),
        },
        '*'
      )
    }
  }

  return { isEmbedded, closeEmbedded, notifyValuationComplete }
}
