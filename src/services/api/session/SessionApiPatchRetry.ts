import type { AxiosRequestConfig } from 'axios'
import {
  awaitSessionPoolPressureGate,
  recordSessionPoolPressureFromHttpError,
  recordSuccessfulSessionPatch,
} from '../../../hooks/sessionPoolPressureCircuit'
import { apiLogger } from '../../../utils/logger'
import type { APIRequestConfig } from '../HttpClient'
import { requestConfig, toAxiosLikeError } from './SessionApiHttp'
import {
  delay,
  isTransientSessionPatchError,
  transientSessionPatchMessage,
} from './SessionApiPatchHelpers'

/** Align with Titan/Supabase pool checkout (~15s) plus network margin. */
export const SESSION_PATCH_TIMEOUT_MS = 20_000

const TRANSIENT_SESSION_PATCH_RETRY_DELAYS_MS = [500] as const
const SESSION_PATCH_DEADLINE_MS = 30_000

export type ExecuteSessionPatchRequest = (
  config: AxiosRequestConfig,
  options?: APIRequestConfig
) => Promise<unknown>

export async function patchValuationSessionWithTransientRetry({
  executeRequest,
  options,
  patchBody,
  reportId,
}: {
  executeRequest: ExecuteSessionPatchRequest
  options?: APIRequestConfig
  patchBody: Record<string, unknown>
  reportId: string
}): Promise<unknown> {
  const deadline = Date.now() + Math.min(options?.timeout ?? SESSION_PATCH_DEADLINE_MS, SESSION_PATCH_DEADLINE_MS)
  const gateReady = await awaitSessionPoolPressureGate({ maxWaitMs: Math.max(0, deadline - Date.now()) })
  if (!gateReady) {
    const deferred = Object.assign(new Error('Session PATCH deferred: database pool pressure'), {
      response: { status: 503 },
    })
    throw deferred
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('Session PATCH deadline exceeded')
      const patchOptions: APIRequestConfig = {
        ...options,
        timeout: Math.min(remaining, SESSION_PATCH_TIMEOUT_MS),
        retry: { maxRetries: 0 },
      }
      const response = await executeRequest(
        requestConfig({
          method: 'PATCH',
          url: `/api/v2/valuations/sessions/${reportId}`,
          data: patchBody,
          headers: {},
        }),
        patchOptions
      )
      recordSuccessfulSessionPatch()
      return response
    } catch (error) {
      recordSessionPoolPressureFromHttpError(error)
      const status = toAxiosLikeError(error).response?.status
      const retryAfter = Number(toAxiosLikeError(error).response?.headers?.['retry-after'])
      const retryDelay = attempt === 0 && status === 429
        ? (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000)
        : TRANSIENT_SESSION_PATCH_RETRY_DELAYS_MS[attempt]
      if ((!isTransientSessionPatchError(error) && status !== 429) || status === 503 || status === 504 || retryDelay == null || Date.now() + retryDelay >= deadline) {
        throw error
      }
      apiLogger.warn('Transient session PATCH failed, retrying', {
        reportId,
        attempt: attempt + 1,
        retryDelay,
        status: toAxiosLikeError(error).response?.status,
        message: transientSessionPatchMessage(error),
      })
      await delay(retryDelay)
    }
  }
}
