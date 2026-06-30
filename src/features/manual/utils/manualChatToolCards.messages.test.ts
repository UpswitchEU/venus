// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  appendManualChatToolCardsToMessages,
  applyManualChatSellabilityComputedScore,
  assistantMessage,
  markManualChatProposalDecision,
} from './manualChatToolCards.testUtils'

describe('manualChatToolCards message mutations', () => {
  it('appends cards to the target assistant message only', () => {
    const messages = [
      assistantMessage({ id: 'other', content: 'leave me' }),
      assistantMessage({ fieldUpdates: [{ field: 'ebitda', value: 1, label: 'EBITDA' }] }),
    ]

    const next = appendManualChatToolCardsToMessages(messages, 'message-1', {
      fieldUpdates: [{ field: 'revenue', value: 2, label: 'Revenue' }],
      reportGenerationRequests: [{ id: 'report-card', status: 'blocked' }],
      ownerProfileAnswerRequests: [{ id: 'owner-card', field: 'key_person' }],
      integrationConnectRequests: [{ id: 'integration-card', status: 'pending_approval' }],
      integrationSyncRequests: [{ id: 'integration-sync-card', status: 'pending_approval' }],
      syncStatusPreviews: [{ id: 'sync-status-card', status: 'ok', providers: [] }],
      ownerInviteAccountantRequests: [{ id: 'owner-invite-card', status: 'pending_approval' }],
      ownerReminderRequests: [{ id: 'owner-reminder-card', status: 'pending_approval' }],
      listingVisibilityRequests: [{ id: 'listing-visibility-card', status: 'pending_approval' }],
      shareTokenRequests: [{ id: 'share-token-card', status: 'pending_approval' }],
      shareTokenRevokeRequests: [{ id: 'share-token-revoke-card', status: 'pending_approval' }],
      valuationMethodPreferenceRequests: [
        { id: 'method-preference-card', status: 'pending_approval' },
      ],
      acknowledgeWarningRequests: [
        { id: 'ack-warning-card', status: 'pending_approval', code: 'cap_breach:2024' },
      ],
      secureCredentialRequests: [{ id: 'credential-card', status: 'pending_approval' }],
      csvUploadRequests: [{ id: 'csv-card', status: 'pending_approval' }],
      multiSelectRequests: [{ id: 'multi-card', status: 'pending_approval' }],
      singleSelectRequests: [{ id: 'single-card', status: 'pending_approval' }],
      clientCreateRequests: [{ id: 'client-create-card', status: 'pending_approval' }],
      belgianCompanyBootstraps: [{ id: 'bootstrap-card', status: 'ok' }],
      valuationSessionRequests: [{ id: 'valuation-session-card', status: 'pending_approval' }],
      clientDataReadinessPreviews: [{ id: 'readiness-card', status: 'needs_import_review' }],
      importReviewRequests: [{ id: 'import-review-card', status: 'pending_approval' }],
      methodReadinessPreviews: [
        { id: 'methods-card', status: 'ok', readyMethods: ['ebitda'], blockedMethods: [] },
      ],
      listingPreviews: [{ id: 'listing-preview-card', status: 'ok' }],
      buyerProfilePreviews: [{ id: 'buyer-card', status: 'ok' }],
      businessTypeSearchResults: [
        {
          id: 'business-type-card',
          status: 'ok',
          query: 'software',
          totalFound: 1,
          results: [{ id: 'saas-company', title: 'SaaS company' }],
        },
      ],
      advisorCopilotDrafts: [
        {
          id: 'advisor-copilot-card',
          status: 'pending_review',
          businessName: 'Acme BV',
          yearPlan: [],
          firstCheckInAgenda: [],
          talkingPoints: [],
          billableServiceAngles: [],
          citations: [{ key: 'valuation', label: 'Latest valuation', source: 'valuation' }],
        },
      ],
      buyerReadyCards: [
        {
          id: 'buyer-ready-card',
          kind: 'im_regenerate',
          status: 'pending_approval',
          sectionKey: 'financial_overview',
          currentConfidence: 'low',
          reason: 'Refresh prose',
        },
      ],
    })

    expect(next[0]).toBe(messages[0])
    expect(next[1].fieldUpdates).toEqual([
      { field: 'ebitda', value: 1, label: 'EBITDA' },
      { field: 'revenue', value: 2, label: 'Revenue' },
    ])
    expect(next[1].reportGenerationRequests).toEqual([{ id: 'report-card', status: 'blocked' }])
    expect(next[1].ownerProfileAnswerRequests).toEqual([{ id: 'owner-card', field: 'key_person' }])
    expect(next[1].integrationConnectRequests).toEqual([
      { id: 'integration-card', status: 'pending_approval' },
    ])
    expect(next[1].integrationSyncRequests).toEqual([
      { id: 'integration-sync-card', status: 'pending_approval' },
    ])
    expect(next[1].syncStatusPreviews).toEqual([
      { id: 'sync-status-card', status: 'ok', providers: [] },
    ])
    expect(next[1].ownerInviteAccountantRequests).toEqual([
      { id: 'owner-invite-card', status: 'pending_approval' },
    ])
    expect(next[1].ownerReminderRequests).toEqual([
      { id: 'owner-reminder-card', status: 'pending_approval' },
    ])
    expect(next[1].listingVisibilityRequests).toEqual([
      { id: 'listing-visibility-card', status: 'pending_approval' },
    ])
    expect(next[1].shareTokenRequests).toEqual([
      { id: 'share-token-card', status: 'pending_approval' },
    ])
    expect(next[1].shareTokenRevokeRequests).toEqual([
      { id: 'share-token-revoke-card', status: 'pending_approval' },
    ])
    expect(next[1].valuationMethodPreferenceRequests).toEqual([
      { id: 'method-preference-card', status: 'pending_approval' },
    ])
    expect(next[1].acknowledgeWarningRequests).toEqual([
      { id: 'ack-warning-card', status: 'pending_approval', code: 'cap_breach:2024' },
    ])
    expect(next[1].secureCredentialRequests).toEqual([
      { id: 'credential-card', status: 'pending_approval' },
    ])
    expect(next[1].csvUploadRequests).toEqual([{ id: 'csv-card', status: 'pending_approval' }])
    expect(next[1].multiSelectRequests).toEqual([{ id: 'multi-card', status: 'pending_approval' }])
    expect(next[1].singleSelectRequests).toEqual([
      { id: 'single-card', status: 'pending_approval' },
    ])
    expect(next[1].clientCreateRequests).toEqual([
      { id: 'client-create-card', status: 'pending_approval' },
    ])
    expect(next[1].belgianCompanyBootstraps).toEqual([{ id: 'bootstrap-card', status: 'ok' }])
    expect(next[1].valuationSessionRequests).toEqual([
      { id: 'valuation-session-card', status: 'pending_approval' },
    ])
    expect(next[1].clientDataReadinessPreviews).toEqual([
      { id: 'readiness-card', status: 'needs_import_review' },
    ])
    expect(next[1].importReviewRequests).toEqual([
      { id: 'import-review-card', status: 'pending_approval' },
    ])
    expect(next[1].methodReadinessPreviews).toEqual([
      { id: 'methods-card', status: 'ok', readyMethods: ['ebitda'], blockedMethods: [] },
    ])
    expect(next[1].listingPreviews).toEqual([{ id: 'listing-preview-card', status: 'ok' }])
    expect(next[1].buyerProfilePreviews).toEqual([{ id: 'buyer-card', status: 'ok' }])
    expect(next[1].businessTypeSearchResults).toEqual([
      {
        id: 'business-type-card',
        status: 'ok',
        query: 'software',
        totalFound: 1,
        results: [{ id: 'saas-company', title: 'SaaS company' }],
      },
    ])
    expect(next[1].advisorCopilotDrafts).toEqual([
      {
        id: 'advisor-copilot-card',
        status: 'pending_review',
        businessName: 'Acme BV',
        yearPlan: [],
        firstCheckInAgenda: [],
        talkingPoints: [],
        billableServiceAngles: [],
        citations: [{ key: 'valuation', label: 'Latest valuation', source: 'valuation' }],
      },
    ])
    expect(next[1].buyerReadyCards).toEqual([
      {
        id: 'buyer-ready-card',
        kind: 'im_regenerate',
        status: 'pending_approval',
        sectionKey: 'financial_overview',
        currentConfidence: 'low',
        reason: 'Refresh prose',
      },
    ])
  })

  it('marks proposal decisions in a selected card bucket', () => {
    const messages = [
      assistantMessage({
        valuationRunRequests: [
          { id: 'keep', status: 'blocked' },
          { id: 'target', status: 'blocked' },
        ],
      }),
    ]

    expect(
      markManualChatProposalDecision(messages, 'valuationRunRequests', 'target', 'approved')[0]
        .valuationRunRequests
    ).toEqual([
      { id: 'keep', status: 'blocked' },
      { id: 'target', status: 'blocked', decision: 'approved' },
    ])
  })

  it('applies a computed sellability score to the selected proposal card', () => {
    const messages = [
      assistantMessage({
        sellabilityRunRequests: [
          { id: 'keep', status: 'pending_approval' },
          { id: 'target', status: 'pending_approval' },
        ],
      }),
    ]

    expect(
      applyManualChatSellabilityComputedScore(messages, 'target', {
        score: 82,
        band: 'strong',
        confidence: 'high',
      })[0].sellabilityRunRequests
    ).toEqual([
      { id: 'keep', status: 'pending_approval' },
      {
        id: 'target',
        status: 'pending_approval',
        computedScore: { score: 82, band: 'strong', confidence: 'high' },
      },
    ])
  })
})
