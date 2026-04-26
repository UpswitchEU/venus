import { describe, expect, it } from 'vitest'
import { buildTaxLatencyCandidatesFromImportedLedgerAnalysis } from '../importedLedgerTaxLatencies'

describe('buildTaxLatencyCandidatesFromImportedLedgerAnalysis', () => {
  it('maps imported ledger tax latency candidates into the Venus store shape', () => {
    const result = buildTaxLatencyCandidatesFromImportedLedgerAnalysis({
      tax_latency_candidates: [
        {
          account_code: '222000',
          account_name: 'Gebouwen',
          description: 'Vastgoed op de balans',
          suggested_question:
            'Opgelet: MAR 222000 bevat vastgoed. Wilt u hier een belastinglatentie op toepassen?',
          tax_rate: 25,
          fiscal_year: 2024,
        },
      ],
    })

    expect(result).toEqual([
      expect.objectContaining({
        accountCode: '222000',
        accountName: 'Gebouwen',
        taxRate: 25,
        year: 2024,
        type: 'passive',
      }),
    ])
  })

  it('drops persisted false-positive candidates on P&L / off-balance codes (e.g. MAR 630200)', () => {
    const result = buildTaxLatencyCandidatesFromImportedLedgerAnalysis({
      tax_latency_candidates: [
        {
          account_code: '630200',
          account_name: 'Afschrijvingen op gebouwen',
          description: 'Stale candidate from earlier import',
          suggested_question: 'Opgelet: MAR 630200 bevat vastgoed.',
          tax_rate: 25,
          fiscal_year: 2024,
          category: 'real_estate',
        },
        {
          account_code: '700100',
          account_name: 'Verkopen onroerend goed',
          description: 'Stale candidate on income code',
          suggested_question: 'Onroerend goed?',
          tax_rate: 25,
          fiscal_year: 2024,
          category: 'real_estate',
        },
        {
          account_code: '901000',
          account_name: 'Bouwclaim onroerend goed',
          description: 'Off-balance — never carries a balance-sheet latency',
          suggested_question: 'Off balance?',
          tax_rate: 25,
          fiscal_year: 2024,
          category: 'real_estate',
        },
        {
          account_code: '222000',
          account_name: 'Gebouwen',
          description: 'Legitimate real-estate latency',
          suggested_question: 'Vastgoed?',
          tax_rate: 25,
          fiscal_year: 2024,
          category: 'real_estate',
        },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({ accountCode: '222000' }))
  })
})
