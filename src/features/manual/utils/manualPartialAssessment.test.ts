// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import producer from '../../../utils/__fixtures__/partial-report.v1.json'
import { buildManualPartialInput, calculateSavedManualAssessment } from './manualPartialAssessment'

vi.mock('@/stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({ getContextHeaders: () => ({ 'X-Client-Context-User': 'client' }) }),
  },
}))
afterEach(() => vi.unstubAllGlobals())
const date = '2026-10-02'

describe('manual partial assessment intake', () => {
  it('retains missing identity and earnings without invented defaults', () => {
    expect(buildManualPartialInput({ companyName: 'SME' }, 'revision', date)).toMatchObject({
      country_code: null,
      valuation_date: date,
      financials: {
        fiscal_year: null,
        currency: null,
        revenue: null,
        ebitda: null,
        cash: null,
        financial_debt: null,
        nwc_adjustment: null,
      },
      references: [],
    })
  })
  it('retains exact latest actual inputs, zero and losses without promoting older or forecast years', () => {
    const input = buildManualPartialInput(
      {
        companyName: 'SME',
        country: 'GB',
        currency: 'GBP',
        yearlyFinancials: [
          { year: '2024', revenue: 100, ebitda: 20 },
          {
            year: '2025',
            revenue: '9007199254740992.03',
            ebitda: '-10.005',
            cash: 0,
            nwc_change: 500,
          },
          { year: '2026', revenue: 200, ebitda: 30, isForecast: true },
        ],
      },
      'revision',
      date
    )
    expect(input.financials).toMatchObject({
      fiscal_year: 2025,
      revenue: '9007199254740992.03',
      ebitda: '-10.005',
      cash: '0',
      financial_debt: null,
      nwc_adjustment: null,
    })
  })
  it('preserves an undated amount without fabricating its period', () => {
    expect(
      buildManualPartialInput({ yearlyFinancials: [{ revenue: '100.05' }] }, 'r', date).financials
    ).toMatchObject({ fiscal_year: null, revenue: '100.05' })
  })
  it('retains missing observation statuses instead of pricing placeholders', () => {
    for (const status of ['missing', 'placeholder', 'unknown']) {
      const financials = buildManualPartialInput(
        {
          yearlyFinancials: [
            {
              year: '2025',
              revenue: 0,
              ebitda: 0,
              financial_observations: { revenue: status, ebitda: status },
            },
          ],
        },
        'r',
        date
      ).financials
      expect(financials.revenue).toBeNull()
      expect(financials.ebitda).toBeNull()
    }
  })
  it('allows identical duplicate observations with different decimal formatting', () => {
    expect(
      buildManualPartialInput(
        {
          yearlyFinancials: [
            { year: '2025', revenue: '10.00' },
            { year: '2025', revenue: '10' },
          ],
        },
        'r',
        date
      ).financials.revenue
    ).toBe('10.00')
  })
  it('does not substitute gross margin for missing turnover', () => {
    expect(
      buildManualPartialInput(
        { yearlyFinancials: [{ year: '2025', gross_margin: 500 }] },
        'r',
        date
      ).financials.revenue
    ).toBeNull()
  })
  it('rejects conflicting duplicate periods independently of order', () => {
    const rows = [
      { year: '2025', revenue: 10 },
      { year: '2025', revenue: 11 },
    ]
    for (const yearlyFinancials of [rows, [...rows].reverse()])
      expect(() => buildManualPartialInput({ yearlyFinancials }, 'r', date)).toThrow('Conflicting')
  })
  it.each([
    true,
    {},
    [],
    'NaN',
    'Infinity',
    '0x100',
    '1,000',
  ])('does not coerce malformed evidence %j into zero', (value) => {
    expect(() =>
      buildManualPartialInput({ yearlyFinancials: [{ year: '2025', ebitda: value }] }, 'r', date)
    ).toThrow()
  })
  it('saves against the exact server revision and keeps delegated context', async () => {
    const head = {
      report_id: 'report-1',
      revision_sha256: 'a'.repeat(64),
      updated_at: '2026-10-02T00:00:00.000Z',
    }
    const saved = { ...head, partial_valuation: producer.partial_valuation }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(head)))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved)))
    vi.stubGlobal('fetch', fetcher)
    expect(
      await calculateSavedManualAssessment(
        'report-1',
        { companyName: 'SME' },
        () => true,
        new Date(date)
      )
    ).toEqual(saved)
    const options = fetcher.mock.calls[1][1]
    expect(JSON.parse(options.body)).toMatchObject({
      expected_revision_sha256: head.revision_sha256,
      expected_updated_at: head.updated_at,
      input: { financials: { ebitda: null } },
    })
    expect(options.headers['X-Client-Context-User']).toBe('client')
  })
  it('does not mutate a report after navigation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            report_id: 'report-1',
            revision_sha256: 'a'.repeat(64),
            updated_at: '2026-10-02T00:00:00.000Z',
          })
        )
      )
    vi.stubGlobal('fetch', fetcher)
    expect(await calculateSavedManualAssessment('report-1', {}, () => false)).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not silently refresh and resubmit after a stale revision', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            report_id: 'report-1',
            revision_sha256: 'a'.repeat(64),
            updated_at: '2026-10-02T00:00:00.000Z',
          })
        )
      )
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(calculateSavedManualAssessment('report-1', {}, () => true)).rejects.toThrow(
      'report changed'
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
