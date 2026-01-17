/**
 * Manual Panel Resize Hook
 *
 * Single Responsibility: Panel resize logic for manual layout.
 *
 * @module features/manual/hooks/useManualPanelResize
 */

import { useCallback, useEffect, useState } from 'react'
import { MOBILE_BREAKPOINT, PANEL_CONSTRAINTS } from '../../../constants/panelConstants'

/**
 * Manual Panel Resize Hook Return Type
 */
export interface UseManualPanelResizeReturn {
  /** Left panel width percentage */
  leftPanelWidth: number
  /** Handle panel resize */
  handleResize: (newWidth: number) => void
  /** Whether mobile view is active */
  isMobile: boolean
  /** Active mobile panel */
  mobileActivePanel: 'form' | 'preview'
  /** Set active mobile panel */
  setMobileActivePanel: (panel: 'form' | 'preview') => void
}

/**
 * Manual Panel Resize Hook
 *
 * Manages panel width state and responsive behavior.
 */
export const useManualPanelResize = (): UseManualPanelResizeReturn => {
  // Panel width state - load from localStorage or use default (30% matches pre-merge UI)
  // ✅ FIX: Ensure default is always 30% (left panel smaller), not 50%
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('upswitch-panel-width')
      if (saved) {
        const parsed = parseFloat(saved)
        // ✅ FIX: Only use saved value if it's within valid range AND not 50% (which indicates a bug)
        // If saved value is 50%, reset to default 30%
        if (
          !isNaN(parsed) &&
          parsed >= PANEL_CONSTRAINTS.MIN_WIDTH &&
          parsed <= PANEL_CONSTRAINTS.MAX_WIDTH &&
          parsed !== 50 // Reset 50% to default (indicates previous bug)
        ) {
          return parsed
        }
        // If saved value is 50%, clear it and use default
        if (parsed === 50) {
          localStorage.removeItem('upswitch-panel-width')
        }
      }
    } catch (error) {
      // Ignore localStorage errors
    }
    return PANEL_CONSTRAINTS.DEFAULT_WIDTH // 30% default (left panel smaller)
  })
  const [isMobile, setIsMobile] = useState(false)
  const [mobileActivePanel, setMobileActivePanel] = useState<'form' | 'preview'>('form')

  // Save panel width to localStorage
  useEffect(() => {
    if (!isMobile) {
      try {
        localStorage.setItem('upswitch-panel-width', leftPanelWidth.toString())
      } catch (error) {
        // Ignore localStorage errors
      }
    }
  }, [leftPanelWidth, isMobile])

  // Responsive handling
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (mobile) {
        setLeftPanelWidth(100)
      } else {
        // Restore saved width or use default (30%)
        try {
          const saved = localStorage.getItem('upswitch-panel-width')
          if (saved) {
            const parsed = parseFloat(saved)
            if (
              !isNaN(parsed) &&
              parsed >= PANEL_CONSTRAINTS.MIN_WIDTH &&
              parsed <= PANEL_CONSTRAINTS.MAX_WIDTH
            ) {
              setLeftPanelWidth(parsed)
              return
            }
          }
        } catch (error) {
          // Ignore localStorage errors
        }
        setLeftPanelWidth(PANEL_CONSTRAINTS.DEFAULT_WIDTH) // 30% default
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Panel resize handler
  const handleResize = useCallback(
    (newWidth: number) => {
      const constrainedWidth = Math.max(
        PANEL_CONSTRAINTS.MIN_WIDTH,
        Math.min(PANEL_CONSTRAINTS.MAX_WIDTH, newWidth)
      )
      if (isMobile) {
        // On mobile, switching panels
        setMobileActivePanel(newWidth > 50 ? 'preview' : 'form')
      } else {
        setLeftPanelWidth(constrainedWidth)
      }
    },
    [isMobile]
  )

  return {
    leftPanelWidth,
    handleResize,
    isMobile,
    mobileActivePanel,
    setMobileActivePanel,
  }
}
