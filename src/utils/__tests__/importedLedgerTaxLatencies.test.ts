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
})
