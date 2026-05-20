/**
 * Error Types
 *
 * Centralized error type definitions for consistent error handling
 */

export type ErrorContext = Record<string, unknown>

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: ErrorContext,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
    }
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'NETWORK_ERROR', 503, context)
  }
}

export class RegistryError extends AppError {
  constructor(message: string, statusCode: number, context?: ErrorContext) {
    super(message, 'REGISTRY_ERROR', statusCode, context)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', 400, context)
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'AUTH_ERROR', 401, context)
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TIMEOUT_ERROR', 408, context)
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'RATE_LIMIT_ERROR', 429, context)
  }
}

export class ServerError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SERVER_ERROR', 500, context)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'NOT_FOUND_ERROR', 404, context)
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFIGURATION_ERROR', 500, context)
  }
}

export class CacheError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CACHE_ERROR', 500, context)
  }
}

export class TransformationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TRANSFORMATION_ERROR', 500, context)
  }
}

export class StreamingError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'STREAMING_ERROR', 500, context)
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'BUSINESS_LOGIC_ERROR', 400, context)
  }
}

export class DataQualityError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATA_QUALITY_ERROR', 400, context)
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, serviceName: string, context?: ErrorContext) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, { ...context, serviceName })
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATABASE_ERROR', 500, context)
  }
}

export class FileSystemError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'FILE_SYSTEM_ERROR', 500, context)
  }
}

export class SecurityError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SECURITY_ERROR', 403, context)
  }
}

export class PermissionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'PERMISSION_ERROR', 403, context)
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'QUOTA_EXCEEDED_ERROR', 429, context)
  }
}

export class MaintenanceError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'MAINTENANCE_ERROR', 503, context)
  }
}

export class DeprecatedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DEPRECATED_ERROR', 410, context)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFLICT_ERROR', 409, context)
  }
}

export class UnsupportedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'UNSUPPORTED_ERROR', 501, context)
  }
}

export class DependencyError extends AppError {
  constructor(message: string, dependencyName: string, context?: ErrorContext) {
    super(message, 'DEPENDENCY_ERROR', 503, { ...context, dependencyName })
  }
}

export class CircuitBreakerError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CIRCUIT_BREAKER_ERROR', 503, context)
  }
}

export class RetryExhaustedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'RETRY_EXHAUSTED_ERROR', 503, context)
  }
}

export class ConcurrencyError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONCURRENCY_ERROR', 409, context)
  }
}

export class SerializationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SERIALIZATION_ERROR', 500, context)
  }
}

export class DeserializationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DESERIALIZATION_ERROR', 500, context)
  }
}

export class FormatError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'FORMAT_ERROR', 400, context)
  }
}

export class DataEncodingError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATA_ENCODING_ERROR', 500, context)
  }
}

export class DataDecodingError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATA_DECODING_ERROR', 500, context)
  }
}

export class DataCompressionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATA_COMPRESSION_ERROR', 500, context)
  }
}

export class DataDecompressionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DATA_DECOMPRESSION_ERROR', 500, context)
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ENCRYPTION_ERROR', 500, context)
  }
}

export class DecryptionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'DECRYPTION_ERROR', 500, context)
  }
}

export class HashError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'HASH_ERROR', 500, context)
  }
}

export class SignatureError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SIGNATURE_ERROR', 500, context)
  }
}

export class TokenError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TOKEN_ERROR', 401, context)
  }
}

export class SessionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SESSION_ERROR', 401, context)
  }
}

export class CookieError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'COOKIE_ERROR', 400, context)
  }
}

export class HeaderError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'HEADER_ERROR', 400, context)
  }
}

export class BodyError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'BODY_ERROR', 400, context)
  }
}

export class QueryError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'QUERY_ERROR', 400, context)
  }
}

export class ParameterError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'PARAMETER_ERROR', 400, context)
  }
}

export class PathError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'PATH_ERROR', 400, context)
  }
}

export class MethodError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'METHOD_ERROR', 405, context)
  }
}

export class ContentTypeError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONTENT_TYPE_ERROR', 415, context)
  }
}

export class AcceptError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ACCEPT_ERROR', 406, context)
  }
}

export class LanguageError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'LANGUAGE_ERROR', 406, context)
  }
}

export class HttpEncodingError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'HTTP_ENCODING_ERROR', 406, context)
  }
}

export class CharsetError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CHARSET_ERROR', 406, context)
  }
}

export class HttpCompressionError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'HTTP_COMPRESSION_ERROR', 406, context)
  }
}

export class HttpRangeError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'RANGE_ERROR', 416, context)
  }
}

export class ExpectationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'EXPECTATION_ERROR', 417, context)
  }
}

export class TeapotError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TEAPOT_ERROR', 418, context)
  }
}

export class MisdirectedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'MISDIRECTED_ERROR', 421, context)
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'UNPROCESSABLE_ENTITY_ERROR', 422, context)
  }
}

export class LockedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'LOCKED_ERROR', 423, context)
  }
}

export class FailedDependencyError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'FAILED_DEPENDENCY_ERROR', 424, context)
  }
}

export class TooEarlyError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TOO_EARLY_ERROR', 425, context)
  }
}

export class UpgradeRequiredError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'UPGRADE_REQUIRED_ERROR', 426, context)
  }
}

export class PreconditionRequiredError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'PRECONDITION_REQUIRED_ERROR', 428, context)
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'TOO_MANY_REQUESTS_ERROR', 429, context)
  }
}

export class RequestHeaderFieldsTooLargeError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'REQUEST_HEADER_FIELDS_TOO_LARGE_ERROR', 431, context)
  }
}

export class UnavailableForLegalReasonsError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'UNAVAILABLE_FOR_LEGAL_REASONS_ERROR', 451, context)
  }
}

export class InternalServerError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'INTERNAL_SERVER_ERROR', 500, context)
  }
}

export class NotImplementedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'NOT_IMPLEMENTED_ERROR', 501, context)
  }
}

export class BadGatewayError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'BAD_GATEWAY_ERROR', 502, context)
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SERVICE_UNAVAILABLE_ERROR', 503, context)
  }
}

export class GatewayTimeoutError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'GATEWAY_TIMEOUT_ERROR', 504, context)
  }
}

export class HttpVersionNotSupportedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'HTTP_VERSION_NOT_SUPPORTED_ERROR', 505, context)
  }
}

export class VariantAlsoNegotiatesError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VARIANT_ALSO_NEGOTIATES_ERROR', 506, context)
  }
}

export class InsufficientStorageError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'INSUFFICIENT_STORAGE_ERROR', 507, context)
  }
}

export class LoopDetectedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'LOOP_DETECTED_ERROR', 508, context)
  }
}

export class NotExtendedError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'NOT_EXTENDED_ERROR', 510, context)
  }
}

export class NetworkAuthenticationRequiredError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'NETWORK_AUTHENTICATION_REQUIRED_ERROR', 511, context)
  }
}
