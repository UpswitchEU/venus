import { useClientContext } from '../../stores/clientContext'
import type { AIChatRequest, AssistantIntent } from './AIChatTypes'

export interface AIChatRequestPayload {
  message: string
  sessionId?: string
  reportId?: string
  companyName?: string
  conversationId?: string
  fieldContext?: AIChatRequest['fieldContext']
  normalizations?: unknown[]
  formData?: unknown
  stream: boolean
  recoverFromStreamTurn?: true
  audience?: AIChatRequest['audience']
  surfaceIntent?: AIChatRequest['surfaceIntent']
  assistantIntent?: AssistantIntent
  locale?: AIChatRequest['locale']
  history?: AIChatRequest['history']
}

export function generateAiChatCorrelationId(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomUUID().split('-')[0]
  return `cid_${timestamp}_${random}`
}

export function getAIChatRequestHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Correlation-ID': generateAiChatCorrelationId(),
  }
  if (includeContentType) headers['Content-Type'] = 'application/json'
  const contextHeaders = useClientContext.getState().getContextHeaders()
  if (Object.keys(contextHeaders).length > 0) {
    Object.assign(headers, contextHeaders)
  }
  return headers
}

export function buildAIChatRequestPayload(
  request: AIChatRequest,
  options: { stream: boolean }
): AIChatRequestPayload {
  return {
    message: request.message,
    sessionId: request.sessionId,
    reportId: request.reportId || request.sessionId,
    companyName: request.companyName,
    conversationId: request.conversationId,
    fieldContext: request.fieldContext,
    normalizations: request.normalizations,
    formData: request.formData,
    stream: options.stream,
    ...(!options.stream && request.recoverFromStreamTurn ? { recoverFromStreamTurn: true } : {}),
    audience: request.audience,
    surfaceIntent: request.surfaceIntent,
    assistantIntent: request.assistantIntent,
    locale: request.locale,
    history: request.history,
  }
}
