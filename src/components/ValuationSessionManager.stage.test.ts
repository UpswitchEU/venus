import { describe, expect, it } from 'vitest'
import type { ValuationSession } from '../types/valuation'
import { resolveValuationSessionStage } from './ValuationSessionManager.stage'

const pending = {
  bootstrapError: null,
  bootstrapMode: undefined,
  delegatedHandoffSignals: {
    isFromMercury: true,
    urlIndicatesExisting: true,
    clientId: 'client-1',
    mode: 'accountant',
  },
  isBootstrapping: true,
  isFromMercury: true,
  isInitializing: true,
  isLoading: true,
  reportId: 'val_existing',
  requiresRenderableAssets: true,
  session: null,
  status: 'loading',
  urlIndicatesExisting: true,
} satisfies Parameters<typeof resolveValuationSessionStage>[0]

describe('session stage recovery', () => {
  it('waits for an existing delegated report while the request is pending', () => {
    expect(resolveValuationSessionStage(pending)).toBe('loading')
  })

  it('surfaces a terminal load failure even when bootstrap has not finished', () => {
    expect(
      resolveValuationSessionStage({
        ...pending,
        isInitializing: false,
        isLoading: false,
        status: 'error',
      })
    ).toBe('error')
  })

  it('does not replace a terminal failure with an optimistic Mercury shell', () => {
    expect(
      resolveValuationSessionStage({
        ...pending,
        status: 'error',
        delegatedHandoffSignals: { isFromMercury: true, urlIndicatesExisting: false },
        reportId: 'new',
        urlIndicatesExisting: false,
      })
    ).toBe('error')
  })

  it('preserves a rendered report if a background refresh fails', () => {
    expect(
      resolveValuationSessionStage({
        ...pending,
        status: 'error',
        session: {
          reportId: 'val_existing',
          htmlReport: '<article>Existing report</article>',
        } as ValuationSession,
      })
    ).toBe('data-entry')
  })
})
