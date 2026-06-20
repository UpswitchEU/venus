export type AssistantIntent =
  | 'explain_ebitda'
  | 'explain_value'
  | 'suggest_normalizations'
  | 'general'

export interface AIChatRequest {
  message: string
  sessionId?: string
  reportId?: string
  companyName?: string
  conversationId?: string
  fieldContext?: {
    field: string
    label: string
    value?: unknown
    hint?: string
  }
  normalizations?: unknown[]
  formData?: unknown
  stream?: boolean
  /** When true, completes a stream turn that already charged + persisted the user message. */
  recoverFromStreamTurn?: boolean
  /** Titan tool-scope claim. Venus defaults to owner-scope in the BFF. */
  audience?: 'advisor' | 'owner'
  /** Advisor workspace turn routing (add client / registry lookup). */
  surfaceIntent?: 'add_client' | 'kbo_lookup'
  /** Venus quicklink / chip intent for M&A copilot routing. */
  assistantIntent?: AssistantIntent
  /** Locale for fallback responses when AI is unavailable. */
  locale?: 'en' | 'nl' | 'fr'
  /** Previous messages for conversation context (used as fallback if server history unavailable) */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}
