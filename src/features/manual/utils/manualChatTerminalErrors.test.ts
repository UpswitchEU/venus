// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualChatTerminalErrorPatch,
  buildManualChatTerminalErrorPatchFromAIResponse,
  type ManualChatTerminalErrorTranslationKey,
} from './manualChatTerminalErrors'

const translations: Record<ManualChatTerminalErrorTranslationKey, string> = {
  authRequired: 'Please sign in again',
  chatError: 'Something went wrong',
  consentRequired: 'Please grant AI consent',
  quotaExhausted: 'Your AI credits are exhausted',
}

function translate(key: ManualChatTerminalErrorTranslationKey): string {
  return translations[key]
}

describe('manualChatTerminalErrors', () => {
  it('builds a quota patch', () => {
    expect(buildManualChatTerminalErrorPatch({ kind: 'quota' }, translate)).toEqual({
      content: 'Your AI credits are exhausted',
      isError: true,
    })
  })

  it('builds a consent patch with policy version and fallback content', () => {
    expect(
      buildManualChatTerminalErrorPatch(
        { kind: 'consent', message: '   ', currentPolicyVersion: '2026-05' },
        translate
      )
    ).toEqual({
      content: 'Please grant AI consent',
      isError: true,
      requiresConsent: true,
      consentPolicyVersion: '2026-05',
    })
  })

  it('builds an auth patch with server-provided content', () => {
    expect(
      buildManualChatTerminalErrorPatch({ kind: 'auth', message: 'Session expired' }, translate)
    ).toEqual({
      content: 'Session expired',
      isError: true,
      requiresAuth: true,
    })
  })

  it('maps non-streaming AI envelopes to terminal patches in precedence order', () => {
    expect(
      buildManualChatTerminalErrorPatchFromAIResponse(
        {
          requires_upgrade: true,
          requires_consent: true,
          error: 'Consent needed',
        },
        translate
      )
    ).toEqual({
      content: 'Your AI credits are exhausted',
      isError: true,
    })

    expect(
      buildManualChatTerminalErrorPatchFromAIResponse(
        {
          requires_consent: true,
          error: 'Consent needed',
          currentPolicyVersion: '2026-05',
        },
        translate
      )
    ).toEqual({
      content: 'Consent needed',
      isError: true,
      requiresConsent: true,
      consentPolicyVersion: '2026-05',
    })
  })

  it('returns null for successful AI envelopes', () => {
    expect(buildManualChatTerminalErrorPatchFromAIResponse({}, translate)).toBeNull()
  })

  it('maps a failed AI envelope with a message to a visible generic error patch', () => {
    expect(
      buildManualChatTerminalErrorPatchFromAIResponse(
        {
          success: false,
          error: 'AI backend is not reachable at http://localhost:3002.',
        },
        translate
      )
    ).toEqual({
      content: 'AI backend is not reachable at http://localhost:3002.',
      isError: true,
    })
  })
})
