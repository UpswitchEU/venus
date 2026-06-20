import { describe, expect, it, vi } from 'vitest'
import type { IdentityState } from '../lib/bootstrap/types'
import type { DelegatedMercuryHandoffSignals } from '../lib/mercury/sessionReadiness'
import type { ValuationSession } from '../types/valuation'
import {
  buildOptimisticMercuryShellSession,
  getOptimisticMercuryShellRefusalReason,
} from './useSessionStore.optimisticShell'

function accountantForClientIdentity(): IdentityState {
  return {
    type: 'accountant_for_client',
    userId: 'acc-1',
    clientContext: {
      accountantUserId: 'acc-1',
      clientUserId: 'client-1',
      relationshipId: 'rel-1',
      permissions: {
        canCreateValuations: true,
        canEditReports: true,
        canViewReports: true,
      },
    },
  }
}

describe('useSessionStore.optimisticShell', () => {
  it('refuses accountant-for-client identities before seeding an optimistic shell', () => {
    expect(
      getOptimisticMercuryShellRefusalReason({
        identity: accountantForClientIdentity(),
      })
    ).toBe('accountant_for_client')
  })

  it('refuses Mercury delegated accountant handoff signals', () => {
    const delegatedSignals: DelegatedMercuryHandoffSignals = {
      clientId: 'client-1',
      isFromMercury: true,
      mode: 'accountant',
      urlIndicatesExisting: true,
    }

    expect(
      getOptimisticMercuryShellRefusalReason({
        delegatedHandoffSignals: delegatedSignals,
        identity: { type: 'authenticated', userId: 'user-1' },
      })
    ).toBe('delegated_handoff')
  })

  it('allows authenticated non-delegated shell seeds', () => {
    expect(
      getOptimisticMercuryShellRefusalReason({
        delegatedHandoffSignals: {
          isFromMercury: true,
          mode: 'owner',
          urlIndicatesExisting: false,
        },
        identity: { type: 'authenticated', userId: 'user-1' },
      })
    ).toBeNull()
  })

  it('builds a complete manual optimistic shell session with stable timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T12:00:00.000Z'))

    const session = buildOptimisticMercuryShellSession({
      htmlReport: '<main>ready</main>',
      name: 'Acme valuation',
      reportId: 'val_seed',
      reportReady: true,
      sessionData: {
        _optimisticMercuryShell: true,
        company_name: 'Acme BV',
      } as ValuationSession['sessionData'],
      status: 'draft',
      valuationResult: {
        valuation_id: 'val_seed',
      } as ValuationSession['valuationResult'],
    })

    expect(session).toMatchObject({
      currentView: 'manual',
      dataSource: 'manual',
      htmlReport: '<main>ready</main>',
      name: 'Acme valuation',
      partialData: {},
      reportId: 'val_seed',
      reportReady: true,
      status: 'draft',
      valuationResult: {
        valuation_id: 'val_seed',
      },
    })
    expect(session.createdAt).toEqual(new Date('2026-06-20T12:00:00.000Z'))
    expect(session.updatedAt).toEqual(new Date('2026-06-20T12:00:00.000Z'))

    vi.useRealTimers()
  })

  it('preserves provided createdAt and updatedAt values', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    const updatedAt = new Date('2026-02-01T00:00:00.000Z')

    const session = buildOptimisticMercuryShellSession({
      createdAt,
      currentView: 'conversational',
      dataSource: 'conversation',
      partialData: { step: 2 },
      reportId: 'val_existing_seed',
      updatedAt,
    })

    expect(session.createdAt).toBe(createdAt)
    expect(session.updatedAt).toBe(updatedAt)
    expect(session.currentView).toBe('conversational')
    expect(session.dataSource).toBe('conversation')
    expect(session.partialData).toEqual({ step: 2 })
  })
})
