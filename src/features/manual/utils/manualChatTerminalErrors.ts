import type { ChatMessage } from '@/components/calculator'

export type ManualChatTerminalErrorTranslationKey =
  | 'authRequired'
  | 'chatError'
  | 'consentRequired'
  | 'quotaExhausted'

type ManualChatTerminalErrorTranslator = (key: ManualChatTerminalErrorTranslationKey) => string

export type ManualChatTerminalErrorPatch = {
  content: string
  isError: true
} & Partial<Pick<ChatMessage, 'consentPolicyVersion' | 'requiresAuth' | 'requiresConsent'>>

export type ManualChatTerminalErrorState =
  | { kind: 'auth'; message?: string | null }
  | { kind: 'consent'; currentPolicyVersion?: string; message?: string | null }
  | { kind: 'generic'; message?: string | null }
  | { kind: 'quota' }

interface ManualChatAIResponseErrorEnvelope {
  currentPolicyVersion?: string
  error?: string
  requires_auth?: boolean
  requires_consent?: boolean
  requires_upgrade?: boolean
  success?: boolean
}

function messageOrFallback(
  message: string | null | undefined,
  fallbackKey: ManualChatTerminalErrorTranslationKey,
  translate: ManualChatTerminalErrorTranslator
): string {
  const trimmedMessage = message?.trim()
  return trimmedMessage && trimmedMessage.length > 0 ? trimmedMessage : translate(fallbackKey)
}

export function buildManualChatTerminalErrorPatch(
  state: ManualChatTerminalErrorState,
  translate: ManualChatTerminalErrorTranslator
): ManualChatTerminalErrorPatch {
  switch (state.kind) {
    case 'auth':
      return {
        content: messageOrFallback(state.message, 'authRequired', translate),
        isError: true,
        requiresAuth: true,
      }
    case 'consent':
      return {
        content: messageOrFallback(state.message, 'consentRequired', translate),
        isError: true,
        requiresConsent: true,
        consentPolicyVersion: state.currentPolicyVersion,
      }
    case 'generic':
      return {
        content: messageOrFallback(state.message, 'chatError', translate),
        isError: true,
      }
    case 'quota':
      return {
        content: translate('quotaExhausted'),
        isError: true,
      }
  }
}

export function buildManualChatTerminalErrorPatchFromAIResponse(
  response: ManualChatAIResponseErrorEnvelope,
  translate: ManualChatTerminalErrorTranslator
): ManualChatTerminalErrorPatch | null {
  if (response.requires_upgrade) {
    return buildManualChatTerminalErrorPatch({ kind: 'quota' }, translate)
  }

  if (response.requires_consent) {
    return buildManualChatTerminalErrorPatch(
      {
        kind: 'consent',
        message: response.error,
        currentPolicyVersion: response.currentPolicyVersion,
      },
      translate
    )
  }

  if (response.requires_auth) {
    return buildManualChatTerminalErrorPatch({ kind: 'auth', message: response.error }, translate)
  }

  if (response.success === false && response.error) {
    return buildManualChatTerminalErrorPatch(
      { kind: 'generic', message: response.error },
      translate
    )
  }

  return null
}
