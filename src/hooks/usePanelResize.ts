/**
 * usePanelResize Hook
 *
 * Single Responsibility: Manage resizable panel width with localStorage persistence.
 * Handles constraints, snapping, and user preferences.
 *
 * @module hooks/usePanelResize
 */

import { useCallback, useEffect, useState } from 'react'
import { PANEL_CONSTRAINTS } from '../constants/panelConstants'
import { chatLogger } from '../utils/logger'
import {
  clampPanelWidth,
  readStoredPanelWidth,
  snapPanelWidthToDefault,
  writeStoredPanelWidth,
} from './panelResizeModel'

export interface UsePanelResizeReturn {
  /** Current left panel width (percentage) */
  leftPanelWidth: number
  /** Handler for panel resize events */
  handleResize: (newWidth: number) => void
}

/**
 * Manages resizable panel width with localStorage persistence
 *
 * Features:
 * - Persists user's preferred width across sessions
 * - Enforces min/max constraints
 * - Snaps to default if within 2% tolerance
 * - Graceful fallback on storage errors
 *
 * @returns Panel width state and resize handler
 *
 * @example
 * ```typescript
 * const { leftPanelWidth, handleResize } = usePanelResize()
 *
 * return (
 *   <ResizableDivider
 *     leftPanelWidth={leftPanelWidth}
 *     onResize={handleResize}
 *   />
 * )
 * ```
 */
export function usePanelResize(): UsePanelResizeReturn {
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    return (
      readStoredPanelWidth({
        onError: (error) => chatLogger.warn('Failed to load saved panel width', { error }),
      }) ?? PANEL_CONSTRAINTS.DEFAULT_WIDTH
    )
  })

  // Persist to localStorage whenever width changes
  useEffect(() => {
    writeStoredPanelWidth(leftPanelWidth, {
      onError: (error) => chatLogger.warn('Failed to save panel width', { error }),
    })
  }, [leftPanelWidth])

  const handleResize = useCallback((newWidth: number) => {
    setLeftPanelWidth(snapPanelWidthToDefault(clampPanelWidth(newWidth)))
  }, [])

  return {
    leftPanelWidth,
    handleResize,
  }
}
