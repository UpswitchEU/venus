import { getMercuryUrl } from '../../utils/getMercuryUrl'
import { VENUS_BOOTSTRAP_CLIENT_ABORT_MS } from './bootstrapProxyTimeouts'
import { BOOTSTRAP_TIMEOUT_USER_MESSAGE } from './bootstrapUserMessages'
import { AuthenticationRequiredError } from './resolvers/AuthResolver'
import type { TitanBootstrapResponsePayload } from './TitanBootstrapResponseMapper'

type BootstrapTransportLogger = Pick<Console, 'error' | 'info' | 'warn'>

export interface TitanBootstrapFetchResult {
  data: TitanBootstrapResponsePayload
  responseStatus: number
}

interface TitanBootstrapTransportContext {
  bootstrapAbortControllers: Set<AbortController>
  getCancellationEpoch: () => number
  logger: BootstrapTransportLogger
  responseAbortControllers: WeakMap<Response, AbortController>
}

interface TitanBootstrapPayloadRequest extends TitanBootstrapTransportContext {
  headers: Record<string, string>
  requestBody: Record<string, unknown>
  startTime: number
  traceId: string
}

const CLIENT_MAX_RETRIES = 2
const CLIENT_RETRY_BASE_DELAY_MS = 500
const STRUCTURED_ERROR_MAX_RETRIES = 1
const STRUCTURED_ERROR_RETRY_BASE_DELAY_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getClientBodyBudgetMs(startTime: number): number {
  return Math.max(1_000, VENUS_BOOTSTRAP_CLIENT_ABORT_MS - (performance.now() - startTime))
}

function throwIfBootstrapRequestCancelled(
  getCancellationEpoch: () => number,
  cancellationEpoch: number
): void {
  if (cancellationEpoch !== getCancellationEpoch()) {
    throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function releaseResponseAbortController(
  responseAbortControllers: WeakMap<Response, AbortController>,
  bootstrapAbortControllers: Set<AbortController>,
  response?: Response
): void {
  if (!response) return
  const controller = responseAbortControllers.get(response)
  if (!controller) return
  bootstrapAbortControllers.delete(controller)
  responseAbortControllers.delete(response)
}

export async function makeBootstrapRequest({
  bootstrapAbortControllers,
  getCancellationEpoch,
  headers,
  logger,
  requestBody,
  responseAbortControllers,
  traceId,
}: Omit<TitanBootstrapPayloadRequest, 'startTime'>): Promise<Response> {
  const cancellationEpoch = getCancellationEpoch()

  for (let attempt = 0; attempt < CLIENT_MAX_RETRIES; attempt++) {
    throwIfBootstrapRequestCancelled(getCancellationEpoch, cancellationEpoch)

    const controller = new AbortController()
    bootstrapAbortControllers.add(controller)
    const timeoutId = setTimeout(() => controller.abort(), VENUS_BOOTSTRAP_CLIENT_ABORT_MS)

    try {
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (
        response.status >= 500 &&
        response.status !== 503 &&
        response.status !== 504 &&
        attempt < CLIENT_MAX_RETRIES - 1
      ) {
        bootstrapAbortControllers.delete(controller)
        const retryDelay = CLIENT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn(
          `[Bootstrap:${traceId}] Server error ${response.status} on attempt ${attempt + 1}/${CLIENT_MAX_RETRIES}, retrying in ${retryDelay}ms`
        )
        await delay(retryDelay)
        throwIfBootstrapRequestCancelled(getCancellationEpoch, cancellationEpoch)
        continue
      }

      if (response.status === 408 && attempt < CLIENT_MAX_RETRIES - 1) {
        bootstrapAbortControllers.delete(controller)
        const retryDelay = CLIENT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn(
          `[Bootstrap:${traceId}] Timeout ${response.status} on attempt ${attempt + 1}/${CLIENT_MAX_RETRIES}, retrying in ${retryDelay}ms`
        )
        await delay(retryDelay)
        throwIfBootstrapRequestCancelled(getCancellationEpoch, cancellationEpoch)
        continue
      }

      responseAbortControllers.set(response, controller)
      return response
    } catch (fetchError) {
      clearTimeout(timeoutId)
      bootstrapAbortControllers.delete(controller)

      if (isAbortError(fetchError)) {
        throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
      }

      if (fetchError instanceof Error && fetchError.message === BOOTSTRAP_TIMEOUT_USER_MESSAGE) {
        throw fetchError
      }

      if (attempt < CLIENT_MAX_RETRIES - 1) {
        const retryDelay = CLIENT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn(
          `[Bootstrap:${traceId}] Network error on attempt ${attempt + 1}/${CLIENT_MAX_RETRIES}, retrying in ${retryDelay}ms`
        )
        await delay(retryDelay)
        throwIfBootstrapRequestCancelled(getCancellationEpoch, cancellationEpoch)
        continue
      }

      throw fetchError
    }
  }

  throw new Error('Bootstrap failed after all retries')
}

export async function readResponseBodyWithinClientBudget<T>({
  bootstrapAbortControllers,
  label,
  logger,
  operation,
  response,
  responseAbortControllers,
  startTime,
  traceId,
}: Pick<
  TitanBootstrapPayloadRequest,
  'bootstrapAbortControllers' | 'logger' | 'responseAbortControllers' | 'startTime' | 'traceId'
> & {
  label: string
  operation: () => Promise<T>
  response?: Response
}): Promise<T> {
  const timeoutMs = getClientBodyBudgetMs(startTime)
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const controller = response ? responseAbortControllers.get(response) : undefined

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          logger.warn(`[Bootstrap:${traceId}] Response ${label} exceeded client budget`, {
            timeoutMs: Math.round(timeoutMs),
          })
          controller?.abort()
          reject(new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE))
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
    }
    throw error
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    releaseResponseAbortController(responseAbortControllers, bootstrapAbortControllers, response)
  }
}

function buildAuthenticationRedirectUrl(): string {
  const mercuryUrl = getMercuryUrl()
  const locale =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/(en|nl|fr)\//)?.[1] || 'en'
      : 'en'
  const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
  return `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
}

async function fetchTitanBootstrapPayloadOnce(
  request: TitanBootstrapPayloadRequest
): Promise<TitanBootstrapFetchResult> {
  const apiStart = performance.now()
  const response = await makeBootstrapRequest(request)
  const apiMs = Math.round(performance.now() - apiStart)
  request.logger.info(`[Bootstrap:${request.traceId}] Titan API request complete`, {
    durationMs: apiMs,
    status: response.status,
  })

  if (!response.ok) {
    const lastErrorText = await readResponseBodyWithinClientBudget({
      ...request,
      operation: () => response.text(),
      label: 'error body',
      response,
    })
    request.logger.error('[Bootstrap] Bootstrap API failed', {
      status: response.status,
      statusText: response.statusText,
      error: lastErrorText.substring(0, 200),
    })
    if (response.status === 401) {
      throw new AuthenticationRequiredError(
        'Session expired or authentication required',
        buildAuthenticationRedirectUrl()
      )
    }
    if (response.status === 504 || response.status === 408 || response.status === 503) {
      throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
    }
    throw new Error(`Bootstrap API failed (${response.status}): ${lastErrorText.substring(0, 100)}`)
  }

  try {
    return {
      data: await readResponseBodyWithinClientBudget({
        ...request,
        operation: () => response.json() as Promise<TitanBootstrapResponsePayload>,
        label: 'JSON body',
        response,
      }),
      responseStatus: response.status,
    }
  } catch (error) {
    if (error instanceof Error && error.message === BOOTSTRAP_TIMEOUT_USER_MESSAGE) {
      throw error
    }
    throw new Error('Invalid response from bootstrap service')
  }
}

function shouldRetryStructuredBootstrapError(
  data: TitanBootstrapResponsePayload,
  attempt: number
): boolean {
  if (data.success) return false
  if (attempt >= STRUCTURED_ERROR_MAX_RETRIES) return false
  if (!data.errorInfo?.retryable) return false
  if (data.data?.creditStatus && !data.data.creditStatus.allowed) return false
  return true
}

export async function fetchTitanBootstrapPayloadWithStructuredRetry(
  request: TitanBootstrapPayloadRequest
): Promise<TitanBootstrapFetchResult> {
  const cancellationEpoch = request.getCancellationEpoch()

  for (let attempt = 0; ; attempt += 1) {
    throwIfBootstrapRequestCancelled(request.getCancellationEpoch, cancellationEpoch)

    const result = await fetchTitanBootstrapPayloadOnce(request)
    if (!shouldRetryStructuredBootstrapError(result.data, attempt)) {
      return result
    }

    const delayMs = STRUCTURED_ERROR_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
    request.logger.warn(`[Bootstrap:${request.traceId}] Retryable structured error from Titan`, {
      code: result.data.errorInfo?.code,
      attempt: attempt + 1,
      maxAttempts: STRUCTURED_ERROR_MAX_RETRIES + 1,
      delayMs,
    })
    await delay(delayMs)
    throwIfBootstrapRequestCancelled(request.getCancellationEpoch, cancellationEpoch)
  }
}
