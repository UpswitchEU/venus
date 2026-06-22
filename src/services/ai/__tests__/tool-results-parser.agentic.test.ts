// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseAIChatToolResults } from '../tool-results-parser'

// ---------------------------------------------------------------------
// agentic action envelopes
// ---------------------------------------------------------------------

describe('agentic action envelopes', () => {
  it('parses owner-profile answer proposals', () => {
    const result = parseAIChatToolResults([
      {
        type: 'owner_profile_answer_request',
        data: {
          update: {
            field: 'key_man_dependency',
            value: 'low',
            label: 'Key person dependency',
            reason: 'Documented management team.',
            complete: true,
            accountantCustomerId: 'client-1',
          },
        },
      },
    ])

    expect(result.ownerProfileAnswerRequests).toEqual([
      {
        field: 'key_man_dependency',
        value: 'low',
        label: 'Key person dependency',
        reason: 'Documented management team.',
        complete: true,
        accountantCustomerId: 'client-1',
      },
    ])
  })

  it('parses integration, credential, upload, and choice proposals', () => {
    const result = parseAIChatToolResults([
      {
        type: 'integration_connect_request',
        data: {
          status: 'pending_approval',
          request: {
            provider: 'silverfin',
            auth_mode: 'oauth',
            reason: 'Pull trial balance data.',
            target_context: 'client-1',
          },
          message: 'Connect Silverfin.',
        },
      },
      {
        type: 'secure_credential_request',
        data: {
          status: 'pending_approval',
          request: {
            provider: 'exact',
            fields: [
              { key: 'api_key', label: 'API key', masked: true, required: true },
              { key: '', label: 'Malformed' },
            ],
            submit_path: '/api/integrations/accounting/exact/credentials',
          },
        },
      },
      {
        type: 'csv_upload_request',
        data: {
          status: 'pending_approval',
          request: {
            mode: 'single_client_trial_balance',
            label: 'Upload trial balance',
            expected_columns: ['account', 'amount'],
            max_size_bytes: 5242880,
            accept: '.csv',
          },
        },
      },
      {
        type: 'multi_select_request',
        data: {
          status: 'pending_approval',
          request: {
            title: 'Select methods',
            options: [
              { value: 'ebitda', label: 'EBITDA' },
              { value: 'sde', label: 'SDE' },
            ],
            min_selections: 1,
            max_selections: 2,
            preselected: ['ebitda'],
          },
        },
      },
      {
        type: 'single_select_request',
        data: {
          status: 'pending_approval',
          request: {
            title: 'Choose source',
            options: [
              { value: 'yuki', label: 'Yuki' },
              { value: 'csv', label: 'CSV' },
            ],
            preselected: 'csv',
          },
        },
      },
    ])

    expect(result.integrationConnectRequests).toEqual([
      {
        status: 'pending_approval',
        provider: 'silverfin',
        authMode: 'oauth',
        reason: 'Pull trial balance data.',
        targetContext: 'client-1',
        message: 'Connect Silverfin.',
      },
    ])
    expect(result.secureCredentialRequests[0]).toMatchObject({
      status: 'pending_approval',
      provider: 'exact',
      submitPath: '/api/integrations/accounting/exact/credentials',
      fields: [{ key: 'api_key', label: 'API key', masked: true, required: true }],
    })
    expect(result.csvUploadRequests[0]).toMatchObject({
      status: 'pending_approval',
      mode: 'single_client_trial_balance',
      expectedColumns: ['account', 'amount'],
      maxSizeBytes: 5242880,
      accept: '.csv',
    })
    expect(result.multiSelectRequests[0]).toMatchObject({
      status: 'pending_approval',
      title: 'Select methods',
      minSelections: 1,
      maxSelections: 2,
      preselected: ['ebitda'],
    })
    expect(result.singleSelectRequests[0]).toMatchObject({
      status: 'pending_approval',
      title: 'Choose source',
      preselected: 'csv',
    })
  })

  it('parses Mercury parity proposals for sync, reminders, listing visibility, and share tokens', () => {
    const result = parseAIChatToolResults([
      {
        type: 'integration_sync_request',
        data: {
          status: 'pending_approval',
          request: {
            provider: 'exact',
            scope: 'client_scope',
            client_id: 'client-1',
            reason: 'Fresh 2025 data is available.',
          },
          message: 'Sync Exact before running valuation.',
        },
      },
      {
        type: 'owner_reminder_request',
        data: {
          status: 'pending_approval',
          request: {
            client_id: 'client-1',
            business_name: 'Acme NV',
            customer_email: 'owner@acme.test',
            custom_message: 'Could you complete the owner profile?',
            reason: 'Owner profile is incomplete.',
          },
        },
      },
      {
        type: 'owner_invite_accountant_request',
        data: {
          status: 'pending_approval',
          request: {
            accountant_email: 'advisor@example.com',
            custom_message: 'Please review the books.',
            reason: 'The owner wants their accountant involved.',
          },
        },
      },
      {
        type: 'listing_visibility_request',
        data: {
          status: 'pending_approval',
          request: {
            listing_id: 'listing-1',
            visibility: 'private',
            business_name: 'Acme listing',
            reason: 'Keep it invite-only for now.',
          },
        },
      },
      {
        type: 'share_token_request',
        data: {
          status: 'pending_approval',
          request: {
            listing_id: 'listing-1',
            expires_in_days: 14,
            max_uses: 1,
            label: 'For Acme Capital',
            business_name: 'Acme listing',
            reason: 'One buyer needs a private link.',
          },
        },
      },
      {
        type: 'share_token_revoke_request',
        data: {
          status: 'pending_approval',
          request: {
            listing_id: 'listing-1',
            token_id: 'token-1',
            token_hint: 'up_1234',
            token_label: 'For Acme Capital',
            business_name: 'Acme listing',
            reason: 'The buyer dropped out.',
          },
        },
      },
      {
        type: 'valuation_method_preference_request',
        data: {
          status: 'pending_approval',
          request: {
            client_id: 'client-1',
            method: 'dcf',
            business_name: 'Acme NV',
            reason: 'DCF should be the headline lens for the next bulk run.',
          },
        },
      },
      {
        type: 'acknowledge_warning_request',
        data: {
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
      },
    ])

    expect(result.integrationSyncRequests[0]).toMatchObject({
      status: 'pending_approval',
      provider: 'exact',
      scope: 'client_scope',
      clientId: 'client-1',
    })
    expect(result.ownerReminderRequests[0]).toMatchObject({
      status: 'pending_approval',
      clientId: 'client-1',
      businessName: 'Acme NV',
      customerEmail: 'owner@acme.test',
    })
    expect(result.ownerInviteAccountantRequests[0]).toMatchObject({
      status: 'pending_approval',
      accountantEmail: 'advisor@example.com',
      customMessage: 'Please review the books.',
    })
    expect(result.listingVisibilityRequests[0]).toMatchObject({
      status: 'pending_approval',
      listingId: 'listing-1',
      visibility: 'private',
    })
    expect(result.shareTokenRequests[0]).toMatchObject({
      status: 'pending_approval',
      listingId: 'listing-1',
      expiresInDays: 14,
      maxUses: 1,
      label: 'For Acme Capital',
    })
    expect(result.shareTokenRevokeRequests[0]).toMatchObject({
      status: 'pending_approval',
      listingId: 'listing-1',
      tokenId: 'token-1',
      tokenHint: 'up_1234',
    })
    expect(result.valuationMethodPreferenceRequests[0]).toMatchObject({
      status: 'pending_approval',
      clientId: 'client-1',
      method: 'dcf',
      businessName: 'Acme NV',
    })
    expect(result.acknowledgeWarningRequests[0]).toMatchObject({
      status: 'pending_approval',
      code: 'cap_breach:2024:owner_salary',
      warningKind: 'cap_breach',
      clientId: 'client-1',
      reportId: 'report-1',
    })
  })

  it('parses advisor workflow proposals and blocked states', () => {
    const result = parseAIChatToolResults([
      {
        type: 'client_create_request',
        data: {
          status: 'pending_approval',
          request: {
            business_name: 'Acme NV',
            customer_email: 'owner@acme.test',
            company_number: 'BE0123456789',
            industry: 'Software',
            location: 'Antwerp',
            notes: 'Imported from KBO.',
          },
          message: 'Ready to add client.',
        },
      },
      {
        type: 'valuation_session_request',
        data: {
          status: 'auto_approved',
          request: {
            client_id: 'client-1',
            business_name: 'Acme NV',
            customer_email: 'owner@acme.test',
            has_business_card: true,
            latest_valuation_id: 'valuation-1',
            has_synced_financials: true,
            stp_status: 'ready',
          },
        },
      },
      {
        type: 'import_review_request',
        data: {
          status: 'pending_approval',
          request: {
            client_id: 'client-1',
            business_name: 'Acme NV',
            accounting_sources: [{ provider: 'yuki', client_key: 'admin-1' }],
            actionable_flag_count: 2,
            top_flags: [{ year: '2025', code: 'UNMAPPED_LEDGER', severity: 'error' }],
          },
        },
      },
      {
        type: 'client_create_request',
        data: {
          status: 'pending_approval',
          request: {
            business_name: 'Name Only NV',
            company_number: ' ',
          },
          message: 'Malformed stale card.',
        },
      },
      {
        type: 'client_create_request',
        data: {
          status: 'blocked',
          reason: 'missing_business_name',
          message: 'Tell me which business to add.',
        },
      },
    ])

    expect(result.clientCreateRequests).toEqual([
      {
        status: 'pending_approval',
        businessName: 'Acme NV',
        customerEmail: 'owner@acme.test',
        companyNumber: 'BE0123456789',
        industry: 'Software',
        location: 'Antwerp',
        notes: 'Imported from KBO.',
        message: 'Ready to add client.',
      },
      {
        status: 'blocked',
        reason: 'missing_business_name',
        message: 'Tell me which business to add.',
      },
    ])
    expect(result.valuationSessionRequests).toEqual([
      {
        status: 'auto_approved',
        clientId: 'client-1',
        businessName: 'Acme NV',
        customerEmail: 'owner@acme.test',
        hasBusinessCard: true,
        latestValuationId: 'valuation-1',
        hasSyncedFinancials: true,
        stpStatus: 'ready',
      },
    ])
    expect(result.importReviewRequests).toMatchObject([
      {
        status: 'pending_approval',
        clientId: 'client-1',
        businessName: 'Acme NV',
        accountingSources: [{ provider: 'yuki', clientKey: 'admin-1', lastSyncAt: null }],
        actionableFlagCount: 2,
        topFlags: [
          { year: '2025', code: 'UNMAPPED_LEDGER', severity: 'error', field: null, message: null },
        ],
      },
    ])
  })
})

// ---------------------------------------------------------------------
// approval proposal parser hardening
// ---------------------------------------------------------------------

describe('approval proposal parser hardening', () => {
  it('drops pending proposal envelopes that do not include a request object', () => {
    const result = parseAIChatToolResults([
      { type: 'integration_sync_request', data: { status: 'pending_approval' } },
      { type: 'owner_reminder_request', data: { status: 'pending_approval', request: null } },
      { type: 'listing_visibility_request', data: { status: 'pending_approval' } },
      { type: 'share_token_request', data: { status: 'pending_approval' } },
      { type: 'valuation_defaults_request', data: { status: 'pending_approval' } },
      { type: 'normalization_dismiss_request', data: { status: 'pending_approval' } },
      { type: 'secure_credential_request', data: { status: 'pending_approval' } },
      { type: 'csv_upload_request', data: { status: 'pending_approval' } },
      { type: 'multi_select_request', data: { status: 'pending_approval' } },
    ])

    expect(result.integrationSyncRequests).toEqual([])
    expect(result.ownerReminderRequests).toEqual([])
    expect(result.listingVisibilityRequests).toEqual([])
    expect(result.shareTokenRequests).toEqual([])
    expect(result.valuationDefaultsRequests).toEqual([])
    expect(result.normalizationDismissRequests).toEqual([])
    expect(result.secureCredentialRequests).toEqual([])
    expect(result.csvUploadRequests).toEqual([])
    expect(result.multiSelectRequests).toEqual([])
  })

  it('keeps blocked approval proposal envelopes on the shared blocked branch', () => {
    const result = parseAIChatToolResults([
      {
        type: 'integration_sync_request',
        data: { status: 'blocked', reason: 'missing_connection', message: 'Connect Exact first.' },
      },
      {
        type: 'listing_visibility_request',
        data: { status: 'blocked', reason: 'no_listing', message: 'Create listing first.' },
      },
      {
        type: 'valuation_defaults_request',
        data: { status: 'blocked', reason: 'not_advisor', message: 'Advisor role required.' },
      },
      {
        type: 'normalization_dismiss_request',
        data: { status: 'blocked', reason: 'not_found', message: 'Adjustment no longer exists.' },
      },
    ])

    expect(result.integrationSyncRequests).toEqual([
      { status: 'blocked', reason: 'missing_connection', message: 'Connect Exact first.' },
    ])
    expect(result.listingVisibilityRequests).toEqual([
      { status: 'blocked', reason: 'no_listing', message: 'Create listing first.' },
    ])
    expect(result.valuationDefaultsRequests).toEqual([
      { status: 'blocked', reason: 'not_advisor', message: 'Advisor role required.' },
    ])
    expect(result.normalizationDismissRequests).toEqual([
      { status: 'blocked', reason: 'not_found', message: 'Adjustment no longer exists.' },
    ])
  })

  it('does not auto-approve pending-only action requests', () => {
    const result = parseAIChatToolResults([
      {
        type: 'secure_credential_request',
        data: {
          status: 'auto_approved',
          request: {
            provider: 'exact',
            fields: [{ key: 'api_key', label: 'API key' }],
          },
        },
      },
      {
        type: 'csv_upload_request',
        data: {
          status: 'auto_approved',
          request: { mode: 'bulk_clients', label: 'Bulk CSV' },
        },
      },
    ])

    expect(result.secureCredentialRequests).toEqual([])
    expect(result.csvUploadRequests).toEqual([])
  })
})
