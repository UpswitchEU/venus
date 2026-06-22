import { getBootstrapCacheLookupKey } from './contextCacheKey'
import type { TitanBootstrapResponsePayload } from './TitanBootstrapResponseMapper'
import type { BootstrapContext, SessionBootstrapState } from './types'

interface BootstrapCacheSnapshot {
  lastSuccessfulResult: SessionBootstrapState | null
  lastSuccessfulAt: number
  lastSuccessfulCacheKey: string | null
}

interface BootstrapCacheLookupInput extends BootstrapCacheSnapshot {
  contextOrReportId?: BootstrapContext | string
  now: number
  scopeProvided: boolean
  ttlMs: number
}

export function pruneBootstrapCallTimestamps(
  callTimestamps: readonly number[],
  now: number,
  windowMs: number
): number[] {
  return callTimestamps.filter((timestamp) => now - timestamp < windowMs)
}

export function shouldTripBootstrapCircuitBreaker(
  callTimestamps: readonly number[],
  maxCallsInWindow: number
): boolean {
  return callTimestamps.length >= maxCallsInWindow
}

export function buildBootstrapCircuitBreakerMessage(callCount: number, windowMs: number): string {
  return `[Bootstrap] Circuit breaker: ${callCount} calls in ${windowMs / 1000}s window — refusing further calls`
}

export function buildTitanBootstrapCacheKey(cacheKey: string): string {
  return `titan:${cacheKey}`
}

function hasFreshBootstrapResult({
  lastSuccessfulAt,
  lastSuccessfulResult,
  now,
  ttlMs,
}: BootstrapCacheSnapshot & {
  now: number
  ttlMs: number
}): boolean {
  return lastSuccessfulResult !== null && now - lastSuccessfulAt < ttlMs
}

function doesBootstrapCacheScopeMatch({
  contextOrReportId,
  lastSuccessfulCacheKey,
  scopeProvided,
}: Pick<
  BootstrapCacheLookupInput,
  'contextOrReportId' | 'lastSuccessfulCacheKey' | 'scopeProvided'
>): boolean {
  if (!scopeProvided) return true
  return lastSuccessfulCacheKey === getBootstrapCacheLookupKey(contextOrReportId)
}

export function hasCompletedBootstrapFor(input: BootstrapCacheLookupInput): boolean {
  return hasFreshBootstrapResult(input) && doesBootstrapCacheScopeMatch(input)
}

export function getScopedBootstrapCachedResult(
  input: BootstrapCacheLookupInput
): SessionBootstrapState | null {
  if (!hasCompletedBootstrapFor(input)) {
    return null
  }

  return input.lastSuccessfulResult
}

export interface TitanBootstrapFailureDiagnostic {
  code: string
  message: string
  retryable: boolean
}

export type TitanBootstrapFailureError = Error & {
  code?: string
  retryable?: boolean
}

type TitanBootstrapFailurePayload = Pick<
  TitanBootstrapResponsePayload,
  'error' | 'errorInfo' | 'success'
>

export function getTitanBootstrapFailureDiagnostic(
  data: TitanBootstrapFailurePayload
): TitanBootstrapFailureDiagnostic | null {
  if (!data.errorInfo) return null

  return {
    code: data.errorInfo.code,
    message: data.errorInfo.message,
    retryable: data.errorInfo.retryable,
  }
}

export function buildTitanBootstrapFailureError(
  data: TitanBootstrapFailurePayload
): TitanBootstrapFailureError {
  const diagnostic = getTitanBootstrapFailureDiagnostic(data)
  const errorCode = diagnostic?.code ?? 'UNKNOWN'
  const retryable = diagnostic?.retryable ?? false
  const message = diagnostic
    ? `[${errorCode}] ${diagnostic.message}${retryable ? ' (retryable)' : ''}`
    : data.error || 'Bootstrap returned no data'

  const error = new Error(message) as TitanBootstrapFailureError
  error.code = errorCode
  error.retryable = retryable
  return error
}
