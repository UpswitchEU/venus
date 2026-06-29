import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationSession } from '../../../types/valuation'
import { backfillSparseSessionFromStoreSeed } from '../SessionSparseBackfill'

function session(reportId: string, sessionData: ValuationSession['sessionData']): ValuationSession {
  return {
    reportId,
    currentView: 'manual',
    dataSource: 'manual',
    createdAt: new Date('2026-06-29T00:00:00.000Z'),
    updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    partialData: {},
    sessionData,
  }
}

describe('backfillSparseSessionFromStoreSeed', () => {
  beforeEach(() => {
    useSessionStore.setState({ session: null })
  })

  it('restores explicit FCFF-only forecast rows over a default EBITDA placeholder mode', async () => {
    const reportId = 'val_sparse_fcff_restore'
    useSessionStore.setState({
      session: session(reportId, {
        dcf_input_mode: 'fcff_only',
        forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
      }),
    })
    const sparse = session(reportId, {
      dcf_input_mode: 'ebitda',
      forecast_years_data: [],
    })

    await backfillSparseSessionFromStoreSeed(reportId, sparse)

    expect(sparse.sessionData).toMatchObject({
      dcf_input_mode: 'fcff_only',
      forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
    })
    expect(sparse.partialData).toMatchObject({
      dcf_input_mode: 'fcff_only',
      forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
    })
  })

  it('canonicalizes stale FCFF already present on a sparse default-mode payload', async () => {
    const reportId = 'val_sparse_stale_fcff'
    useSessionStore.setState({ session: session(reportId, {}) })
    const sparse = session(reportId, {
      dcf_input_mode: 'unexpected' as 'ebitda',
      forecast_years_data: [{ year: 2026, revenue: 1_050_000, ebitda: 105_000, free_cash_flow: 1 }],
    })

    await backfillSparseSessionFromStoreSeed(reportId, sparse)

    expect(sparse.sessionData).toMatchObject({
      dcf_input_mode: 'ebitda',
      forecast_years_data: [{ year: 2026, revenue: 1_050_000, ebitda: 105_000 }],
    })
    expect(sparse.partialData).toMatchObject({
      dcf_input_mode: 'ebitda',
      forecast_years_data: [{ year: 2026, revenue: 1_050_000, ebitda: 105_000 }],
    })
  })
})
