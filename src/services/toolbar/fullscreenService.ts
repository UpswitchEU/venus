/**
 * Fullscreen Service
 *
 * Single Responsibility: Handle fullscreen modal operations
 * SOLID Principles: SRP - Only handles fullscreen state management
 *
 * @module services/toolbar/fullscreenService
 */

import { generalLogger } from '../../utils/logger'

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

/**
 * Service for managing fullscreen modal state
 * Note: Actual modal rendering is handled by FullScreenModal component
 * This service provides utilities for fullscreen operations
 */
export class FullscreenService {
  /**
   * Check if fullscreen mode is currently active
   *
   * @returns True if fullscreen is active
   */
  static isFullscreen(): boolean {
    if (typeof document === 'undefined') return false
    const fullscreenDocument = document as LegacyFullscreenDocument

    return !!(
      fullscreenDocument.fullscreenElement ||
      fullscreenDocument.webkitFullscreenElement ||
      fullscreenDocument.mozFullScreenElement ||
      fullscreenDocument.msFullscreenElement
    )
  }

  /**
   * Request browser fullscreen API (if needed for native fullscreen)
   * Note: This is separate from the modal fullscreen used in the app
   *
   * @param element - Element to make fullscreen
   * @returns Promise resolving when fullscreen is activated
   */
  static async requestFullscreen(element: HTMLElement): Promise<void> {
    try {
      const fullscreenElement = element as LegacyFullscreenElement
      if (element.requestFullscreen) {
        await element.requestFullscreen()
      } else if (fullscreenElement.webkitRequestFullscreen) {
        await fullscreenElement.webkitRequestFullscreen()
      } else if (fullscreenElement.mozRequestFullScreen) {
        await fullscreenElement.mozRequestFullScreen()
      } else if (fullscreenElement.msRequestFullscreen) {
        await fullscreenElement.msRequestFullscreen()
      } else {
        generalLogger.warn('Fullscreen API not supported')
      }
    } catch (error) {
      generalLogger.error('Failed to request fullscreen', { error })
      throw error
    }
  }

  /**
   * Exit browser fullscreen API
   *
   * @returns Promise resolving when fullscreen is exited
   */
  static async exitFullscreen(): Promise<void> {
    try {
      const fullscreenDocument = document as LegacyFullscreenDocument
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if (fullscreenDocument.webkitExitFullscreen) {
        await fullscreenDocument.webkitExitFullscreen()
      } else if (fullscreenDocument.mozCancelFullScreen) {
        await fullscreenDocument.mozCancelFullScreen()
      } else if (fullscreenDocument.msExitFullscreen) {
        await fullscreenDocument.msExitFullscreen()
      }
    } catch (error) {
      generalLogger.error('Failed to exit fullscreen', { error })
      throw error
    }
  }

  /**
   * Toggle browser fullscreen API
   *
   * @param element - Element to toggle fullscreen
   * @returns Promise resolving when toggle completes
   */
  static async toggleFullscreen(element: HTMLElement): Promise<void> {
    if (this.isFullscreen()) {
      await this.exitFullscreen()
    } else {
      await this.requestFullscreen(element)
    }
  }
}
