// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChatMessage, NormalizationItem } from '@/components/calculator'
import {
  buildManualAIChatRequest,
  buildManualChatEnrichedFormData,
  buildManualChatHistory,
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
})
