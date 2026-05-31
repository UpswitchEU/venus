// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChatMessage, NormalizationItem } from '@/components/calculator'
import {
  buildManualAIChatRequest,
  buildManualChatEnrichedFormData,
  buildManualChatHistory,
  buildManualChatValuationSummary,
  getManualChatLocale,
  getManualChatVersionCount,
} from './manualChatRequestContext'

const now = new Date('2026-05-15T10:00:00.000Z')

function message(role: ChatMessage['role'], content: string, index: number): ChatMessage {
  return {
    id: `m-${index}`,
    role,
    content,
    timestamp: now,
  }
}

function normalization(overrides: Partial<NormalizationItem>): NormalizationItem {
  return {
    id: overrides.id ?? 'n-1',
    ledgerCode: overrides.ledgerCode ?? '620',
    ledgerName: overrides.ledgerName ?? 'Owner salary',
    category: overrides.category ?? 'salary',
    type: overrides.type ?? 'add',
    value: overrides.value ?? 50_000,
    adjustment: overrides.adjustment ?? 50_000,
    reason: overrides.reason ?? 'Owner compensation add-back',
    source: overrides.source ?? 'manual',
    status: overrides.status ?? 'accepted',
    applyAllYears: overrides.applyAllYears ?? false,
    year: overrides.year ?? 2025,
  }
}

describe('manualChatRequestContext', () => {
  it('normalizes chat locale to the supported AI set', () => {
    expect(getManualChatLocale('en')).toBe('en')
    expect(getManualChatLocale('nl')).toBe('nl')
    expect(getManualChatLocale('fr')).toBe('nl')
  })

  it('reads version counts defensively', () => {
    expect(getManualChatVersionCount({ report: [{}, {}] }, 'report')).toBe(2)
    expect(getManualChatVersionCount({ report: [] }, 'missing')).toBe(0)
    expect(getManualChatVersionCount({}, null)).toBe(0)
  })

  it('keeps only the latest user/assistant messages for AI fallback history', () => {
    const messages = Array.from({ length: 14 }, (_, index) =>
      message(
        index % 3 === 0 ? 'system' : index % 2 === 0 ? 'assistant' : 'user',
        `m${index}`,
        index
      )
    )

    expect(buildManualChatHistory(messages, 4)).toEqual([
      { role: 'assistant', content: 'm8' },
      { role: 'assistant', content: 'm10' },
      { role: 'user', content: 'm11' },
      { role: 'user', content: 'm13' },
    ])
  })

  it('builds enriched form data from latest financials and normalization summary', () => {
    const enriched = buildManualChatEnrichedFormData({
      collectedData: {
        companyName: 'Acme',
        industry: 'services',
        revenue: 100,
        ebitda: 10,
        yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 10 }],
      },
      latestFormData: {
        revenue: 120,
        current_year_data: { year: 2025, revenue: 120, ebitda: 12 },
      },
      normalizationItems: [
        normalization({ status: 'accepted', adjustment: 50_000, category: 'salary' }),
        normalization({ id: 'n-2', status: 'pending', adjustment: 10_000, category: 'rent' }),
      ],
      versionCount: 3,
    })

    expect(enriched).toMatchObject({
      companyName: 'Acme',
      revenue: 120,
      ebitda: 10,
      current_year_data: { year: 2025, revenue: 120, ebitda: 12 },
      _normalizationSummary: {
        total: 2,
        accepted: 1,
        pending: 1,
        totalAdjustment: 50_000,
        categories: ['salary', 'rent'],
      },
      _formCompleteness: 71,
      _versionCount: 3,
    })
  })

  it('builds the AI request contract used by ManualLayout', () => {
    const request = buildManualAIChatRequest({
      message: 'Help me',
      reportId: 'report-1',
      currentLocale: 'en',
      collectedData: { companyName: 'Acme', revenue: 100, ebitda: 10 },
      latestFormData: { ebitda: 12 },
      fieldContext: { field: 'ebitda', label: 'EBITDA' },
      normalizationItems: [normalization({})],
      conversationId: 'conversation-1',
      chatMessages: [
        message('system', 'ignore', 1),
        message('user', 'previous', 2),
        message('assistant', 'answer', 3),
      ],
      versionCount: 2,
      audience: 'advisor',
    })

    expect(request).toMatchObject({
      message: 'Help me',
      sessionId: 'report-1',
      reportId: 'report-1',
      companyName: 'Acme',
      conversationId: 'conversation-1',
      fieldContext: { field: 'ebitda', label: 'EBITDA' },
      audience: 'advisor',
      locale: 'en',
      history: [
        { role: 'user', content: 'previous' },
        { role: 'assistant', content: 'answer' },
      ],
      formData: {
        companyName: 'Acme',
        revenue: 100,
        ebitda: 12,
        _versionCount: 2,
      },
    })
    expect(request.normalizations).toHaveLength(1)
  })

  it('keeps the valuation report id available when advisor chat uses client-scoped history', () => {
    const request = buildManualAIChatRequest({
      message: 'Leg de waarde uit',
      reportId: '48d52144-1fa9-44e7-b077-8dc22310c2ac',
      currentLocale: 'nl',
      collectedData: { companyName: 'Bakkerij Klaas' },
      latestFormData: {},
      normalizationItems: [],
      chatMessages: [],
      versionCount: 1,
      audience: 'advisor',
      clientUserId: 'client-123',
      assistantIntent: 'explain_value',
    })

    expect(request.sessionId).toBe('client_client-123')
    expect(request.reportId).toBe('48d52144-1fa9-44e7-b077-8dc22310c2ac')
    expect(request.assistantIntent).toBe('explain_value')
  })

  it('adds open-report valuation summary to chat formData for local fallback', () => {
    const valuationSummary = buildManualChatValuationSummary({
      id: '48d52144-1fa9-44e7-b077-8dc22310c2ac',
      companyName: 'Bakkerij Klaas',
      valuation: 559_986,
      valuationLow: 428_000,
      valuationHigh: 617_000,
      ebitda: 100_000,
      normalizedEbitda: 100_000,
      multiple: 4.3,
      recommendedAskingPrice: 617_000,
      generatedAt: new Date('2026-05-31T08:38:46.000Z'),
    } as never)
    const request = buildManualAIChatRequest({
      message: 'Leg de waarde uit',
      reportId: '48d52144-1fa9-44e7-b077-8dc22310c2ac',
      currentLocale: 'nl',
      collectedData: { companyName: 'Bakkerij Klaas' },
      latestFormData: {},
      normalizationItems: [],
      valuationSummary,
      chatMessages: [],
      versionCount: 1,
      audience: 'advisor',
      clientUserId: 'client-123',
      assistantIntent: 'explain_value',
    })

    expect(request.formData?._valuationSummary).toMatchObject({
      valuation: 559_986,
      valuationLow: 428_000,
      valuationHigh: 617_000,
      recommendedAskingPrice: 617_000,
      normalizedEbitda: 100_000,
      multiple: 4.3,
      generatedAt: '2026-05-31T08:38:46.000Z',
    })
  })

  it('resolves assistantIntent from message and explicit chip intent', () => {
    const explain = buildManualAIChatRequest({
      message: 'Verklaar deze EBITDA',
      reportId: 'report-1',
      currentLocale: 'nl',
      collectedData: { companyName: 'Acme' },
      latestFormData: {},
      normalizationItems: [],
      chatMessages: [],
      versionCount: 0,
      assistantIntent: 'explain_ebitda',
    })
    expect(explain.assistantIntent).toBe('explain_ebitda')

    const explainValuation = buildManualAIChatRequest({
      message: 'Explain the valuation',
      reportId: 'report-1',
      currentLocale: 'en',
      collectedData: { companyName: 'Acme' },
      latestFormData: {},
      normalizationItems: [],
      chatMessages: [],
      versionCount: 0,
    })
    expect(explainValuation.assistantIntent).toBe('explain_value')

    const overridden = buildManualAIChatRequest({
      message: 'Normaliseer eigenaarssalaris naar €60k',
      reportId: 'report-1',
      currentLocale: 'nl',
      collectedData: { companyName: 'Acme' },
      latestFormData: {},
      normalizationItems: [],
      chatMessages: [],
      versionCount: 0,
      assistantIntent: 'explain_value',
    })
    expect(overridden.assistantIntent).toBe('suggest_normalizations')
  })
})
