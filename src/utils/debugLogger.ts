/**
 * Debug Logger Utility
 *
 * Provides environment-aware logging that only outputs in development
 * or when explicitly enabled via localStorage.
 *
 * Usage:
 *   debugLogger.log('[Component]', 'message', { data });
 *   debugLogger.warn('[Component]', 'warning', { data });
 *   debugLogger.error('[Component]', 'error', { data });
 */

type DebugWindow = Window & {
  enableDebug?: () => void
  disableDebug?: () => void
}

class DebugLogger {
  private enabled: boolean

  constructor() {
    // Enable in development OR if DEBUG_CONVERSATION flag is set
    this.enabled =
      (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') ||
      (typeof window !== 'undefined' && localStorage.getItem('DEBUG_CONVERSATION') === 'true')
  }

  /**
   * Check if debugging is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Enable debugging at runtime
   */
  enable(): void {
    this.enabled = true
    if (typeof window !== 'undefined') {
      localStorage.setItem('DEBUG_CONVERSATION', 'true')
    }
    console.log('🔧 Debug logging enabled')
  }

  /**
   * Disable debugging at runtime
   */
  disable(): void {
    this.enabled = false
    if (typeof window !== 'undefined') {
      localStorage.removeItem('DEBUG_CONVERSATION')
    }
    console.log('🔇 Debug logging disabled')
  }

  /**
   * Log debug message (only in development or when enabled)
   */
  log(prefix: string, message: string, data?: unknown): void {
    if (this.enabled) {
      if (data) {
        console.log(prefix, message, data)
      } else {
        console.log(prefix, message)
      }
    }
  }

  /**
   * Log warning (only in development or when enabled)
   */
  warn(prefix: string, message: string, data?: unknown): void {
    if (this.enabled) {
      if (data) {
        console.warn(prefix, message, data)
      } else {
        console.warn(prefix, message)
      }
    }
  }

  /**
   * Log error (always logged, but with more detail when enabled)
   */
  error(prefix: string, message: string, data?: unknown): void {
    // Errors are always logged
    if (data) {
      console.error(prefix, message, data)
    } else {
      console.error(prefix, message)
    }
  }

  /**
   * Log info (only in development or when enabled)
   */
  info(prefix: string, message: string, data?: unknown): void {
    if (this.enabled) {
      if (data) {
        console.info(prefix, message, data)
      } else {
        console.info(prefix, message)
      }
    }
  }

  /**
   * Always log (ignores enabled flag, for critical messages)
   */
  always(prefix: string, message: string, data?: unknown): void {
    if (data) {
      console.log(prefix, message, data)
    } else {
      console.log(prefix, message)
    }
  }
}

// Export singleton instance
export const debugLogger = new DebugLogger()

// Make available on window for easy enable/disable in console
if (typeof window !== 'undefined') {
  const debugWindow = window as DebugWindow
  debugWindow.enableDebug = () => debugLogger.enable()
  debugWindow.disableDebug = () => debugLogger.disable()
}
