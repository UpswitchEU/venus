/**
 * Error Converter Utility
 *
 * Single Responsibility: Convert unknown errors (including axios errors) to specific error types.
 * Follows BANK_GRADE_EXCELLENCE_FRAMEWORK.md error handling standards.
 *
 * @module utils/errors/errorConverter
 */

import axios, { AxiosError } from 'axios'
import { extractErrorMessage } from '../errorDetection'
import {
  ApplicationError,
  createErrorFromStatus,
  IntegrationError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from './ApplicationErrors'

/**
 * Convert unknown error to specific ApplicationError type
 *
 * Handles:
 * - Axios errors (network, HTTP status codes)
 * - Native JavaScript errors (TypeError, etc.)
 * - ApplicationError instances (pass through)
 * - Unknown errors (wrap in ApplicationError)
 *
 * @param error - Unknown error to convert
 * @param context - Additional context for error
 * @returns Specific ApplicationError instance
 *
 * @example
 * ```typescript
 * try {
 *   await api.calculateValuation(request)
 * } catch (error) {
 *   const appError = convertToApplicationError(error, { request })
 *   if (appError instanceof NetworkError) {
 *     // Handle network error specifically
 *   }
 * }
 * ```
 */
export function convertToApplicationError(
  error: unknown,
  context?: Record<string, unknown>
): ApplicationError {
  // If already an ApplicationError, return as-is
  if (error instanceof ApplicationError) {
    return error
  }

  // Handle axios errors
  if (axios.isAxiosError(error)) {
    return convertAxiosError(error, context)
  }

  // Handle native JavaScript errors
  if (error instanceof Error) {
    return convertNativeError(error, context)
  }

  // Handle unknown error types
  const message = extractErrorMessage(error)
  return new ApplicationError(message || 'An unexpected error occurred', 'UNKNOWN_ERROR', {
    ...context,
    originalError: String(error),
  })
}

/**
 * Convert Axios error to specific ApplicationError
 */
function convertAxiosError(error: AxiosError, context?: Record<string, unknown>): ApplicationError {
  const status = error.response?.status
  const message =
    (error.response?.data as { message?: string })?.message || error.message || 'Request failed'
  const errorContext = {
    ...context,
    url: error.config?.url,
    method: error.config?.method,
    statusCode: status,
    responseData: error.response?.data,
  }

  // Network errors (no response)
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return new TimeoutError(
        'Request timed out. Please try again.',
        (context?.timeout_ms as number) || 30000,
        errorContext
      )
    }

    if (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ERR_NETWORK' ||
      error.message.includes('Network Error')
    ) {
      return new NetworkError(
        'Network connection failed. Please check your internet connection.',
        errorContext
      )
    }

    return new NetworkError('Network error occurred. Please try again.', errorContext)
  }

  // HTTP status code errors
  if (status) {
    return createErrorFromStatus(status, message, errorContext)
  }

  // Fallback for axios errors without status
  return new ApplicationError(message, 'API_ERROR', errorContext)
}

/**
 * Convert native JavaScript Error to ApplicationError
 */
function convertNativeError(error: Error, context?: Record<string, unknown>): ApplicationError {
  const errorContext = {
    ...context,
    errorName: error.name,
    stack: error.stack,
  }

  // CRITICAL FIX: Check for HTTP status codes on error object (for fetch API errors)
  const errorWithStatus = error as Error & {
    status?: number
    statusCode?: number
    body?: unknown
    response?: { status?: number; data?: unknown }
  }
  const status =
    errorWithStatus?.status || errorWithStatus?.statusCode || errorWithStatus?.response?.status
  if (status) {
    const message = error.message || 'Request failed'
    return createErrorFromStatus(status, message, {
      ...errorContext,
      statusCode: status,
      responseData: errorWithStatus?.body || errorWithStatus?.response?.data,
    })
  }

  // TypeError usually indicates network issues
  if (error instanceof TypeError) {
    if (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch')
    ) {
      return new NetworkError(
        'Network connection failed. Please check your internet connection.',
        errorContext
      )
    }
  }

  // AbortError indicates request was cancelled
  if (error.name === 'AbortError') {
    return new ApplicationError('Request was cancelled', 'REQUEST_CANCELLED', errorContext)
  }

  // Generic Error - try to classify by message
  const message = error.message.toLowerCase()
  if (message.includes('timeout') || message.includes('timed out')) {
    return new TimeoutError(error.message, (context?.timeout_ms as number) || 30000, errorContext)
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return new ValidationError(error.message, errorContext)
  }

  // Unknown native error
  return new ApplicationError(
    error.message || 'An unexpected error occurred',
    'UNKNOWN_ERROR',
    errorContext
  )
}

/**
 * Check if error is an axios error
 *
 * @param error - Error to check
 * @returns True if error is an AxiosError instance
 *
 * @example
 * ```typescript
 * if (isAxiosError(error)) {
 *   const status = error.response?.status
 * }
 * ```
 */
export function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error)
}

/**
 * Extract HTTP status code from error
 *
 * @param error - Error to extract status from
 * @returns HTTP status code if available, undefined otherwise
 *
 * @example
 * ```typescript
 * const status = getErrorStatus(error)
 * if (status === 404) {
 *   // Handle not found
 * }
 * ```
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.status
  }

  if (error instanceof ApplicationError && 'statusCode' in error) {
    const statusCode = (error as ApplicationError & { statusCode?: unknown }).statusCode
    return typeof statusCode === 'number' ? statusCode : undefined
  }

  return undefined
}

/**
 * Extract error message safely from any error type
 *
 * @param error - Error to extract message from
 * @returns Error message string, or default message if extraction fails
 *
 * @example
 * ```typescript
 * const message = getErrorMessage(error)
 * console.error('Operation failed:', message)
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'An unexpected error occurred'
}
