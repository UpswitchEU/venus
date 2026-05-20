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
export function getTitanClientContextHeaders(
  request: RequestWithHeaders
): Record<string, string> {
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

  return headers
}
