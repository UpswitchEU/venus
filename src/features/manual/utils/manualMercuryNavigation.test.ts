// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualContinueToListingUrl,
  stripStaleSellerDashboardPhaseFromReturnUrl,
  buildManualExitClientViewFallbackUrl,
  buildManualExitClientViewTarget,
  buildManualImportReviewTarget,
  buildManualListingWizardUrl,
  buildManualLogoutPostUrl,
  buildManualMercuryAccountSettingsUrl,
  buildManualMercuryAdvisorDashboardUrl,
  buildManualMercuryBillingUrl,
  buildManualMercuryBusinessDashboardUrl,
  buildManualMercuryClientUrl,
  buildManualMercuryHelpUrl,
  buildManualMercuryPricingUrl,
  buildManualSafeMercuryReturnUrl,
  buildManualSwitchWorkspaceReturnUrl,
  getManualBackNavigationDecision,
  getManualImportReviewSessionKey,
  getManualMercuryLocale,
  hasCompletedManualValuation,
  resolveManualListingRelationshipId,
} from './manualMercuryNavigation'

describe('manualMercuryNavigation', () => {
  it('normalizes supported Mercury locales', () => {
    expect(getManualMercuryLocale('nl')).toBe('nl')
    expect(getManualMercuryLocale('en')).toBe('en')
    expect(getManualMercuryLocale('fr')).toBe('en')
  })

  it('builds canonical Mercury surface URLs from one locale policy', () => {
    const params = { mercuryUrl: 'https://mercury.test/', locale: 'nl' }

    expect(buildManualMercuryAdvisorDashboardUrl(params)).toBe(
      'https://mercury.test/nl/advisor/dashboard'
    )
    expect(buildManualMercuryAccountSettingsUrl(params)).toBe(
      'https://mercury.test/nl/advisor/settings'
    )
    expect(buildManualMercuryBillingUrl(params)).toBe(
      'https://mercury.test/nl/advisor/settings?tab=billing'
    )
    expect(buildManualMercuryHelpUrl(params)).toBe('https://mercury.test/nl/help')
    expect(buildManualMercuryBusinessDashboardUrl(params)).toBe(
      'https://mercury.test/nl/business/dashboard'
    )
    expect(buildManualMercuryPricingUrl({ ...params, locale: 'fr' })).toBe(
      'https://mercury.test/en/pricing'
    )
    expect(
      buildManualMercuryClientUrl({
        ...params,
        clientContextId: 'client 1',
      })
    ).toBe('https://mercury.test/nl/advisor/clients/client%201')
  })

  it('builds logout post URLs with an encoded Venus return URL', () => {
    expect(
      buildManualLogoutPostUrl({
        mercuryUrl: 'https://mercury.test/',
        locale: 'nl',
        origin: 'https://valuation.test',
      })
    ).toBe(
      'https://mercury.test/nl/auth/login?returnUrl=https%3A%2F%2Fvaluation.test%2Fnl%2Freports%2Fnew'
    )
  })

  it('detects completed valuation surfaces', () => {
    expect(hasCompletedManualValuation({ valuation: 123 }, null)).toBe(true)
    expect(hasCompletedManualValuation(null, { htmlReport: '<main />' })).toBe(true)
    expect(hasCompletedManualValuation({ valuation: Number.NaN }, {})).toBe(false)
  })

  it('decides manual back navigation without reading browser globals', () => {
    expect(
      getManualBackNavigationDecision({
        returnUrl: '/nl/advisor/clients/client-1',
        currentLocale: 'nl',
        historyLength: 10,
        mercuryUrl: 'https://mercury.test/',
      })
    ).toEqual({ kind: 'exit-client-view' })

    expect(
      getManualBackNavigationDecision({
        returnUrl: '/nl/accountant_listings',
        clientContextId: 'client-1',
        currentLocale: 'nl',
        historyLength: 10,
        mercuryUrl: 'https://mercury.test/',
      })
    ).toEqual({ kind: 'exit-client-view' })

    expect(
      getManualBackNavigationDecision({
        returnUrl: null,
        sourceApp: 'client_dashboard',
        currentLocale: 'nl',
        historyLength: 1,
        mercuryUrl: 'https://mercury.test/',
      })
    ).toEqual({
      kind: 'redirect',
      url: 'https://mercury.test/nl/business/dashboard',
    })

    expect(
      getManualBackNavigationDecision({
        returnUrl: null,
        currentLocale: 'nl',
        historyLength: 2,
        mercuryUrl: 'https://mercury.test/',
      })
    ).toEqual({ kind: 'router-back' })
  })

  it('builds Mercury return targets for delete and switch-workspace flows', () => {
    expect(
      buildManualSafeMercuryReturnUrl({
        returnUrl: 'https://upswitch.app/en/advisor/settings',
        clientContextId: 'client-1',
        currentLocale: 'nl',
        sourceApp: 'mercury',
      })
    ).toContain('/nl/advisor/settings')

    expect(
      buildManualSwitchWorkspaceReturnUrl({
        returnUrl: 'https://upswitch.app/en/advisor/clients/client-1',
        sourceApp: 'Mercury',
        relationshipId: 'client-1',
        currentLocale: 'nl',
      })
    ).toContain('/nl/advisor/clients/client-1')

    expect(
      buildManualSwitchWorkspaceReturnUrl({
        returnUrl: 'https://upswitch.app/en/accountant_listings',
        sourceApp: 'mercury',
        currentLocale: 'nl',
      })
    ).toBeNull()
  })

  it('builds safe exit targets with client fallback and celebration marker', () => {
    expect(
      buildManualExitClientViewTarget({
        returnUrl: null,
        clientContextId: 'rel-1',
        currentLocale: 'nl',
        sourceApp: 'mercury',
        mercuryUrl: 'https://mercury.test/',
        hasCompletedValuation: true,
      })
    ).toContain('/nl/advisor/clients/rel-1')
  })

  it('builds fallback URLs for client and dashboard exits', () => {
    expect(
      buildManualExitClientViewFallbackUrl({
        clientContextId: 'rel-1',
        currentLocale: 'nl',
        mercuryUrl: 'https://mercury.test/',
      })
    ).toBe('https://mercury.test/nl/advisor/clients/rel-1')

    expect(
      buildManualExitClientViewFallbackUrl({
        currentLocale: 'nl',
        sourceApp: 'seller',
        mercuryUrl: 'https://mercury.test/',
      })
    ).toContain('/nl/business')
  })

  it('builds import-review targets with encoded relationship ids and session keys', () => {
    expect(getManualImportReviewSessionKey(' val_abc12345 ')).toBe('val_abc12345')
    expect(getManualImportReviewSessionKey('report_123')).toBeNull()

    expect(
      buildManualImportReviewTarget({
        relationshipId: 'client 1',
        currentLocale: 'nl',
        resolvedReportId: 'val_abc12345',
        mercuryUrl: 'https://mercury.test/',
      })
    ).toEqual({
      targetPath: '/nl/advisor/clients/client%201?import_review=1&session_key=val_abc12345',
      targetUrl:
        'https://mercury.test/nl/advisor/clients/client%201?import_review=1&session_key=val_abc12345',
    })
  })

  it('resolves listing relationships and builds wizard urls', () => {
    expect(
      resolveManualListingRelationshipId({
        targetAccountantCustomerId: null,
        clientContextId: 'client-1',
        contextRelationshipId: 'client-2',
      })
    ).toBe('client-1')

    expect(
      buildManualListingWizardUrl({
        mercuryUrl: 'https://mercury.test/',
        locale: 'nl',
        reportId: 'report 1',
        relationshipId: 'client 1',
        visibility: 'private',
      })
    ).toBe(
      'https://mercury.test/nl/advisor/clients/client%201/listings/new?report_id=report%201&visibility=private'
    )

    expect(
      buildManualListingWizardUrl({
        mercuryUrl: 'https://mercury.test/',
        locale: 'fr',
        reportId: 'report-1',
        visibility: 'published',
      })
    ).toBe('https://mercury.test/en/business/listing/new?report_id=report-1')
  })

  it('builds continue-to-listing return urls for advisor clients with celebration', () => {
    const url = buildManualContinueToListingUrl({
      mercuryUrl: 'https://mercury.test/',
      locale: 'nl',
      clientContextId: 'client-1',
      hasCompletedValuation: true,
    })
    expect(url).toContain('/nl/advisor/clients/client-1')
    expect(url).toContain('from=valuation')
  })

  it('builds continue-to-listing return urls for sellers via stored return_url', () => {
    const url = buildManualContinueToListingUrl({
      mercuryUrl: 'https://mercury.test/',
      locale: 'nl',
      returnUrl: 'https://mercury.test/nl/business/dashboard',
      sourceApp: 'business_dashboard_orphaned_seller',
      hasCompletedValuation: true,
    })
    expect(url).toContain('/nl/business/dashboard')
    expect(url).toContain('from=valuation')
    expect(url).not.toContain('/advisor/')
  })

  it('builds continue-to-listing fallback for sellers without return_url', () => {
    const url = buildManualContinueToListingUrl({
      mercuryUrl: 'https://mercury.test/',
      locale: 'nl',
      sourceApp: 'business_dashboard_orphaned_seller',
      hasCompletedValuation: true,
    })
    expect(url).toContain('/nl/business/dashboard')
    expect(url).toContain('from=valuation')
  })

  it('strips stale phase= from seller dashboard return URLs before continue navigation', () => {
    const url = buildManualContinueToListingUrl({
      mercuryUrl: 'https://mercury.test/',
      locale: 'nl',
      returnUrl: 'https://mercury.test/nl/business/dashboard?phase=valuation',
      sourceApp: 'business_dashboard_orphaned_seller',
      hasCompletedValuation: true,
    })
    expect(url).toContain('/nl/business/dashboard')
    expect(url).toContain('from=valuation')
    expect(url).not.toContain('phase=valuation')
  })

  it('stripStaleSellerDashboardPhaseFromReturnUrl preserves non-phase query params', () => {
    expect(
      stripStaleSellerDashboardPhaseFromReturnUrl(
        'https://mercury.test/nl/business/dashboard?phase=valuation&action=invite_accountant'
      )
    ).toBe('https://mercury.test/nl/business/dashboard?action=invite_accountant')
  })

  it('builds continue-to-listing fallback for ambiguous source to advisor dashboard', () => {
    const url = buildManualContinueToListingUrl({
      mercuryUrl: 'https://mercury.test/',
      locale: 'fr',
      sourceApp: 'mercury',
      hasCompletedValuation: false,
    })
    expect(url).toContain('/en/advisor/dashboard')
    expect(url).not.toContain('from=valuation')
  })
})
