import { describe, expect, it } from 'vitest'
import {
  buildSeedIdentity,
  canRenderReportSession,
  hasAssetsInSession,
  shouldAllowOptimisticMercuryRender,
  shouldSeedOptimisticMercuryShell,
} from './sessionReadiness'

describe('sessionReadiness', () => {
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
      expect(buildSeedIdentity({ authUser: { email: 'a@b' }, clientContext: emptyClientCtx })).toBeNull()
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
