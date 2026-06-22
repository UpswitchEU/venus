/**
 * Manual Panel Resize Hook
 *
 * Single Responsibility: Panel resize logic for manual layout.
 *
 * @module features/manual/hooks/useManualPanelResize
 */

import { useCallback, useEffect, useState } from 'react'
import { MOBILE_BREAKPOINT, PANEL_CONSTRAINTS } from '../../../constants/panelConstants'
import {
  clampPanelWidth,
  readStoredPanelWidth,
  writeStoredPanelWidth,
} from '../../../hooks/panelResizeModel'

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
    return (
      readStoredPanelWidth({
        clearRejectedLegacySplit: true,
        rejectLegacyEqualSplit: true,
      }) ?? PANEL_CONSTRAINTS.DEFAULT_WIDTH
    )
  })
  const [isMobile, setIsMobile] = useState(false)
  const [mobileActivePanel, setMobileActivePanel] = useState<'form' | 'preview'>('form')

  // Save panel width to localStorage
  useEffect(() => {
    if (!isMobile) {
      writeStoredPanelWidth(leftPanelWidth)
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
        setLeftPanelWidth(
          readStoredPanelWidth({
            clearRejectedLegacySplit: true,
            rejectLegacyEqualSplit: true,
          }) ?? PANEL_CONSTRAINTS.DEFAULT_WIDTH
        )
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Panel resize handler
  const handleResize = useCallback(
    (newWidth: number) => {
      const constrainedWidth = clampPanelWidth(newWidth)
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
