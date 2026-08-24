import { beforeEach, describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '@/types/valuation'
import {
  applyValuationSnapshotToReconnectDraft,
  beginAccountingReconnectHandoffResync,
  beginAccountingReconnectResync,
  bindAccountingReconnectHandoff,
  bindAccountingReconnectOAuth,
  consumeReadyAccountingReconnect,
  markAccountingReconnectFailed,
  markAccountingReconnectReady,
  persistAccountingReconnectIntent,
  reconnectDraftReviewYear,
} from './accountingReconnectResume'

function draft(): ManualValuationFormData {
  return {
    companyName: 'Source Honest BV',
    businessType: 'services',
    industry: 'services',
    country: 'BE',
    yearFounded: '2010',
    businessStructure: 'company',
    ownerManagers: 1,
    fteEmployees: 5,
    yearlyFinancials: [
      { year: '2025', revenue: 700_000, ebitda: 700_000 },
      { year: '2024', revenue: 600_000, ebitda: 590_000 },
      { year: '2027', revenue: 900_000, ebitda: 180_000, isForecast: true },
    ],
    current_year_data: { year: 2025, revenue: 700_000, ebitda: 700_000 },
    historical_years_data: [{ year: 2024, revenue: 600_000, ebitda: 590_000 }],
  }
}

describe('accounting reconnect recovery transaction', () => {
  beforeEach(() => sessionStorage.clear())

  it('binds provider, client and nonce and consumes a ready intent exactly once', () => {
    const storage = sessionStorage
    const formData = draft()
    expect(
      persistAccountingReconnectIntent(storage, {
        provider: 'silverfin',
        clientId: 'client-1',
        reportId: 'report-1',
        formData,
      })
    ).not.toBeNull()
    expect(
      bindAccountingReconnectOAuth(storage, {
        provider: 'silverfin',
        clientId: 'client-1',
        nonce: 'nonce-1',
      })
    ).toBe(true)
    expect(
      beginAccountingReconnectResync(storage, {
        provider: 'silverfin',
        clientId: 'client-1',
        nonce: 'wrong',
      })
    ).toBeNull()
    expect(
      beginAccountingReconnectResync(storage, {
        provider: 'silverfin',
        clientId: 'client-1',
        nonce: 'nonce-1',
      })
    ).not.toBeNull()
    expect(
      markAccountingReconnectReady(storage, {
        provider: 'silverfin',
        clientId: 'client-1',
        formData,
        anchorYear: 2023,
        unavailableYears: [{ year: 2025, reason: 'incomplete_operating_pair' }],
      })
    ).toBe(true)

    expect(
      consumeReadyAccountingReconnect(storage, {
        clientId: 'client-1',
        reportId: 'report-1',
      })
    ).toMatchObject({ phase: 'ready', anchorYear: 2023 })
    expect(
      consumeReadyAccountingReconnect(storage, {
        clientId: 'client-1',
        reportId: 'report-1',
      })
    ).toBeNull()
  })

  it('rejects cross-provider and cross-client recovery claims', () => {
    persistAccountingReconnectIntent(sessionStorage, {
      provider: 'silverfin',
      clientId: 'client-1',
      reportId: 'report-1',
      formData: draft(),
    })
    expect(
      bindAccountingReconnectOAuth(sessionStorage, {
        provider: 'exact',
        clientId: 'client-1',
        nonce: 'nonce-1',
      })
    ).toBe(false)
    expect(
      bindAccountingReconnectOAuth(sessionStorage, {
        provider: 'silverfin',
        clientId: 'client-2',
        nonce: 'nonce-1',
      })
    ).toBe(false)
  })

  it('claims a provider-bound Mercury handoff once and allows a retry after failure', () => {
    persistAccountingReconnectIntent(sessionStorage, {
      provider: 'horus',
      clientId: 'client-1',
      reportId: 'report-1',
      formData: draft(),
    })
    expect(
      bindAccountingReconnectHandoff(sessionStorage, {
        provider: 'horus',
        clientId: 'client-1',
        nonce: 'handoff-1',
      })
    ).toBe(true)
    expect(
      beginAccountingReconnectHandoffResync(sessionStorage, {
        provider: 'xero',
        clientId: 'client-1',
        nonce: 'handoff-1',
      })
    ).toBeNull()
    expect(
      beginAccountingReconnectHandoffResync(sessionStorage, {
        provider: 'horus',
        clientId: 'client-1',
        nonce: 'handoff-1',
      })
    ).toMatchObject({ phase: 'resyncing', provider: 'horus' })
    expect(
      beginAccountingReconnectHandoffResync(sessionStorage, {
        provider: 'horus',
        clientId: 'client-1',
        nonce: 'handoff-1',
      })
    ).toBeNull()

    markAccountingReconnectFailed(sessionStorage, {
      provider: 'horus',
      clientId: 'client-1',
      failure: 'Temporary provider outage',
    })
    expect(
      bindAccountingReconnectHandoff(sessionStorage, {
        provider: 'horus',
        clientId: 'client-1',
        nonce: 'handoff-2',
      })
    ).toBe(true)
  })
})

describe('applyValuationSnapshotToReconnectDraft', () => {
  it('removes polluted actuals, keeps forecasts, and uses only complete authoritative rows', () => {
    const result = applyValuationSnapshotToReconnectDraft(draft(), {
      provider: 'silverfin',
      anchor_year: 2023,
      last_successful_sync_at: '2026-08-24T18:00:00.000Z',
      years: [
        {
          fiscal_year: 2023,
          revenue: 500_000,
          ebitda: 100_000,
          source_provider: 'silverfin',
          source_kind: 'live_accounting',
          source_synced_at: '2026-08-24T18:00:00.000Z',
          quality_state: 'ready',
          source_digest: 'digest-2023',
        },
      ],
      unavailable_years: [{ year: 2025, reason: 'incomplete_operating_pair' }],
    })

    expect(result.yearlyFinancials).toEqual([
      expect.objectContaining({ year: '2027', isForecast: true }),
      expect.objectContaining({
        year: '2023',
        revenue: 500_000,
        ebitda: 100_000,
        source_provider: 'silverfin',
        quality_state: 'ready',
      }),
    ])
    expect(result.current_year_data).toBeUndefined()
    expect(result.historical_years_data).toEqual([])
    expect(result.filingYearConfirmed).toBe(true)
  })

  it('keeps a complete high-margin live year visible for explicit review', () => {
    const result = applyValuationSnapshotToReconnectDraft(draft(), {
      provider: 'silverfin',
      anchor_year: null,
      last_successful_sync_at: '2026-08-24T18:00:00.000Z',
      years: [
        {
          fiscal_year: 2024,
          revenue: 100_000,
          ebitda: 95_000,
          source_provider: 'silverfin',
          source_kind: 'live_accounting',
          quality_state: 'needs_review',
          source_digest: 'digest-2024',
          eligibility_reason: 'extreme_margin_unattested',
        },
      ],
      unavailable_years: [],
    })

    expect(result.yearlyFinancials).toContainEqual(
      expect.objectContaining({
        year: '2024',
        quality_state: 'needs_review',
        eligibility_reason: 'extreme_margin_unattested',
      })
    )
    expect(result.filingYearConfirmed).toBe(false)
  })

  it('finds the newest unreviewed extreme-margin year before automatic resume', () => {
    expect(
      reconnectDraftReviewYear({
        ...draft(),
        yearlyFinancials: [
          {
            year: '2024',
            revenue: 500_000,
            ebitda: 490_000,
            eligibility_reason: 'extreme_margin_unattested',
          },
          {
            year: '2025',
            revenue: 600_000,
            ebitda: 590_000,
            eligibility_reason: 'extreme_margin_unattested',
          },
          {
            year: '2026',
            revenue: 700_000,
            ebitda: 200_000,
            isForecast: true,
            eligibility_reason: 'extreme_margin_unattested',
          },
        ],
      })
    ).toBe(2025)
    expect(reconnectDraftReviewYear(draft())).toBeNull()
  })
})
