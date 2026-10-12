import type { AxiosRequestConfig } from 'axios'
import {
  awaitSessionPoolPressureGate,
  recordSessionPoolPressureFromHttpError,
  recordSuccessfulSessionPatch,
} from '../../../hooks/sessionPoolPressureCircuit'
import type { APIRequestConfig } from '../HttpClient'
import { requestConfig } from './SessionApiHttp'
/** Align with Titan/Supabase pool checkout (~15s) plus network margin. */
export const SESSION_PATCH_TIMEOUT_MS = 20_000

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
  const deadline =
    Date.now() + Math.min(options?.timeout ?? SESSION_PATCH_DEADLINE_MS, SESSION_PATCH_DEADLINE_MS)
  const gateReady = await awaitSessionPoolPressureGate({
    maxWaitMs: Math.max(0, deadline - Date.now()),
  })
  if (!gateReady) {
    const deferred = Object.assign(new Error('Session PATCH deferred: database pool pressure'), {
      response: { status: 503 },
    })
    throw deferred
  }

  // The report coordinator owns retries and their visible cooldown. A second
  // transport loop would multiply attempts and hide the real recovery state.
  try {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('Session PATCH deadline exceeded')
    const response = await executeRequest(
      requestConfig({
        method: 'PATCH',
        url: `/api/v2/valuations/sessions/${reportId}`,
        data: patchBody,
        headers: {},
      }),
      {
        ...options,
        timeout: Math.min(remaining, SESSION_PATCH_TIMEOUT_MS),
        retry: { maxRetries: 0 },
      }
    )
    recordSuccessfulSessionPatch()
    return response
  } catch (error) {
    recordSessionPoolPressureFromHttpError(error)
    throw error
  }
}
