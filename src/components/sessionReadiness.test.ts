import { describe, expect, it } from 'vitest'
import {
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
