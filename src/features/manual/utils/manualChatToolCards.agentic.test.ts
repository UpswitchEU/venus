// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { idFactory, parseManualChatStreamToolResult } from './manualChatToolCards.testUtils'

describe('manualChatToolCards agentic workflow parsing', () => {
  it('parses streaming agentic workflow cards and assigns ids', () => {
    const createId = idFactory()

    expect(
      parseManualChatStreamToolResult(
        'update_owner_profile_answer',
        {
          update: {
            field: 'key_man_dependency',
            value: 'low',
            label: 'Key person dependency',
          },
        },
        createId
      )?.ownerProfileAnswerRequests?.[0]
    ).toMatchObject({
      id: 'id-1',
      field: 'key_man_dependency',
      value: 'low',
      label: 'Key person dependency',
    })

    expect(
      parseManualChatStreamToolResult(
        'propose_integration_connect',
        {
          status: 'pending_approval',
          request: { provider: 'silverfin', auth_mode: 'oauth' },
        },
        createId
      )?.integrationConnectRequests?.[0]
    ).toMatchObject({ id: 'id-2', provider: 'silverfin', authMode: 'oauth' })

    expect(
      parseManualChatStreamToolResult(
        'propose_secure_credential',
        {
          status: 'pending_approval',
          request: {
            provider: 'exact',
            fields: [{ key: 'api_key', label: 'API key', masked: true, required: true }],
          },
        },
        createId
      )?.secureCredentialRequests?.[0]
    ).toMatchObject({ id: 'id-3', provider: 'exact' })

    expect(
      parseManualChatStreamToolResult(
        'propose_csv_upload',
        {
          status: 'pending_approval',
          request: { mode: 'single_client_trial_balance', expected_columns: ['account'] },
        },
        createId
      )?.csvUploadRequests?.[0]
    ).toMatchObject({ id: 'id-4', mode: 'single_client_trial_balance' })

    const multiSelectCard = parseManualChatStreamToolResult(
      'propose_multi_select',
      {
        status: 'pending_approval',
        request: {
          options: [
            { value: 'ebitda', label: 'EBITDA' },
            { value: 'sde', label: 'SDE' },
          ],
        },
      },
      createId
    )?.multiSelectRequests?.[0]
    expect(multiSelectCard).toMatchObject({ id: 'id-5' })
    expect(multiSelectCard?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'ebitda' })])
    )

    const singleSelectCard = parseManualChatStreamToolResult(
      'propose_single_select',
      {
        status: 'pending_approval',
        request: {
          options: [
            { value: 'yuki', label: 'Yuki' },
            { value: 'csv', label: 'CSV' },
          ],
        },
      },
      createId
    )?.singleSelectRequests?.[0]
    expect(singleSelectCard).toMatchObject({ id: 'id-6' })
    expect(singleSelectCard?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'csv' })])
    )

    expect(
      parseManualChatStreamToolResult(
        'propose_valuation_method_preference',
        {
          status: 'pending_approval',
          request: { client_id: 'client-1', method: 'dcf', business_name: 'Acme NV' },
        },
        createId
      )?.valuationMethodPreferenceRequests?.[0]
    ).toMatchObject({ id: 'id-7', clientId: 'client-1', method: 'dcf' })

    expect(
      parseManualChatStreamToolResult(
        'propose_acknowledge_warning',
        {
          status: 'pending_approval',
          request: {
            code: 'cap_breach:2024:owner_salary',
            kind: 'cap_breach',
            summary: 'Owner salary normalization exceeds cap',
            reason: 'Founder confirmed below-market comp.',
            client_id: 'client-1',
            report_id: 'report-1',
          },
        },
        createId
      )?.acknowledgeWarningRequests?.[0]
    ).toMatchObject({
      id: 'id-8',
      code: 'cap_breach:2024:owner_salary',
      warningKind: 'cap_breach',
      clientId: 'client-1',
      reportId: 'report-1',
    })

    expect(
      parseManualChatStreamToolResult(
        'create_client',
        {
          status: 'pending_approval',
          request: { business_name: 'Acme NV', company_number: 'BE0123456789' },
        },
        createId
      )?.clientCreateRequests?.[0]
    ).toMatchObject({ id: 'id-9', businessName: 'Acme NV' })

    expect(
      parseManualChatStreamToolResult(
        'start_client_valuation',
        {
          status: 'pending_approval',
          request: { client_id: 'client-1', business_name: 'Acme NV' },
        },
        createId
      )?.valuationSessionRequests?.[0]
    ).toMatchObject({ id: 'id-10', clientId: 'client-1', businessName: 'Acme NV' })

    expect(
      parseManualChatStreamToolResult(
        'open_import_review',
        {
          status: 'pending_approval',
          request: { client_id: 'client-1', actionable_flag_count: 2 },
        },
        createId
      )?.importReviewRequests?.[0]
    ).toMatchObject({ id: 'id-11', clientId: 'client-1', actionableFlagCount: 2 })

    expect(
      parseManualChatStreamToolResult(
        'regenerate_im_section',
        {
          status: 'pending_approval',
          request: {
            section_key: 'financial_overview',
            current_confidence: 'low',
            reason: 'Numbers changed',
          },
        },
        createId
      )?.buyerReadyCards?.[0]
    ).toMatchObject({
      id: 'id-12',
      kind: 'im_regenerate',
      sectionKey: 'financial_overview',
      currentConfidence: 'low',
    })

    expect(
      parseManualChatStreamToolResult(
        'search_business_types',
        {
          status: 'ok',
          query: 'software',
          total_found: 1,
          results: [{ id: 'saas-company', title: 'SaaS company', industry: 'Software' }],
        },
        createId
      )?.businessTypeSearchResults?.[0]
    ).toMatchObject({
      id: 'id-13',
      status: 'ok',
      query: 'software',
      results: [{ id: 'saas-company', title: 'SaaS company', industry: 'Software' }],
    })
  })
})
