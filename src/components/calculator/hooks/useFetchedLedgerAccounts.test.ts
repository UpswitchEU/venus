import { describe, expect, it } from 'vitest'
import { normalizeLedgerAccountsPayload } from './useFetchedLedgerAccounts'

describe('normalizeLedgerAccountsPayload', () => {
  it('normalizes direct grootboek response payloads', () => {
    expect(
      normalizeLedgerAccountsPayload({
        codes: [
          { code: 610, name: 'Huur', category: 'Diensten' },
          { code: '620', name: 'Bezoldigingen' },
        ],
      })
    ).toEqual([
      { code: '610', name: 'Huur', category: 'Diensten' },
      { code: '620', name: 'Bezoldigingen', category: '' },
    ])
  })

  it('normalizes nested proxy response payloads', () => {
    expect(
      normalizeLedgerAccountsPayload({
        data: {
          codes: [{ code: '700', name: 'Omzet', category: 'Opbrengsten' }],
        },
      })
    ).toEqual([{ code: '700', name: 'Omzet', category: 'Opbrengsten' }])
  })

  it('returns an empty list for malformed payloads', () => {
    expect(normalizeLedgerAccountsPayload(null)).toEqual([])
    expect(normalizeLedgerAccountsPayload({ data: { codes: 'not-array' } })).toEqual([])
    expect(normalizeLedgerAccountsPayload({ codes: [null, 'bad'] })).toEqual([])
  })
})
