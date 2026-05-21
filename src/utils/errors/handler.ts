/**
 * Error Handler
 *
 * Centralized error handling with user-friendly messages and recovery strategies
 */

import { apiLogger } from '../logger'
import {
  AppError,
  AuthenticationError,
  NetworkError,
  RegistryError,
  ValidationError,
} from './types'

export interface ErrorHandlingResult {
  message: string
  code: string
  canRetry: boolean
  userAction?: string
  technicalDetails?: string
}

export class ErrorHandler {
  /**
   * Handle any error and return user-friendly information
   */
  static handle(error: Error | AppError, context?: Record<string, unknown>): ErrorHandlingResult {
    if (error instanceof AppError) {
      apiLogger.error(error.message, {
        code: error.code,
        statusCode: error.statusCode,
        context: { ...error.context, ...context },
      })

      return {
        message: this.getUserMessage(error),
        code: error.code,
        canRetry: this.canRetry(error),
        userAction: this.getUserAction(error),
        technicalDetails: this.getTechnicalDetails(error, context),
      }
    }

    // Unknown error
    apiLogger.error('Unknown error', {
      error: error.message,
      context,
      stack: error.stack,
    })

    return {
      message: 'An unexpected error occurred. Please try again.',
      code: 'UNKNOWN_ERROR',
      canRetry: true,
      userAction: 'Please try again or contact support if the problem persists.',
      technicalDetails: error.message,
    }
  }

  /**
   * Get user-friendly error message
   */
  private static getUserMessage(error: AppError): string {
    const messages: Record<string, string> = {
      // Network errors
      NETWORK_ERROR: 'Connection error. Please check your internet connection and try again.',
      TIMEOUT_ERROR: 'Request timed out. Please try again.',
      CIRCUIT_BREAKER_ERROR: 'Service temporarily unavailable. Please try again in a moment.',
      RETRY_EXHAUSTED_ERROR: 'Service is experiencing issues. Please try again later.',

      // Registry errors
      REGISTRY_ERROR: 'Unable to fetch company data. Please try again.',
      NOT_FOUND_ERROR: 'Company not found. Please check the name and try again.',
      EXTERNAL_SERVICE_ERROR: 'External service unavailable. Please try again later.',

      // Validation errors
      VALIDATION_ERROR: 'Please check your input and try again.',
      FORMAT_ERROR: 'Invalid data format. Please check your input.',
      PARAMETER_ERROR: 'Invalid parameters. Please check your input.',
      QUERY_ERROR: 'Invalid search query. Please try a different search term.',

      // Authentication errors
      AUTH_ERROR: 'Authentication failed. Please log in again.',
      TOKEN_ERROR: 'Session expired. Please log in again.',
      SESSION_ERROR: 'Session invalid. Please log in again.',
      PERMISSION_ERROR: 'Access denied. Please check your permissions.',
      SECURITY_ERROR: 'Security error. Please try again.',

      // Rate limiting
      RATE_LIMIT_ERROR: 'Too many requests. Please wait a moment and try again.',
      TOO_MANY_REQUESTS_ERROR: 'Too many requests. Please wait a moment and try again.',
      QUOTA_EXCEEDED_ERROR: 'Request limit exceeded. Please try again later.',

      // Server errors
      SERVER_ERROR: 'Server error. Please try again later.',
      INTERNAL_SERVER_ERROR: 'Internal server error. Please try again later.',
      BAD_GATEWAY_ERROR: 'Service temporarily unavailable. Please try again later.',
      SERVICE_UNAVAILABLE_ERROR: 'Service temporarily unavailable. Please try again later.',
      GATEWAY_TIMEOUT_ERROR: 'Service timeout. Please try again later.',

      // Business logic errors
      BUSINESS_LOGIC_ERROR: 'Invalid operation. Please check your input.',
      DATA_QUALITY_ERROR: 'Data quality issue. Please provide more complete information.',
      CONFLICT_ERROR: 'Conflict detected. Please resolve and try again.',

      // Configuration errors
      CONFIGURATION_ERROR: 'Configuration error. Please contact support.',
      DEPENDENCY_ERROR: 'Service dependency unavailable. Please try again later.',

      // Maintenance
      MAINTENANCE_ERROR: 'Service is under maintenance. Please try again later.',
      DEPRECATED_ERROR: 'This feature is no longer available.',

      // Data processing
      TRANSFORMATION_ERROR: 'Data processing error. Please try again.',
      SERIALIZATION_ERROR: 'Data format error. Please try again.',
      DESERIALIZATION_ERROR: 'Data format error. Please try again.',

      // Streaming
      STREAMING_ERROR: 'Streaming error. Please try again.',

      // Cache
      CACHE_ERROR: 'Cache error. Please try again.',

      // File system
      FILE_SYSTEM_ERROR: 'File system error. Please try again.',

      // Database
      DATABASE_ERROR: 'Database error. Please try again.',

      // Unsupported
      UNSUPPORTED_ERROR: 'This feature is not supported.',
      NOT_IMPLEMENTED_ERROR: 'This feature is not implemented.',

      // Concurrency
      CONCURRENCY_ERROR: 'Concurrent operation detected. Please try again.',

      // Compression/Encoding
      COMPRESSION_ERROR: 'Data compression error. Please try again.',
      DECOMPRESSION_ERROR: 'Data decompression error. Please try again.',
      ENCODING_ERROR: 'Data encoding error. Please try again.',
      DECODING_ERROR: 'Data decoding error. Please try again.',

      // Encryption
      ENCRYPTION_ERROR: 'Encryption error. Please try again.',
      DECRYPTION_ERROR: 'Decryption error. Please try again.',
      HASH_ERROR: 'Hash error. Please try again.',
      SIGNATURE_ERROR: 'Signature error. Please try again.',

      // HTTP specific
      METHOD_ERROR: 'Invalid request method.',
      CONTENT_TYPE_ERROR: 'Invalid content type.',
      ACCEPT_ERROR: 'Content not acceptable.',
      RANGE_ERROR: 'Invalid range request.',

      // Request errors
      HEADER_ERROR: 'Invalid request header.',
      BODY_ERROR: 'Invalid request body.',
      PATH_ERROR: 'Invalid request path.',
      COOKIE_ERROR: 'Invalid cookie.',

      // Response errors
      EXPECTATION_ERROR: 'Expectation failed.',
      TEAPOT_ERROR: "I'm a teapot.",
      MISDIRECTED_ERROR: 'Request misdirected.',
      UNPROCESSABLE_ENTITY_ERROR: 'Unprocessable entity.',
      LOCKED_ERROR: 'Resource locked.',
      FAILED_DEPENDENCY_ERROR: 'Failed dependency.',
      TOO_EARLY_ERROR: 'Too early.',
      UPGRADE_REQUIRED_ERROR: 'Upgrade required.',
      PRECONDITION_REQUIRED_ERROR: 'Precondition required.',
      REQUEST_HEADER_FIELDS_TOO_LARGE_ERROR: 'Request header fields too large.',
      UNAVAILABLE_FOR_LEGAL_REASONS_ERROR: 'Unavailable for legal reasons.',

      // HTTP version errors
      HTTP_VERSION_NOT_SUPPORTED_ERROR: 'HTTP version not supported.',
      VARIANT_ALSO_NEGOTIATES_ERROR: 'Variant also negotiates.',
      INSUFFICIENT_STORAGE_ERROR: 'Insufficient storage.',
      LOOP_DETECTED_ERROR: 'Loop detected.',
      NOT_EXTENDED_ERROR: 'Not extended.',
      NETWORK_AUTHENTICATION_REQUIRED_ERROR: 'Network authentication required.',

      // Charset/Language
      CHARSET_ERROR: 'Invalid character set.',
      LANGUAGE_ERROR: 'Language not supported.',
    }

    return messages[error.code] || error.message
  }

  /**
   * Determine if an error can be retried
   */
  private static canRetry(error: AppError): boolean {
    const retryableCodes = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'REGISTRY_ERROR',
      'RATE_LIMIT_ERROR',
      'SERVER_ERROR',
      'INTERNAL_SERVER_ERROR',
      'BAD_GATEWAY_ERROR',
      'SERVICE_UNAVAILABLE_ERROR',
      'GATEWAY_TIMEOUT_ERROR',
      'EXTERNAL_SERVICE_ERROR',
      'DEPENDENCY_ERROR',
      'CIRCUIT_BREAKER_ERROR',
      'RETRY_EXHAUSTED_ERROR',
      'CONCURRENCY_ERROR',
      'CACHE_ERROR',
      'DATABASE_ERROR',
      'FILE_SYSTEM_ERROR',
      'STREAMING_ERROR',
      'TRANSFORMATION_ERROR',
      'SERIALIZATION_ERROR',
      'DESERIALIZATION_ERROR',
      'COMPRESSION_ERROR',
      'DECOMPRESSION_ERROR',
      'ENCODING_ERROR',
      'DECODING_ERROR',
      'ENCRYPTION_ERROR',
      'DECRYPTION_ERROR',
      'HASH_ERROR',
      'SIGNATURE_ERROR',
    ]

    const nonRetryableCodes = [
      'VALIDATION_ERROR',
      'AUTH_ERROR',
      'TOKEN_ERROR',
      'SESSION_ERROR',
      'PERMISSION_ERROR',
      'SECURITY_ERROR',
      'NOT_FOUND_ERROR',
      'BUSINESS_LOGIC_ERROR',
      'DATA_QUALITY_ERROR',
      'CONFLICT_ERROR',
      'UNSUPPORTED_ERROR',
      'NOT_IMPLEMENTED_ERROR',
      'DEPRECATED_ERROR',
      'MAINTENANCE_ERROR',
      'QUOTA_EXCEEDED_ERROR',
      'TOO_MANY_REQUESTS_ERROR',
      'FORMAT_ERROR',
      'PARAMETER_ERROR',
      'QUERY_ERROR',
      'METHOD_ERROR',
      'CONTENT_TYPE_ERROR',
      'ACCEPT_ERROR',
      'RANGE_ERROR',
      'HEADER_ERROR',
      'BODY_ERROR',
      'PATH_ERROR',
      'COOKIE_ERROR',
    ]

    if (nonRetryableCodes.includes(error.code)) {
      return false
    }

    if (retryableCodes.includes(error.code)) {
      return error.statusCode >= 500 || error.statusCode === 408 || error.statusCode === 429
    }

    // Default: retry for 5xx errors, don't retry for 4xx errors
    return error.statusCode >= 500
  }

  /**
   * Get user action suggestion
   */
  private static getUserAction(error: AppError): string {
    const actions: Record<string, string> = {
      NETWORK_ERROR: 'Check your internet connection and try again.',
      TIMEOUT_ERROR: 'Try again with a shorter timeout.',
      REGISTRY_ERROR: 'Try a different company name or search term.',
      NOT_FOUND_ERROR: 'Check the company name spelling or try a different search.',
      VALIDATION_ERROR: 'Check your input and try again.',
      AUTH_ERROR: 'Please log in again.',
      RATE_LIMIT_ERROR: 'Wait a moment before trying again.',
      SERVER_ERROR: 'Try again in a few minutes.',
      BUSINESS_LOGIC_ERROR: 'Check your input and try again.',
      DATA_QUALITY_ERROR: 'Provide more complete information.',
      CONFLICT_ERROR: 'Resolve the conflict and try again.',
      UNSUPPORTED_ERROR: 'Use a supported feature instead.',
      MAINTENANCE_ERROR: 'Try again after maintenance is complete.',
      QUOTA_EXCEEDED_ERROR: 'Try again later or contact support.',
      PERMISSION_ERROR: 'Contact your administrator for access.',
      SECURITY_ERROR: 'Try again or contact support if the issue persists.',
    }

    return actions[error.code] || 'Please try again or contact support if the problem persists.'
  }

  /**
   * Get technical details for debugging
   */
  private static getTechnicalDetails(
    error: AppError,
    additionalContext?: Record<string, unknown>
  ): string {
    const details = []

    // Merge error context with additional context
    const mergedContext = { ...error.context, ...additionalContext }
    if (Object.keys(mergedContext).length > 0) {
      details.push(`Context: ${JSON.stringify(mergedContext)}`)
    }

    if (error.statusCode) {
      details.push(`Status Code: ${error.statusCode}`)
    }

    if (error.stack) {
      details.push(`Stack: ${error.stack}`)
    }

    return details.join('\n')
  }

  /**
   * Handle API errors specifically
   */
  static handleApiError(
    error: Error | AppError,
    endpoint: string,
    context?: Record<string, unknown>
  ): ErrorHandlingResult {
    const fullContext = {
      endpoint,
      ...context,
    }

    return this.handle(error, fullContext)
  }

  /**
   * Handle network errors specifically
   */
  static handleNetworkError(error: Error, context?: Record<string, unknown>): ErrorHandlingResult {
    const networkError = new NetworkError(error.message || 'Network connection failed', context)

    return this.handle(networkError, context)
  }

  /**
   * Handle validation errors specifically
   */
  static handleValidationError(
    message: string,
    context?: Record<string, unknown>
  ): ErrorHandlingResult {
    const validationError = new ValidationError(message, context)
    return this.handle(validationError, context)
  }

  /**
   * Handle authentication errors specifically
   */
  static handleAuthError(message: string, context?: Record<string, unknown>): ErrorHandlingResult {
    const authError = new AuthenticationError(message, context)
    return this.handle(authError, context)
  }

  /**
   * Handle registry errors specifically
   */
  static handleRegistryError(
    message: string,
    statusCode: number,
    context?: Record<string, unknown>
  ): ErrorHandlingResult {
    const registryError = new RegistryError(message, statusCode, context)
    return this.handle(registryError, context)
  }
}
