import { describe, expect, it, vi } from 'vitest'
import {
  buildMercuryDelegatedHandoffSignals,
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  buildSeedIdentity,
  canRenderReportSession,
  hasAssetsInSession,
  isDelegatedClientContextReadyForBootstrap,
  isDelegatedClientContextReadyForUrl,
  isDelegatedMercuryAccountantHandoff,
  shouldAllowOptimisticMercuryRender,
  shouldSeedOptimisticMercuryShell,
  shouldWaitForMercuryClientContextBeforeBootstrap,
  validateMercuryAdvisorPrefillContract,
} from '../lib/mercury/sessionReadiness'

describe('sessionReadiness', () => {
  describe('Mercury advisor prefill contract', () => {
    const validSession = {
      reportId: 'val_prefilled',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      partialData: {},
      sessionData: {
        company_name: 'LGS workshop',
        business_type_id: 'manufacturing',
        country_code: 'BE',
        revenue: 1_000_000,
        ebitda: 120_000,
        current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 120_000 },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('accepts one complete source-bound advisor year', () => {
      expect(validateMercuryAdvisorPrefillContract(validSession)).toBeNull()
    })

    it('accepts canonical accounting year_data and reconciles scalars to the latest year', () => {
      expect(
        validateMercuryAdvisorPrefillContract({
          ...validSession,
          sessionData: {
            company_name: 'LGS workshop',
            business_type_id: 'manufacturing',
            country_code: 'BE',
            revenue: 1_000_000,
            ebitda: 120_000,
            year_data: {
              2024: { revenue: 900_000, ebitda: 90_000 },
              2025: { revenue: 1_000_000, ebitda: 120_000 },
            },
          },
        })
      ).toBeNull()

      expect(
        validateMercuryAdvisorPrefillContract({
          ...validSession,
          sessionData: {
            company_name: 'LGS workshop',
            business_type_id: 'manufacturing',
            country_code: 'BE',
            revenue: 900_000,
            ebitda: 120_000,
            year_data: {
              2025: { revenue: 1_000_000, ebitda: 120_000 },
            },
          },
        })
      ).toMatchObject({ code: 'VALUATION_PREFILL_INCONSISTENT' })

      expect(
        validateMercuryAdvisorPrefillContract({
          ...validSession,
          sessionData: {
            company_name: 'LGS workshop',
            business_type_id: 'manufacturing',
            country_code: 'BE',
            revenue: '9007199254740993.10',
            ebitda: '120000.00',
            year_data: {
              2025: { revenue: '9007199254740993.1', ebitda: '120000' },
            },
          },
        })
      ).toBeNull()

      expect(
        validateMercuryAdvisorPrefillContract({
          ...validSession,
          sessionData: {
            company_name: 'LGS workshop',
            business_type_id: 'manufacturing',
            country_code: 'BE',
            revenue: '9007199254740993.11',
            ebitda: '120000',
            year_data: {
              2025: { revenue: '9007199254740993.10', ebitda: '120000' },
            },
          },
        })
      ).toMatchObject({ code: 'VALUATION_PREFILL_INCONSISTENT' })
    })

    it('rejects a delegated session that would render a blank company form', () => {
      expect(
        validateMercuryAdvisorPrefillContract({
          ...validSession,
          sessionData: { ...validSession.sessionData, company_name: '' },
        })
      ).toMatchObject({ code: 'CLIENT_IDENTITY_INCOMPLETE' })
    })

    it('rejects a delegated session without a complete fiscal year', () => {
      expect(
        validateMercuryAdvisorPrefillContract({
          ...validSession,
          sessionData: {
            ...validSession.sessionData,
            revenue: undefined,
            ebitda: undefined,
            current_year_data: { year: 2025, revenue: 1_000_000 },
          },
        })
      ).toMatchObject({ code: 'VALUATION_NOT_READY' })
    })
  })

  it('keeps existing Mercury reports behind loading until assets are renderable', () => {
    expect(
      canRenderReportSession({
        session: {
          reportId: 'val_existing',
          sessionData: {},
          valuationResult: undefined,
          htmlReport: undefined,
          reportReady: false,
          status: 'completed',
        },
        reportId: 'val_existing',
        requiresRenderableAssets: true,
      })
    ).toBe(false)
  })

  it('allows render once valuation assets are present', () => {
    expect(
      canRenderReportSession({
        session: {
          reportId: 'val_existing',
          sessionData: {
            valuationResult: { equity_value_mid: 500000 },
          },
          valuationResult: undefined,
          htmlReport: undefined,
          reportReady: false,
          status: 'completed',
        },
        reportId: 'val_existing',
        requiresRenderableAssets: true,
      })
    ).toBe(true)
  })

  it('only allows optimistic Mercury rendering for brand new drafts', () => {
    expect(
      shouldAllowOptimisticMercuryRender({
        isFromMercury: true,
        isBootstrapping: true,
        isLoading: false,
        bootstrapMode: 'new',
      })
    ).toBe(true)

    expect(
      shouldAllowOptimisticMercuryRender({
        isFromMercury: true,
        isBootstrapping: true,
        isLoading: false,
        bootstrapMode: 'existing',
      })
    ).toBe(false)
  })

  it('blocks optimistic Mercury render for delegated handoffs and bootstrap mismatch', () => {
    expect(
      shouldAllowOptimisticMercuryRender({
        isFromMercury: true,
        isBootstrapping: true,
        isLoading: false,
        bootstrapMode: 'new',
        isDelegatedAccountantHandoff: true,
      })
    ).toBe(false)

    expect(
      shouldAllowOptimisticMercuryRender({
        isFromMercury: true,
        isBootstrapping: true,
        isLoading: false,
        bootstrapMode: 'new',
        delegatedHandoffSignals: buildMercuryDelegatedHandoffSignals({
          isFromMercury: true,
          reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          mode: 'accountant',
        }),
      })
    ).toBe(false)

    expect(
      shouldAllowOptimisticMercuryRender({
        isFromMercury: true,
        isBootstrapping: true,
        isLoading: false,
        bootstrapMode: 'new',
        urlIndicatesExisting: true,
      })
    ).toBe(false)
  })

  it('detects nested session assets', () => {
    expect(
      hasAssetsInSession({
        reportId: 'val_nested',
        sessionData: {
          html_report: '<html>ready</html>',
        },
        valuationResult: undefined,
        htmlReport: undefined,
      })
    ).toBe(true)
  })

  it('seeds the Mercury fast shell for existing reports while bootstrap is still running', () => {
    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'val_existing',
        urlIndicatesExisting: true,
        currentSessionReportId: null,
        status: 'idle',
      })
    ).toBe(true)

    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'val_next',
        urlIndicatesExisting: true,
        currentSessionReportId: 'val_previous',
        status: 'loaded',
      })
    ).toBe(true)
  })

  it('buildMercuryDelegatedHandoffSignalsFromBootstrapContext mirrors bootstrap fields', () => {
    const signals = buildMercuryDelegatedHandoffSignalsFromBootstrapContext({
      sourceApp: 'mercury',
      reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
      clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
      mercuryPersonaMode: 'accountant',
    })
    expect(isDelegatedMercuryAccountantHandoff(signals)).toBe(true)
  })

  it('buildMercuryDelegatedHandoffSignals mirrors URL + report id', () => {
    const signals = buildMercuryDelegatedHandoffSignals({
      isFromMercury: true,
      reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
      clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
      mode: 'accountant',
    })
    expect(signals.urlIndicatesExisting).toBe(true)
    expect(isDelegatedMercuryAccountantHandoff(signals)).toBe(true)
  })

  describe('shouldWaitForMercuryClientContextBeforeBootstrap', () => {
    const previewUrl =
      'https://preview.valuation.upswitch.app/nl/reports/dba236f5-31eb-4ab9-b995-e52c64dce70c?mode=accountant&clientId=e25ce3b7-2e1e-4c6d-890d-eb826d527afd&source=mercury'

    it('waits for preview incident advisor handoff (clientId on existing report)', () => {
      expect(
        shouldWaitForMercuryClientContextBeforeBootstrap({
          sourceApp: 'mercury',
          reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          url: previewUrl,
        })
      ).toBe(true)
    })

    it('waits when clientToken hint is present', () => {
      expect(
        shouldWaitForMercuryClientContextBeforeBootstrap({
          sourceApp: 'mercury',
          reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
          hasClientTokenHint: true,
        })
      ).toBe(true)
    })

    it('does not wait for Mercury owner existing report without delegation signals', () => {
      expect(
        shouldWaitForMercuryClientContextBeforeBootstrap({
          sourceApp: 'mercury',
          reportId: 'val_owner_existing',
          url: 'https://venus.test/nl/reports/val_owner_existing?source=mercury',
        })
      ).toBe(false)
    })

    it('waits for mode=accountant on existing report when clientId is absent', () => {
      expect(
        shouldWaitForMercuryClientContextBeforeBootstrap({
          sourceApp: 'mercury',
          reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
          mercuryPersonaMode: 'accountant',
        })
      ).toBe(true)
    })

    it('does not rely on bootstrap context.url without search params (persona mode is explicit)', () => {
      expect(
        shouldWaitForMercuryClientContextBeforeBootstrap({
          sourceApp: 'mercury',
          reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
          url: 'https://venus.test/nl/reports/dba236f5-31eb-4ab9-b995-e52c64dce70c',
        })
      ).toBe(false)
    })
  })

  describe('isDelegatedMercuryAccountantHandoff', () => {
    const existingUuid = 'dba236f5-31eb-4ab9-b995-e52c64dce70c'

    it('detects clientId, clientToken, acting-as-client, and mode=accountant on existing reports', () => {
      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
        })
      ).toBe(true)

      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          clientToken: 'tok_abc',
        })
      ).toBe(true)

      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          isActingAsClient: true,
        })
      ).toBe(true)

      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          urlIndicatesExisting: true,
          mode: 'accountant',
        })
      ).toBe(true)

      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          urlIndicatesExisting: true,
          mode: 'accountant',
          clientId: existingUuid,
        })
      ).toBe(true)
    })

    it('does not treat non-Mercury or seller persona as delegated', () => {
      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: false,
          clientId: 'c1',
        })
      ).toBe(false)

      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          urlIndicatesExisting: true,
          mode: 'seller',
        })
      ).toBe(false)

      expect(
        isDelegatedMercuryAccountantHandoff({
          isFromMercury: true,
          mode: 'accountant',
          urlIndicatesExisting: false,
        })
      ).toBe(false)
    })
  })

  it('does not seed the Mercury fast shell for advisor delegated handoffs', () => {
    const delegated = isDelegatedMercuryAccountantHandoff({
      isFromMercury: true,
      urlIndicatesExisting: true,
      clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
      mode: 'accountant',
    })

    expect(delegated).toBe(true)
    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
        urlIndicatesExisting: true,
        currentSessionReportId: null,
        status: 'idle',
        isDelegatedAccountantHandoff: delegated,
      })
    ).toBe(false)

    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
        urlIndicatesExisting: true,
        currentSessionReportId: null,
        status: 'idle',
        delegatedHandoffSignals: buildMercuryDelegatedHandoffSignals({
          isFromMercury: true,
          reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          mode: 'accountant',
        }),
      })
    ).toBe(false)
  })

  it('still seeds for Mercury owner existing reports without advisor delegation', () => {
    const delegated = isDelegatedMercuryAccountantHandoff({
      isFromMercury: true,
      urlIndicatesExisting: true,
    })
    expect(delegated).toBe(false)
    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'val_owner_existing',
        urlIndicatesExisting: true,
        currentSessionReportId: null,
        status: 'idle',
        isDelegatedAccountantHandoff: delegated,
      })
    ).toBe(true)
  })

  describe('buildSeedIdentity (React #185 regression guard)', () => {
    const emptyClientCtx = {
      isActingAsClient: false,
      accountant: null,
      client: null,
      relationshipId: null,
    }

    it('returns null when no auth user — caller must bail to avoid engine-null seed', () => {
      expect(buildSeedIdentity({ authUser: null, clientContext: emptyClientCtx })).toBeNull()
      expect(buildSeedIdentity({ authUser: undefined, clientContext: emptyClientCtx })).toBeNull()
      expect(
        buildSeedIdentity({ authUser: { email: 'a@b' }, clientContext: emptyClientCtx })
      ).toBeNull()
    })

    it('returns plain authenticated identity outside accountant flow', () => {
      const id = buildSeedIdentity({
        authUser: { id: 'user-123', email: 'owner@example.com', name: 'Alice Owner' },
        clientContext: emptyClientCtx,
      })
      expect(id).toEqual({
        type: 'authenticated',
        userId: 'user-123',
        email: 'owner@example.com',
        firstName: 'Alice',
        lastName: 'Owner',
      })
    })

    it('returns accountant_for_client identity with clientContext when acting as a client', () => {
      const id = buildSeedIdentity({
        authUser: { id: 'acc-1', email: 'acc@firm.be', name: 'Beth Accountant' },
        clientContext: {
          isActingAsClient: true,
          accountant: { id: 'acc-1', email: 'acc@firm.be' },
          client: { id: 'cli-9', email: 'client@biz.be' },
          relationshipId: 'rel-42',
        },
      })
      expect(id?.type).toBe('accountant_for_client')
      expect(id?.userId).toBe('acc-1')
      expect(id?.clientContext).toEqual({
        accountantUserId: 'acc-1',
        accountantEmail: 'acc@firm.be',
        clientUserId: 'cli-9',
        clientEmail: 'client@biz.be',
        relationshipId: 'rel-42',
        permissions: {
          canCreateValuations: true,
          canViewReports: true,
          canEditReports: true,
        },
      })
    })

    it('falls back to authenticated when accountant flow lacks a relationshipId', () => {
      const id = buildSeedIdentity({
        authUser: { id: 'acc-1', email: 'acc@firm.be', name: 'Beth' },
        clientContext: {
          isActingAsClient: true,
          accountant: { id: 'acc-1', email: 'acc@firm.be' },
          client: null,
          relationshipId: null,
        },
      })
      expect(id?.type).toBe('authenticated')
    })

    it('does not seed accountant_for_client when URL clientId mismatches relationshipId', () => {
      vi.stubGlobal('window', {
        location: { search: '?clientId=client-b&source=mercury' },
      } as Window)

      const id = buildSeedIdentity({
        authUser: { id: 'acc-1', email: 'acc@firm.be', name: 'Beth' },
        clientContext: {
          isActingAsClient: true,
          accountant: { id: 'acc-1', email: 'acc@firm.be' },
          client: null,
          relationshipId: 'client-a',
        },
      })

      expect(id?.type).toBe('authenticated')
      vi.unstubAllGlobals()
    })

    it('keeps clientUserId nullable when the invitation is unaccepted', () => {
      const id = buildSeedIdentity({
        authUser: { id: 'acc-1', email: 'acc@firm.be', name: 'Beth' },
        clientContext: {
          isActingAsClient: true,
          accountant: { id: 'acc-1', email: 'acc@firm.be' },
          client: null,
          relationshipId: 'rel-pending',
        },
      })
      expect(id?.clientContext?.clientUserId).toBeNull()
    })
  })

  describe('isDelegatedClientContextReadyForUrl', () => {
    it('requires relationshipId to match URL clientId when present', () => {
      expect(
        isDelegatedClientContextReadyForUrl({
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
        })
      ).toBe(true)

      expect(
        isDelegatedClientContextReadyForUrl({
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'stale-client-id',
        })
      ).toBe(false)
    })

    it('rejects shape-only readiness when acting-as-client is false', () => {
      expect(
        isDelegatedClientContextReadyForUrl({
          clientId: 'client-a',
          isActingAsClient: false,
          accountantId: 'acc-1',
          relationshipId: 'client-a',
        })
      ).toBe(false)
    })

    it('allows shape-only readiness when URL has no clientId', () => {
      expect(
        isDelegatedClientContextReadyForUrl({
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'rel-1',
        })
      ).toBe(true)
    })

    it('falls back to window URL clientId when bootstrap context omits clientId', () => {
      vi.stubGlobal('window', {
        location: { search: '?clientId=url-client&source=mercury' },
      } as Window)

      expect(
        isDelegatedClientContextReadyForUrl({
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'url-client',
        })
      ).toBe(true)

      expect(
        isDelegatedClientContextReadyForUrl({
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'stale-client',
        })
      ).toBe(false)

      vi.unstubAllGlobals()
    })
  })

  describe('isDelegatedClientContextReadyForBootstrap', () => {
    it('requires context gate resolution for delegated Mercury opens', () => {
      expect(
        isDelegatedClientContextReadyForBootstrap({
          needsMercuryClientContext: true,
          contextGateResolved: false,
          clientId: 'client-a',
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'client-a',
        })
      ).toBe(false)

      expect(
        isDelegatedClientContextReadyForBootstrap({
          needsMercuryClientContext: true,
          contextGateResolved: true,
          clientId: 'client-a',
          isActingAsClient: true,
          accountantId: 'acc-1',
          relationshipId: 'client-a',
        })
      ).toBe(true)
    })

    it('skips gate check for non-delegated opens', () => {
      expect(
        isDelegatedClientContextReadyForBootstrap({
          needsMercuryClientContext: false,
          contextGateResolved: false,
          isActingAsClient: false,
          relationshipId: null,
        })
      ).toBe(true)
    })
  })

  it('does not seed the Mercury fast shell during active loads or duplicate seeds', () => {
    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'val_existing',
        urlIndicatesExisting: true,
        currentSessionReportId: null,
        status: 'loading',
      })
    ).toBe(false)

    expect(
      shouldSeedOptimisticMercuryShell({
        isFromMercury: true,
        isBootstrapping: true,
        reportId: 'val_existing',
        urlIndicatesExisting: true,
        currentSessionReportId: null,
        status: 'idle',
        seededReportId: 'val_existing',
      })
    ).toBe(false)
  })
})
