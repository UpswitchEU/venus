import { CLIENT_CONTEXT_HEADERS } from '../../constants/headers'
import type { BootstrapContext } from './types'

export interface TitanBootstrapClientContextSnapshot {
  contextHeaders: Record<string, string>
  relationshipId: string | null
}

export type TitanBootstrapClientContextStatus =
  | 'delegated'
  | 'incomplete'
  | 'missing-token-context'
  | 'none'

export interface TitanBootstrapRequestPolicy {
  clientContextStatus: TitanBootstrapClientContextStatus
  contextHeaderKeys: string[]
  hasAccountantUserId: boolean
  hasClientContextHeaders: boolean
  hasClientUserId: boolean
  hasRelationshipId: boolean
  headers: Record<string, string>
  invalidMode?: string
  partialDelegated: boolean
  requestBody: Record<string, unknown>
  validReportId?: string
}

interface TitanBootstrapRequestPolicyInput {
  clientContext: TitanBootstrapClientContextSnapshot | null
  context: BootstrapContext
  hasClientTokenHint: boolean
  traceId: string
}

function getValidMode(mode: unknown): 'edit' | 'view' | undefined {
  return mode === 'edit' || mode === 'view' ? mode : undefined
}

export function buildTitanBootstrapRequestPolicy({
  clientContext,
  context,
  hasClientTokenHint,
  traceId,
}: TitanBootstrapRequestPolicyInput): TitanBootstrapRequestPolicy {
  const validReportId = context.reportId?.trim() || undefined
  const validMode = getValidMode(context.mode)
  const invalidMode = typeof context.mode === 'string' && !validMode ? context.mode : undefined

  const requestBody: Record<string, unknown> = {
    reportId: validReportId,
    clientToken: context.clientToken,
    clientId: context.clientId,
    prefilledQuery: context.prefilledQuery,
    flow: context.flow,
    ...(validMode && { mode: validMode }),
    version: context.version,
    locale: context.locale,
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Correlation-ID': traceId,
  }

  const contextHeaders = clientContext?.contextHeaders ?? {}
  const clientHeader = contextHeaders[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]
  const accountantHeader = contextHeaders[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]
  const relationshipHeader = contextHeaders[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]
  const hasClientUserId = !!clientHeader
  const hasAccountantUserId = !!accountantHeader
  const hasRelationshipId = !!relationshipHeader
  const hasAnyContextHeader = hasClientUserId || hasAccountantUserId || hasRelationshipId
  const hasFullDelegatedHeaderSet = hasClientUserId && hasAccountantUserId && hasRelationshipId
  const partialDelegated = hasAccountantUserId && hasRelationshipId && !hasClientUserId

  let clientContextStatus: TitanBootstrapClientContextStatus = 'none'
  if (hasFullDelegatedHeaderSet || partialDelegated) {
    Object.assign(headers, contextHeaders)
    clientContextStatus = 'delegated'
  } else if (hasAnyContextHeader) {
    clientContextStatus = 'incomplete'
    if (!requestBody.clientId && clientContext?.relationshipId) {
      requestBody.clientId = clientContext.relationshipId
    }
  } else if (clientContext && (hasClientTokenHint || !!context.clientToken)) {
    clientContextStatus = 'missing-token-context'
  }

  const contextHeaderKeys = Object.keys(headers).filter((key) => key.toLowerCase().startsWith('x-'))

  return {
    clientContextStatus,
    contextHeaderKeys,
    hasAccountantUserId,
    hasClientContextHeaders: hasClientUserId || hasAccountantUserId || hasRelationshipId,
    hasClientUserId,
    hasRelationshipId,
    headers,
    invalidMode,
    partialDelegated,
    requestBody,
    validReportId,
  }
}
