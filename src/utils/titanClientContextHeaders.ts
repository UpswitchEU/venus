import { CLIENT_CONTEXT_HEADERS, LEGACY_CLIENT_CONTEXT_HEADERS } from '@/constants/headers'

type RequestWithHeaders = Pick<Request, 'headers'>

function getTrimmedHeader(request: RequestWithHeaders, name: string): string | null {
  const value = request.headers.get(name)
  return value?.trim() || null
}

/**
 * Build canonical client-context headers for Venus -> Titan BFF hops.
 *
 * Venus accepts both the current canonical header names and the older Mercury
 * aliases, but always emits canonical names to Titan. Keeping this in one
 * place prevents AI-side routes from drifting apart.
 */
export function getTitanClientContextHeaders(request: RequestWithHeaders): Record<string, string> {
  const headers: Record<string, string> = {}
  const clientUserId =
    getTrimmedHeader(request, CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID) ||
    getTrimmedHeader(request, LEGACY_CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID)
  const accountantUserId =
    getTrimmedHeader(request, CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID) ||
    getTrimmedHeader(request, LEGACY_CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID)
  const relationshipId =
    getTrimmedHeader(request, CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID) ||
    getTrimmedHeader(request, LEGACY_CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID)

  if (clientUserId) headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientUserId
  if (accountantUserId) headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = accountantUserId
  if (relationshipId) headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = relationshipId

  const correlationId = getTrimmedHeader(request, 'x-correlation-id')
  const journeyId = getTrimmedHeader(request, 'x-journey-id')
  const traceparent = getTrimmedHeader(request, 'traceparent')
  if (correlationId && correlationId.length <= 160) {
    headers['x-correlation-id'] = correlationId
  }
  if (
    journeyId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(journeyId)
  ) {
    headers['x-journey-id'] = journeyId.toLowerCase()
  }
  if (traceparent && /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/i.test(traceparent)) {
    headers.traceparent = traceparent.toLowerCase()
  }

  return headers
}
