/**
 * Enhanced Auth Logging
 *
 * Structured logging with context for authentication operations
 * Includes performance timing, error stack traces, and user action tracking
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface AuthLogContext {
  method?: 'cookie' | 'token' | 'guest'
  duration?: number
  success?: boolean
  userId?: string
  email?: string
  errorType?: string
  errorMessage?: string
  retryCount?: number
  circuitBreakerState?: string
  cookieHealth?: string
  browser?: string
  [key: string]: unknown
}

export interface AuthLogEntry {
  level: LogLevel
  message: string
  context: AuthLogContext
  timestamp: string
  correlationId?: string
}

class AuthLogger {
  private correlationIdCounter = 0
  private enabled = true
  private logLevel: LogLevel = LogLevel.INFO

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `auth_${Date.now()}_${++this.correlationIdCounter}`
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false

    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const currentLevelIndex = levels.indexOf(this.logLevel)
    const messageLevelIndex = levels.indexOf(level)

    return messageLevelIndex >= currentLevelIndex
  }

  /**
   * Format log entry
   */
  private formatLog(level: LogLevel, message: string, context: AuthLogContext = {}): AuthLogEntry {
    return {
      level,
      message,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      correlationId:
        typeof context.correlationId === 'string'
          ? context.correlationId
          : this.generateCorrelationId(),
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context: AuthLogContext = {}): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return

    const entry = this.formatLog(LogLevel.DEBUG, message, context)
    console.debug(`[AUTH DEBUG] ${entry.message}`, entry.context)
  }

  /**
   * Log info message
   */
  info(message: string, context: AuthLogContext = {}): void {
    if (!this.shouldLog(LogLevel.INFO)) return

    const entry = this.formatLog(LogLevel.INFO, message, context)
    console.info(`[AUTH INFO] ${entry.message}`, entry.context)
  }

  /**
   * Log warning message
   */
  warn(message: string, context: AuthLogContext = {}): void {
    if (!this.shouldLog(LogLevel.WARN)) return

    const entry = this.formatLog(LogLevel.WARN, message, context)
    console.warn(`[AUTH WARN] ${entry.message}`, entry.context)
  }

  /**
   * Log error message
   */
  error(message: string, context: AuthLogContext = {}, error?: Error): void {
    if (!this.shouldLog(LogLevel.ERROR)) return

    const entry = this.formatLog(LogLevel.ERROR, message, {
      ...context,
      errorStack: error?.stack,
      errorName: error?.name,
    })
    console.error(`[AUTH ERROR] ${entry.message}`, entry.context, error)
  }

  /**
   * Log performance timing
   */
  performance(operation: string, duration: number, context: AuthLogContext = {}): void {
    const entry = this.formatLog(LogLevel.INFO, `Performance: ${operation}`, {
      ...context,
      duration,
      operation,
    })
    console.info(`[AUTH PERF] ${operation} took ${duration}ms`, entry.context)
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel
  }
}

// Singleton instance
export const authLogger = new AuthLogger()

// Set log level based on environment
if (typeof window !== 'undefined') {
  const isDev = process.env.NODE_ENV === 'development'
  authLogger.setLogLevel(isDev ? LogLevel.DEBUG : LogLevel.INFO)
}
