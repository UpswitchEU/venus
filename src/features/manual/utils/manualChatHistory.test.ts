// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { Message } from '@/types/message'
import { mapStoredMessagesToManualChatMessages } from './manualChatHistory'

function message(overrides: Partial<Message>): Message {
  return {
    id: 'message-1',
    type: 'ai',
    role: 'assistant',
    content: 'I prepared the action.',
    timestamp: new Date('2026-05-21T09:00:00.000Z'),
    ...overrides,
  }
}

function idFactory() {
  let next = 0
  return () => `card-${++next}`
}

describe('manualChatHistory', () => {
  it('rehydrates persisted tool results into the same action cards as live streaming', () => {
    const result = mapStoredMessagesToManualChatMessages(
      [
        message({
          id: 'u-1',
          type: 'user',
          role: 'user',
          content: 'Add Acme, generate the buyer package, then list it.',
        }),
        message({
          id: 'a-1',
          metadata: {
            persistedToolResults: [
              {
                id: 'tr-1',
                toolName: 'create_client',
                result: {
                  status: 'pending_approval',
                  request: {
                    business_name: 'Acme NV',
                    company_number: 'BE0123456789',
                  },
                },
              },
              {
                id: 'tr-2',
                toolName: 'generate_buyer_ready_package',
                result: {
                  status: 'pending_approval',
                  request: {
                    report_id: 'report-1',
                    reason: 'Prepare IM and data-room materials.',
                    region_label: 'Flanders',
                    country_code: 'BE',
                    result_summary: {
                      business_name: 'Acme NV',
                      currency: 'EUR',
                      midpoint: 1_200_000,
                    },
                  },
                },
              },
              {
                id: 'tr-3',
                toolName: 'create_listing',
                result: {
                  status: 'pending_approval',
                  request: {
                    report_id: 'report-1',
                    accountant_customer_id: 'client-1',
                    visibility: 'private',
                    valuation_summary: { business_name: 'Acme NV', midpoint: '1200000' },
                  },
                },
              },
              {
                id: 'tr-4',
                toolName: 'propose_advisor_copilot_draft',
                result: {
                  status: 'pending_review',
                  report_id: 'report-1',
                  business_name: 'Acme NV',
                  year_plan: [{ title: 'Revenue quality sprint', source_keys: ['valuation'] }],
                  first_check_in_agenda: [],
                  talking_points: [],
                  billable_service_angles: [],
                  citations: [{ key: 'valuation', label: 'Latest valuation', source: 'tool' }],
                },
              },
            ],
          },
        }),
      ],
      idFactory()
    )

    expect(result).toHaveLength(2)
    expect(result[1].clientCreateRequests?.[0]).toMatchObject({
      id: 'card-1',
      businessName: 'Acme NV',
      companyNumber: 'BE0123456789',
    })
    expect(result[1].buyerReadyCards?.[0]).toMatchObject({
      id: 'card-2',
      kind: 'buyer_package_generation',
      reportId: 'report-1',
      regionLabel: 'Flanders',
      resultSummary: { businessName: 'Acme NV', midpoint: 1_200_000 },
    })
    expect(result[1].listingCreateRequests?.[0]).toMatchObject({
      id: 'card-3',
      reportId: 'report-1',
      accountantCustomerId: 'client-1',
      visibility: 'private',
    })
    expect(result[1].advisorCopilotDrafts?.[0]).toMatchObject({
      id: 'card-4',
      status: 'pending_review',
      businessName: 'Acme NV',
      yearPlan: [{ title: 'Revenue quality sprint' }],
    })
  })
})
