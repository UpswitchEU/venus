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

type LogMetadata = Record<string, unknown>
type BrowserLogRecord = LogMetadata & {
  context?: string
  level?: number
  msg?: string
}

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined'

// Use 'warn' in production so only warnings and errors reach the browser console.
// Debug/info noise during demos is eliminated without losing actionable signals.
// Override with NEXT_PUBLIC_LOG_LEVEL env var for temporary debugging.
const defaultLevel =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
const level = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LOG_LEVEL) || defaultLevel
const usePrettyTransport =
  !isBrowser &&
  typeof process !== 'undefined' &&
  process.env.NODE_ENV !== 'production' &&
  process.env.PINO_PRETTY === 'true'

const logger = pino({
  level,
  // In browser, use custom write function to format logs properly
  // This prevents "Object" spam in console
  browser: isBrowser
    ? {
        write: (o: object) => {
          const record = (asRecord(o) ?? {}) as BrowserLogRecord
          // Extract log level and message
          const levelValue = typeof record.level === 'number' ? record.level : 30
          const level =
            levelValue === 10
              ? 'DEBUG'
              : levelValue === 20
                ? 'INFO'
                : levelValue === 30
                  ? 'WARN'
                  : levelValue === 40
                    ? 'ERROR'
                    : 'INFO'
          const msg = record.msg ?? ''
          const context = record.context ?? ''

          // Build formatted message
          const prefix = context ? `[${level}] [${context}]` : `[${level}]`
          const logMessage = `${prefix} ${msg}`

          // Extract data (everything except standard pino fields)
          const data: LogMetadata = {}
          Object.keys(record).forEach((key) => {
            if (!['level', 'time', 'msg', 'context', 'pid', 'hostname'].includes(key)) {
              data[key] = record[key]
            }
          })
          const hasData = Object.keys(data).length > 0

          // Use appropriate console method based on level
          if (levelValue >= 50) {
            // ERROR
            if (hasData) {
              console.error(logMessage, data)
            } else {
              console.error(logMessage)
            }
          } else if (levelValue >= 40) {
            // WARN
            if (hasData) {
              console.warn(logMessage, data)
            } else {
              console.warn(logMessage)
            }
          } else if (levelValue >= 20) {
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
  // Pino transports spawn worker threads. Next's dev/server bundle can emit
  // those worker chunks under .next and then fail to resolve them during SSR,
  // so pretty logging is opt-in for standalone Node runs only.
  transport: usePrettyTransport
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function metadataFromUnknown(value: unknown): LogMetadata {
  if (!value) return {}
  if (typeof value === 'object') return value as LogMetadata
  return { value }
}

function getStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Extract correlation ID from API response headers or body
 */
export function extractCorrelationId(response: unknown): string | null {
  const record = asRecord(response)
  const headers = asRecord(record?.headers)
  const data = asRecord(record?.data)

  // Try response headers first (from axios response)
  const lowerHeader = getStringField(headers, 'x-correlation-id')
  if (lowerHeader) return lowerHeader
  const upperHeader = getStringField(headers, 'X-Correlation-ID')
  if (upperHeader) return upperHeader

  // Try response body (valuation_id can be used as correlation key)
  const dataValuationId = getStringField(data, 'valuation_id')
  if (dataValuationId) return dataValuationId
  const rootValuationId = getStringField(record, 'valuation_id')
  if (rootValuationId) return rootValuationId

  return null
}

/**
 * Set correlation context from API response
 */
export function setCorrelationFromResponse(response: unknown): void {
  const correlationId = extractCorrelationId(response)
  if (correlationId) {
    correlationContext.setCorrelationId(correlationId)
  }

  // Also set valuation_id if available
  const record = asRecord(response)
  const data = asRecord(record?.data)
  const valuationId = getStringField(data, 'valuation_id') || getStringField(record, 'valuation_id')
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
    debug: (message: string, data?: unknown) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
      }
      logger.debug(logData, message)
    },
    info: (message: string, data?: unknown) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
      }
      logger.info(logData, message)
    },
    warn: (message: string, data?: unknown) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
      }
      logger.warn(logData, message)
    },
    error: (message: string, data?: unknown, error?: Error) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
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
export const createChildLogger = (parentContext: string, additionalContext: LogMetadata) => {
  const baseContext = { context: parentContext, ...additionalContext }

  return {
    debug: (message: string, data?: unknown) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
      }
      logger.debug(logData, message)
    },
    info: (message: string, data?: unknown) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
      }
      logger.info(logData, message)
    },
    warn: (message: string, data?: unknown) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
      }
      logger.warn(logData, message)
    },
    error: (message: string, data?: unknown, error?: Error) => {
      const logData = {
        ...baseContext,
        ...correlationContext.getContext(),
        ...metadataFromUnknown(data),
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
  const logContext = createContextLogger(context ?? 'performance')

  return {
    end: (additionalData?: unknown) => {
      const duration = performance.now() - startTime
      const logData = {
        ...correlationContext.getContext(),
        operation,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimals
        ...metadataFromUnknown(additionalData),
      }
      logContext.debug(`Performance: ${operation}`, logData)
      return duration
    },
    log: (message: string, data?: unknown) => {
      const logData = {
        ...correlationContext.getContext(),
        operation,
        elapsed: Math.round((performance.now() - startTime) * 100) / 100,
        ...metadataFromUnknown(data),
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
