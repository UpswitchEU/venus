/**
 * Refresh Service
 *
 * Single Responsibility: Handle page refresh operations
 * SOLID Principles: SRP - Only handles refresh logic
 *
 * @module services/toolbar/refreshService
 */

import { generalLogger } from '../../utils/logger'
import { safeVenusSameOriginNavigationTarget } from '../../utils/safeVenusRedirect'

/**
 * Service for handling page refresh operations
 */
export class RefreshService {
  /**
   * Refresh the current page
   * Uses window.location.reload() for full page refresh
   */
  static refresh(): void {
    generalLogger.info('Page refresh initiated')
    window.location.reload()
  }

  /**
   * Refresh with confirmation dialog if there are unsaved changes
   *
   * @param hasUnsavedChanges - Whether there are unsaved changes
   * @returns Promise resolving to true if refresh should proceed, false if cancelled
   */
  static async refreshWithConfirmation(hasUnsavedChanges: boolean): Promise<boolean> {
    if (!hasUnsavedChanges) {
      this.refresh()
      return true
    }

    const confirmed = window.confirm('You have unsaved changes. Are you sure you want to refresh?')

    if (confirmed) {
      generalLogger.info('Page refresh confirmed by user')
      this.refresh()
      return true
    }

    generalLogger.info('Page refresh cancelled by user')
    return false
  }

  /**
   * Navigate to a new URL (useful for generating new report IDs)
   *
   * @param url - URL to navigate to
   */
  static navigateTo(url: string): void {
    if (typeof window === 'undefined' || !window.location) return

    const trimmed = url.trim()
    if (!trimmed) {
      generalLogger.warn('NavigateTo blocked: empty URL')
      return
    }

    const safeTarget = safeVenusSameOriginNavigationTarget(trimmed, window.location.origin)

    if (!safeTarget) {
      generalLogger.warn(
        'NavigateTo blocked: URL must be same-origin path or full same-origin URL',
        {
          url: trimmed,
        }
      )
      return
    }

    generalLogger.info('Navigating to new URL', { url: safeTarget })
    window.location.assign(safeTarget)
  }

  /**
   * Soft refresh - reloads only the current route without full page reload
   * Useful for Next.js router-based refresh
   */
  static softRefresh(): void {
    if (typeof window !== 'undefined' && window.location) {
      generalLogger.info('Soft refresh initiated')
      window.location.reload()
    }
  }
}
