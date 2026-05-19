import type { InternalAxiosRequestConfig } from 'axios'
import { asSessionRecord, type SessionRecord } from './SessionApiNormalization'

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
  return axiosError.code === 'ECONNABORTED' || !!axiosError.message?.includes('timeout')
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
