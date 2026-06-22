import type { InternalAxiosRequestConfig } from 'axios'
import { isNetworkError } from '../../../utils/errors/errorGuards'
import type { APIRequestConfig } from '../HttpClient'
import { asSessionRecord, type SessionRecord } from './SessionApiNormalization'

export const SESSION_GET_TIMEOUT_MS = 30_000
export const SESSION_GET_MAX_RETRIES = 3
export const SESSION_GET_BASE_RETRY_DELAY_MS = 1000

export type AxiosLikeError = {
  code?: string
  message?: string
  response?: {
    data?: SessionRecord | string
    headers?: Record<string, string | undefined>
    status?: number
  }
}

export function toAxiosLikeError(error: unknown): AxiosLikeError {
  return asSessionRecord(error) ? (error as AxiosLikeError) : {}
}

export function isHttpStatus(error: unknown, status: number): boolean {
  return toAxiosLikeError(error).response?.status === status
}

export function isTimeoutLikeError(error: unknown): boolean {
  const axiosError = toAxiosLikeError(error)
  const message = axiosError.message?.toLowerCase() ?? ''
  return (
    axiosError.code === 'ECONNABORTED' ||
    axiosError.code === 'ERR_CANCELED' ||
    message.includes('timeout') ||
    message.includes('canceled') ||
    message.includes('cancelled') ||
    message.includes('aborted')
  )
}

export function buildGetValuationSessionOptions(options?: APIRequestConfig): APIRequestConfig {
  return {
    ...options,
    timeout: SESSION_GET_TIMEOUT_MS,
    retry: options?.retry ?? { maxRetries: 0 },
  }
}

export function getValuationSessionRetryDelay(attempt: number): number {
  return SESSION_GET_BASE_RETRY_DELAY_MS * Math.pow(2, attempt)
}

export function shouldRetryGetValuationSession(error: unknown, attempt: number): boolean {
  return attempt < SESSION_GET_MAX_RETRIES && (isNetworkError(error) || isTimeoutLikeError(error))
}

export function requestConfig(config: {
  data?: unknown
  headers?: Record<string, string>
  method: string
  url: string
}): InternalAxiosRequestConfig {
  return {
    ...config,
    headers: config.headers ?? {},
  } as unknown as InternalAxiosRequestConfig
}

export function responseMessage(error: AxiosLikeError): string | undefined {
  const data = asSessionRecord(error.response?.data)
  return typeof data?.message === 'string' ? data.message : error.message
}
