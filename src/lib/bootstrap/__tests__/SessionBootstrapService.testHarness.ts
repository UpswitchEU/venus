import { vi } from 'vitest'
import { BOOTSTRAP_TIMEOUT_USER_MESSAGE } from '../bootstrapUserMessages'
import { SessionBootstrapService } from '../SessionBootstrapService'
import {
  fetchTitanBootstrapPayloadWithStructuredRetry,
  makeBootstrapRequest,
  readResponseBodyWithinClientBudget,
} from '../TitanBootstrapClient'
import type { BootstrapContext, SessionBootstrapState } from '../types'

export const mockAuthResolver = {
  resolve: vi.fn(),
}

export const mockSessionResolver = {
  resolve: vi.fn(),
}

export const mockPrefillResolver = {
  resolve: vi.fn(),
}

type SessionBootstrapServiceConstructorArgs = ConstructorParameters<typeof SessionBootstrapService>

export function createSessionBootstrapService(): SessionBootstrapService {
  return new SessionBootstrapService(
    mockAuthResolver as unknown as SessionBootstrapServiceConstructorArgs[0],
    mockSessionResolver as unknown as SessionBootstrapServiceConstructorArgs[1],
    mockPrefillResolver as unknown as SessionBootstrapServiceConstructorArgs[2]
  )
}

export function resetSessionBootstrapHarness(): SessionBootstrapService {
  vi.clearAllMocks()
  return createSessionBootstrapService()
}

export function restoreSessionBootstrapHarness() {
  vi.useRealTimers()
  vi.restoreAllMocks()
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function getTransportContext(service: SessionBootstrapService) {
  const internals = service as unknown as {
    bootstrapAbortControllers: Set<AbortController>
    bootstrapCancellationEpoch: number
    responseAbortControllers: WeakMap<Response, AbortController>
  }
  return {
    bootstrapAbortControllers: internals.bootstrapAbortControllers,
    getCancellationEpoch: () => internals.bootstrapCancellationEpoch,
    logger: console,
    responseAbortControllers: internals.responseAbortControllers,
  }
}

export {
  BOOTSTRAP_TIMEOUT_USER_MESSAGE,
  fetchTitanBootstrapPayloadWithStructuredRetry,
  makeBootstrapRequest,
  readResponseBodyWithinClientBudget,
}
export type { BootstrapContext, SessionBootstrapService, SessionBootstrapState }
