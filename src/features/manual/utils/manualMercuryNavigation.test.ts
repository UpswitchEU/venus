// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualContinueToListingUrl,
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
  resolveManualMercuryReportId,
  stripStaleSellerDashboardPhaseFromReturnUrl,
} from './manualMercuryNavigation'
import {
  recordManualValuationSaved,
  resetManualValuationSaveReceiptsForTests,
} from './manualValuationSaveReceipt'

const SAVED_REPORT_ID = '4dfdd27d-e756-4227-8db2-3d2e247553b6'
const OTHER_REPORT_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

describe('manualMercuryNavigation', () => {
  it('normalizes supported Mercury locales', () => {
    expect(getManualMercuryLocale('nl')).toBe('nl')
    expect(getManualMercuryLocale('en')).toBe('en')
    expect(getManualMercuryLocale('fr')).toBe('fr')
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
      'https://mercury.test/fr/pricing'
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

  it('reports a completed valuation only when one was saved during this visit', () => {
    resetManualValuationSaveReceiptsForTests()
    // A result on screen proves nothing: Mercury's "Start valuation" re-opens the existing
    // report, and leaving it after a review must not come back as "Valuation added".
    expect(
      hasCompletedManualValuation(
        { valuation: 123 },
        { reportId: SAVED_REPORT_ID, htmlReport: '<main />', valuationResult: {} }
      )
    ).toBe(false)

    recordManualValuationSaved([SAVED_REPORT_ID])
    expect(hasCompletedManualValuation(null, { reportId: SAVED_REPORT_ID })).toBe(true)
    expect(hasCompletedManualValuation({ id: SAVED_REPORT_ID }, null)).toBe(true)
    expect(hasCompletedManualValuation(null, null, SAVED_REPORT_ID)).toBe(true)
    expect(hasCompletedManualValuation(null, { reportId: OTHER_REPORT_ID })).toBe(false)
    resetManualValuationSaveReceiptsForTests()
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

  it('appends newClientName when exiting back to Mercury client detail', () => {
    const url = buildManualExitClientViewTarget({
      returnUrl: null,
      clientContextId: 'rel-1',
      currentLocale: 'nl',
      sourceApp: 'mercury',
      mercuryUrl: 'https://mercury.test/',
      hasCompletedValuation: true,
      companyName: '  Acme BV  ',
    })

    expect(url).toContain('/nl/advisor/clients/rel-1')
    expect(url).toMatch(/newClientName=Acme(\+|%20)BV/)
  })

  it('resolves the saved report UUID for Mercury from resolved id, report, or session', () => {
    expect(resolveManualMercuryReportId(null, null, SAVED_REPORT_ID)).toBe(SAVED_REPORT_ID)
    expect(
      resolveManualMercuryReportId({ id: SAVED_REPORT_ID }, { reportId: OTHER_REPORT_ID })
    ).toBe(SAVED_REPORT_ID)
    expect(resolveManualMercuryReportId(null, { reportId: SAVED_REPORT_ID })).toBe(SAVED_REPORT_ID)
    expect(resolveManualMercuryReportId(null, null)).toBeUndefined()
  })

  // F-12: Mercury matches `reportId` against the dossier's latest report UUID. A session
  // key (before the save commits) kept it re-fetching for ~32 s and then giving up.
  it('never hands Mercury a session key as the report id', () => {
    expect(resolveManualMercuryReportId(null, { reportId: SAVED_REPORT_ID }, 'val_abc12345')).toBe(
      SAVED_REPORT_ID
    )
    expect(
      resolveManualMercuryReportId(null, { reportId: 'val_abc12345' }, 'val_abc12345')
    ).toBeUndefined()

    const url = buildManualExitClientViewTarget({
      returnUrl: null,
      clientContextId: 'rel-1',
      currentLocale: 'nl',
      sourceApp: 'mercury',
      mercuryUrl: 'https://mercury.test/',
      hasCompletedValuation: true,
      reportId: 'val_abc12345',
    })
    expect(url).toContain('from=valuation')
    expect(url).not.toContain('reportId=')
  })

  it('appends reportId on celebration return so Mercury can latch the saved report', () => {
    const url = buildManualExitClientViewTarget({
      returnUrl: null,
      clientContextId: 'rel-1',
      currentLocale: 'nl',
      sourceApp: 'mercury',
      mercuryUrl: 'https://mercury.test/',
      hasCompletedValuation: true,
      reportId: SAVED_REPORT_ID,
    })

    expect(url).toContain('from=valuation')
    expect(url).toContain(`reportId=${SAVED_REPORT_ID}`)
  })

  it('does not append reportId when the valuation was not completed', () => {
    const url = buildManualExitClientViewTarget({
      returnUrl: null,
      clientContextId: 'rel-1',
      currentLocale: 'nl',
      sourceApp: 'mercury',
      mercuryUrl: 'https://mercury.test/',
      hasCompletedValuation: false,
      reportId: SAVED_REPORT_ID,
    })

    expect(url).not.toContain('reportId=')
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
      targetPath: '/nl/advisor/import-review?clientId=client+1&sessionKey=val_abc12345',
      targetUrl:
        'https://mercury.test/nl/advisor/import-review?clientId=client+1&sessionKey=val_abc12345',
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
    ).toBe('https://mercury.test/fr/business/listing/new?report_id=report-1')
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

  it('returns completed owner-company valuations with refresh and report markers', () => {
    const url = buildManualExitClientViewTarget({
      mercuryUrl: 'https://www.upswitch.app/',
      currentLocale: 'nl',
      returnUrl:
        'https://www.upswitch.app/nl/business/companies/4dfdd27d-e756-4227-8db2-3d2e247553b6',
      sourceApp: 'owner_workspace_startup_valuation',
      hasCompletedValuation: true,
      reportId: OTHER_REPORT_ID,
    })
    expect(url).toContain('/nl/business/companies/4dfdd27d-e756-4227-8db2-3d2e247553b6')
    expect(url).toContain('from=valuation')
    expect(url).toContain(`reportId=${OTHER_REPORT_ID}`)
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
    expect(url).toContain('/fr/advisor/dashboard')
    expect(url).not.toContain('from=valuation')
  })
})
