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

const TRANSIENT_SESSION_PATCH_RETRY_DELAYS_MS = [500, 1500] as const

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
  const gateReady = await awaitSessionPoolPressureGate({ maxWaitMs: 120_000 })
  if (!gateReady) {
    const deferred = Object.assign(new Error('Session PATCH deferred: database pool pressure'), {
      response: { status: 503 },
    })
    throw deferred
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      const patchOptions: APIRequestConfig = {
        ...options,
        timeout: options?.timeout ?? SESSION_PATCH_TIMEOUT_MS,
        retry: options?.retry ?? { maxRetries: 0 },
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
      const retryDelay = TRANSIENT_SESSION_PATCH_RETRY_DELAYS_MS[attempt]
      if (!isTransientSessionPatchError(error) || retryDelay == null) {
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
