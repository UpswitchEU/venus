import { describe, expect, it } from 'vitest'
import {
  buildBelgianBootstrapActions,
  buildBuyerProfileGapPrompt,
  buildClientDataReadinessActions,
  buildListingGapPrompt,
  buildMethodReadinessActions,
  type ChatAssistantTranslator,
  formatMethodName,
} from './ChatAssistantAdvisoryPreviewActions'
import type {
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ClientDataReadinessPreview,
  ListingPreview,
  MethodReadinessPreview,
} from './ChatAssistantTypes'

const translate = ((key: string) => key) as ChatAssistantTranslator

describe('ChatAssistantAdvisoryPreviewActions', () => {
  it('formats method names for advisor-readable prompts', () => {
    expect(formatMethodName('ev_ebitda')).toBe('Ev Ebitda')
    expect(formatMethodName('__dcf__')).toBe('Dcf')
  })

  it('builds listing repair prompts from explicit hints before missing fields', () => {
    const withHint: ListingPreview = {
      id: 'listing-1',
      status: 'blocked',
      sourceBusinessName: 'Acme BV',
      missingFields: ['region'],
      nextActionHint: 'Ask the owner for the region.',
    }
    const withFields: ListingPreview = {
      id: 'listing-2',
      status: 'blocked',
      reportId: 'report-1',
      missingFields: ['region', 'employee_range'],
    }

    expect(buildListingGapPrompt(withHint)).toBe('Ask the owner for the region.')
    expect(buildListingGapPrompt(withFields)).toBe(
      'Help me complete the missing listing fields for valuation report report-1: region, employee_range.'
    )
  })

  it('builds buyer-profile gap prompts from listing readiness', () => {
    const preview: BuyerProfilePreview = {
      id: 'buyer-profile-1',
      status: 'blocked',
      sourceBusinessName: 'Beta BV',
      listingReadiness: {
        status: 'missing_fields',
        missingFields: ['asking_price', 'region'],
      },
    }

    expect(buildBuyerProfileGapPrompt(preview)).toBe(
      'Help me complete the missing listing fields for Beta BV: asking_price, region.'
    )
  })

  it('keeps Belgian bootstrap actions aligned with blocked and ready states', () => {
    const blocked: BelgianCompanyBootstrap = {
      id: 'bootstrap-1',
      status: 'failed',
      identity: { kboNumber: '0123456789' },
    }
    const ready: BelgianCompanyBootstrap = {
      id: 'bootstrap-2',
      status: 'ok',
      identity: { legalName: 'Acme BV' },
    }

    expect(buildBelgianBootstrapActions(blocked, translate)).toEqual([
      {
        label: 'proposalCards.belgianBootstrap.resolveGapsAction',
        prompt:
          'Help me bootstrap KBO 0123456789 from KBO/NBB public data and resolve the data gaps.',
        primary: true,
      },
    ])
    expect(
      buildBelgianBootstrapActions(ready, translate, { integrationsEnabled: true }).map(
        (action) => action.prompt
      )
    ).toEqual([
      'Create an advisor client for Acme BV from this KBO/NBB public-data bootstrap.',
      'Connect accounting data for Acme BV and continue onboarding.',
      'Start a valuation for Acme BV using the public data, then ask me for any missing inputs.',
    ])
    expect(buildBelgianBootstrapActions(ready, translate).map((action) => action.prompt)).toEqual([
      'Create an advisor client for Acme BV from this KBO/NBB public-data bootstrap.',
      'Start a valuation for Acme BV using the public data, then ask me for any missing inputs.',
    ])
  })

  it('routes client-data readiness to review, valuation, or import actions', () => {
    const needsReview: ClientDataReadinessPreview = {
      id: 'readiness-1',
      status: 'needs_import_review',
      businessName: 'Acme BV',
    }
    const ready: ClientDataReadinessPreview = {
      id: 'readiness-2',
      status: 'ready_for_valuation',
      businessName: 'Beta BV',
    }
    const missing: ClientDataReadinessPreview = {
      id: 'readiness-3',
      status: 'missing_financials',
      clientId: 'client-3',
    }

    expect(buildClientDataReadinessActions(needsReview, translate)[0]?.prompt).toBe(
      'Open the import review for Acme BV and walk me through the accounting flags.'
    )
    expect(buildClientDataReadinessActions(ready, translate)[0]?.prompt).toBe(
      'Start a valuation for Beta BV using the synced accounting data.'
    )
    expect(
      buildClientDataReadinessActions(missing, translate, { integrationsEnabled: true })[0]?.prompt
    ).toBe(
      'Help me connect or import accounting data for client client-3.'
    )
    expect(buildClientDataReadinessActions(missing, translate)[0]).toEqual({
      label: 'proposalCards.clientDataReadiness.enterFiguresAction',
      prompt: 'Enter financials manually for client client-3: revenue + EBITDA by fiscal year.',
      primary: true,
    })
  })

  it('limits method-readiness prompts to the first six methods', () => {
    const preview: MethodReadinessPreview = {
      id: 'method-readiness-1',
      status: 'ok',
      businessName: 'Acme BV',
      readyMethods: ['dcf', 'ev_ebitda', 'revenue_multiple', 'scorecard', 'vc', 'berkus', 'nav'],
      blockedMethods: [],
    }

    expect(buildMethodReadinessActions(preview, translate)[0]?.prompt).toBe(
      'Run the ready valuation methods for Acme BV: Dcf, Ev Ebitda, Revenue Multiple, Scorecard, Vc, Berkus.'
    )
  })
})
