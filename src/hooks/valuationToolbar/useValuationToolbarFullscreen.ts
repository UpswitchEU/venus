/**
 * Valuation Toolbar Fullscreen Hook
 *
 * Single Responsibility: Handle fullscreen modal state for ValuationToolbar
 * SOLID Principles: SRP - Only handles fullscreen state management
 *
 * @module hooks/valuationToolbar/useValuationToolbarFullscreen
 */

import { useCallback, useState } from 'react'
import { trackFullscreenOpen } from '@/lib/analytics'

export interface UseValuationToolbarFullscreenReturn {
  isFullScreen: boolean
  handleOpenFullscreen: () => void
  handleCloseFullscreen: () => void
  toggleFullscreen: () => void
}

/**
 * Hook for managing fullscreen modal state in ValuationToolbar
 *
 * @returns Fullscreen state and handlers
 */
export const useValuationToolbarFullscreen = (): UseValuationToolbarFullscreenReturn => {
  const [isFullScreen, setIsFullScreen] = useState(false)

  const handleOpenFullscreen = useCallback(() => {
    trackFullscreenOpen()
    setIsFullScreen(true)
  }, [])

  const handleCloseFullscreen = useCallback(() => {
    setIsFullScreen(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullScreen((prev) => !prev)
  }, [])

  return {
    isFullScreen,
    handleOpenFullscreen,
    handleCloseFullscreen,
    toggleFullscreen,
  }
}
