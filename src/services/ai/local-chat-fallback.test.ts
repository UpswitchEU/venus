import { describe, expect, it } from 'vitest'
import {
  detectAssistantIntent,
  generateContextAwareLocalResponse,
  isOfflineFallbackContent,
  resolveAssistantIntent,
} from './local-chat-fallback'
import type { AIChatRequest } from './AIChatService'

describe('isOfflineFallbackContent', () => {
  it('detects offline banner copy in nl and en', () => {
    expect(isOfflineFallbackContent('> **AI tijdelijk niet beschikbaar** — beperkt antwoord')).toBe(
      true
    )
    expect(isOfflineFallbackContent('> **AI temporarily unavailable** — limited answer')).toBe(true)
    expect(isOfflineFallbackContent('Normalised EBITDA bridge')).toBe(false)
  })
})

describe('detectAssistantIntent', () => {
  it('detects explain EBITDA quicklink text', () => {
    expect(detectAssistantIntent('Verklaar deze EBITDA')).toBe('explain_ebitda')
    expect(detectAssistantIntent('Leg de waarde uit')).toBe('explain_value')
  })
})

describe('resolveAssistantIntent', () => {
  it('keeps chip intent while the draft still matches', () => {
    expect(resolveAssistantIntent('Leg de waarde uit', 'explain_value')).toBe('explain_value')
  })

  it('drops stale chip intent when the user edits toward another intent', () => {
    expect(resolveAssistantIntent('Normaliseer eigenaarssalaris naar €60k', 'explain_value')).toBe(
      'suggest_normalizations'
    )
  })
})

describe('generateContextAwareLocalResponse', () => {
  const base: AIChatRequest = {
    message: 'Verklaar deze EBITDA',
    companyName: 'METAALBEWERKING M.A.C.',
    locale: 'nl',
    normalizations: [
      {
        status: 'accepted',
        ledgerCode: '610000',
        ledgerName: 'Services and other goods',
        adjustment: 240000,
        year: 2023,
        id: 'imported_sde_2023_610000_0',
      },
    ],
    formData: {
      _normalizationSummary: {
        total: 1,
        accepted: 1,
        pending: 0,
        totalAdjustment: 240000,
      },
    },
  }

  it('does not return generic normalization command pills for explain EBITDA', () => {
    const res = generateContextAwareLocalResponse(base)
    expect(res.fallback).toBe(true)
    expect(res.content).toContain('AI tijdelijk niet beschikbaar')
    expect(res.content).toContain('610000')
    expect(res.content).not.toContain('Normaliseer eigenaarssalaris naar €60k')
  })

  it('explains defensibility cap when user asks about the limit', () => {
    const res = generateContextAwareLocalResponse({
      ...base,
      message: 'Leg verdedigbaarheidslimiet uit',
      assistantIntent: 'explain_ebitda',
    })
    expect(res.content).toContain('Verdedigbaarheidslimiet')
    expect(res.content).toContain('Review vereist')
  })

  it('summarizes applied norms when user asks for normalizations', () => {
    const res = generateContextAwareLocalResponse({
      ...base,
      message: 'Stel normalisaties voor',
      assistantIntent: 'suggest_normalizations',
    })
    expect(res.content).toContain('Reeds toegepaste addbacks')
    expect(res.content).not.toContain('Eigenaarssalaris - Marktconform')
  })

  it('uses loaded report valuation summary for explain value offline fallback', () => {
    const res = generateContextAwareLocalResponse({
      ...base,
      message: 'Leg de waarde uit',
      companyName: 'Bakkerij Klaas',
      assistantIntent: 'explain_value',
      formData: {
        _valuationSummary: {
          valuation: 559_986,
          valuationLow: 428_000,
          valuationHigh: 617_000,
          recommendedAskingPrice: 617_000,
          normalizedEbitda: 100_000,
          multiple: 4.3,
        },
      },
    })

    expect(res.content).toContain('Bakkerij Klaas')
    expect(res.content).toContain('€559.986')
    expect(res.content).toContain('€428.000-€617.000')
    expect(res.content).toContain('Aanbevolen vraagprijs')
    expect(res.content).not.toContain('Open het rapport voor de waarderingsrange')
  })
})
