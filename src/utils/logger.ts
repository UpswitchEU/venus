/**
 * Structured Logging Utility
 *
 * Replaces all console.log statements with structured logging using Pino.
 * Provides different log levels and context-aware logging with correlation ID tracking.
 *
 * Features:
 * - Correlation ID management for linking frontend and backend logs
 * - Specialized loggers for different modules
 * - Structured data logging with context
 * - Performance timing utilities
 */

import pino from 'pino'

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined'

// Full logging in staging and prod for validation - will tighten later
const logger = pino({
  level: 'debug' as 'info' | 'debug',
  // In browser, use custom write function to format logs properly
  // This prevents "Object" spam in console
  browser: isBrowser
    ? {
        write: (o: any) => {
          // Extract log level and message
          const level =
            o.level === 10
              ? 'DEBUG'
              : o.level === 20
                ? 'INFO'
                : o.level === 30
                  ? 'WARN'
                  : o.level === 40
                    ? 'ERROR'
                    : 'INFO'
          const msg = o.msg || ''
          const context = o.context || ''

          // Build formatted message
          const prefix = context ? `[${level}] [${context}]` : `[${level}]`
          const logMessage = `${prefix} ${msg}`

          // Extract data (everything except standard pino fields)
          const data: any = {}
          Object.keys(o).forEach((key) => {
            if (!['level', 'time', 'msg', 'context', 'pid', 'hostname'].includes(key)) {
              data[key] = o[key]
            }
          })
          const hasData = Object.keys(data).length > 0

          // Use appropriate console method based on level
          if (o.level >= 50) {
            // ERROR
            if (hasData) {
              console.error(logMessage, data)
            } else {
              console.error(logMessage)
            }
          } else if (o.level >= 40) {
            // WARN
            if (hasData) {
              console.warn(logMessage, data)
            } else {
              console.warn(logMessage)
            }
          } else if (o.level >= 20) {
            // INFO
            if (hasData) {
              console.log(logMessage, data)
            } else {
              console.log(logMessage)
            }
          } else {
            // DEBUG
            if (hasData) {
              console.debug(logMessage, data)
            } else {
              console.debug(logMessage)
            }
          }
        },
      }
    : undefined,
  // Only use pino-pretty transport in Node.js (not browser - it doesn't work there)
  transport:
    !isBrowser && process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})

/**
 * Correlation ID Management
 * Stores correlation ID and valuation ID for linking frontend and backend logs
 */
class CorrelationContext {
  private correlationId: string | null = null
  private valuationId: string | null = null

  setCorrelationId(id: string | null): void {
    this.correlationId = id
  }

  getCorrelationId(): string | null {
    return this.correlationId
  }

  setValuationId(id: string | null): void {
    this.valuationId = id
  }

  getValuationId(): string | null {
    return this.valuationId
  }

  getContext(): { correlationId?: string; valuationId?: string } {
    const context: { correlationId?: string; valuationId?: string } = {}
    if (this.correlationId) {
      context.correlationId = this.correlationId
    }
    if (this.valuationId) {
      context.valuationId = this.valuationId
    }
    return context
  }

  clear(): void {
    this.correlationId = null
    this.valuationId = null
  }
}

// Global correlation context
export const correlationContext = new CorrelationContext()

/**
 * Extract correlation ID from API response headers or body
 */
export function extractCorrelationId(response: any): string | null {
  // Try response headers first (from axios response)
  if (response?.headers?.['x-correlation-id']) {
    return response.headers['x-correlation-id']
  }
  if (response?.headers?.['X-Correlation-ID']) {
    return response.headers['X-Correlation-ID']
  }

  // Try response body (valuation_id can be used as correlation key)
  if (response?.data?.valuation_id) {
    return response.data.valuation_id
  }
  if (response?.valuation_id) {
    return response.valuation_id
  }

  return null
}

/**
 * Set correlation context from API response
 */
export function setCorrelationFromResponse(response: any): void {
  const correlationId = extractCorrelationId(response)
  if (correlationId) {
    correlationContext.setCorrelationId(correlationId)
  }

  // Also set valuation_id if available
  const valuationId = response?.data?.valuation_id || response?.valuation_id
  if (valuationId) {
    correlationContext.setValuationId(valuationId)
  }
}

/**
 * Enhanced context-aware logging helpers with correlation ID support
 */
export const createContextLogger = (context: string) => {
  const baseContext = { context }

  return {
    debug: (message: string, data?: any) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
      }
      logger.debug(logData, message)
    },
    info: (message: string, data?: any) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
      }
      logger.info(logData, message)
    },
    warn: (message: string, data?: any) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
      }
      logger.warn(logData, message)
    },
    error: (message: string, data?: any, error?: Error) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
        ...(error
          ? {
              error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
              },
            }
          : {}),
      }
      logger.error(logData, message)
    },
  }
}

/**
 * Create a child logger with additional context (e.g., step number)
 */
export const createChildLogger = (
  parentContext: string,
  additionalContext: Record<string, any>
) => {
  const baseContext = { context: parentContext, ...additionalContext }

  return {
    debug: (message: string, data?: any) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
      }
      logger.debug(logData, message)
    },
    info: (message: string, data?: any) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
      }
      logger.info(logData, message)
    },
    warn: (message: string, data?: any) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
      }
      logger.warn(logData, message)
    },
    error: (message: string, data?: any, error?: Error) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...(data || {}),
        ...(error
          ? {
              error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
              },
            }
          : {}),
      }
      logger.error(logData, message)
    },
  }
}

/**
 * Performance timing utility
 */
export const createPerformanceLogger = (operation: string, context?: string) => {
  const startTime = performance.now()
  const logContext = context ? createContextLogger(context) : logger

  return {
    end: (additionalData?: any) => {
      const duration = performance.now() - startTime
      const logData = {
        ...correlationContext.getContext(),
        operation,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimals
        ...(additionalData || {}),
      }
      logContext.debug(`Performance: ${operation}`, logData)
      return duration
    },
    log: (message: string, data?: any) => {
      const logData = {
        ...correlationContext.getContext(),
        operation,
        elapsed: Math.round((performance.now() - startTime) * 100) / 100,
        ...(data || {}),
      }
      logContext.debug(message, logData)
    },
  }
}

// Default logger for general use
export default logger

// Pre-configured loggers for common contexts
export const authLogger = createContextLogger('auth')
export const chatLogger = createContextLogger('chat')
export const apiLogger = createContextLogger('api')
export const storeLogger = createContextLogger('store')
export const serviceLogger = createContextLogger('service')
export const generalLogger = createContextLogger('general')

// New specialized loggers for valuation transparency
export const dataExtractionLogger = createContextLogger('data-extraction')
export const componentLogger = createContextLogger('component')
export const stepLogger = createContextLogger('step')
