import type { UpdateValuationSessionResponse } from '../../../types/api-responses'
import { apiLogger } from '../../../utils/logger'
import { isHttpStatus, responseMessage, toAxiosLikeError } from './SessionApiHttp'
import {
  delay,
  emptyOptimisticUpdate,
  normalizeUpdateSessionResponse,
} from './SessionApiPatchHelpers'

const RATE_LIMIT_PATCH_RETRY_DELAYS_MS = [1000, 2000] as const

export async function retryRateLimitedSessionPatch({
  isCriticalUpdate,
  patchSession,
  reportId,
  updateKeys,
}: {
  isCriticalUpdate: boolean
  patchSession: () => Promise<unknown>
  reportId: string
  updateKeys: string[]
}): Promise<UpdateValuationSessionResponse> {
  apiLogger.warn('Rate limit hit during session update, retrying with backoff', {
    reportId,
    updateKeys,
  })

  let lastRateLimitError: unknown

  for (let attempt = 0; attempt < RATE_LIMIT_PATCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const retryDelay = RATE_LIMIT_PATCH_RETRY_DELAYS_MS[attempt]
    await delay(retryDelay)

    try {
      const retriedResponse = await patchSession()
      return normalizeUpdateSessionResponse(retriedResponse)
    } catch (retryError) {
      if (!isHttpStatus(retryError, 429)) {
        throw retryError
      }

      lastRateLimitError = retryError
      apiLogger.warn('Rate limit retry failed during session update', {
        reportId,
        attempt: attempt + 1,
        retryDelay,
        retryAfter: toAxiosLikeError(retryError).response?.headers?.['retry-after'],
        message: responseMessage(toAxiosLikeError(retryError)),
      })
    }
  }

  if (!isCriticalUpdate) {
    apiLogger.warn(
      'Rate limit retries exhausted for non-critical update, returning optimistic success',
      {
        reportId,
        updateKeys,
      }
    )
    return emptyOptimisticUpdate()
  }

  throw lastRateLimitError ?? new Error('Rate limit retries exhausted during session update')
}
