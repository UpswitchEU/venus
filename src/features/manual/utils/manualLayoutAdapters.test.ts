// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  getManualHydratedValuationResults,
  getManualModalEditPersistToast,
  getManualUserInitials,
  serializeManualPreparerPayload,
} from './manualLayoutAdapters'

describe('manualLayoutAdapters', () => {
  it('builds user initials from name, email, or guest fallback', () => {
    expect(getManualUserInitials({ name: 'Ada Lovelace' })).toBe('AL')
    expect(getManualUserInitials({ name: 'Nina' })).toBe('NI')
    expect(getManualUserInitials({ email: 'founder@example.com' })).toBe('F')
    expect(getManualUserInitials(null)).toBe('G')
  })

  it('hydrates valuation method maps through the shared extractor', () => {
    expect(
      getManualHydratedValuationResults({
        selected_valuation_method: 'upswitch_adaptive',
        valuation_results: {
          upswitch_adaptive: {
            available: true,
            value: 100,
          },
        },
      })
    ).toEqual({
      upswitch_adaptive: {
        available: true,
        details: {},
        value: 100,
      },
    })
  })

  it('serializes preparer payload signatures with a stable empty value', () => {
    expect(serializeManualPreparerPayload(null)).toBe('none')
    expect(
      serializeManualPreparerPayload({
        preparer_ev_ebitda_median: 4.25,
        preparer_ev_ebitda_override: {
          reason_key: 'other',
          note: 'Advisor judgement',
        },
      })
    ).toBe(
      '{"preparer_ev_ebitda_median":4.25,"preparer_ev_ebitda_override":{"reason_key":"other","note":"Advisor judgement"}}'
    )
  })

  it('maps modal edit persist errors to toast keys', () => {
    expect(
      getManualModalEditPersistToast({
        response: { data: { message: 'Stored valuation inputs not found for report' } },
      })
    ).toEqual({ titleKey: 'modalEditInputsMissing' })

    expect(
      getManualModalEditPersistToast({
        response: { data: { message: ['Stored valuation inputs are incomplete'] } },
      })
    ).toEqual({ titleKey: 'modalEditInputsIncomplete' })

    expect(getManualModalEditPersistToast(new Error('network'))).toEqual({
      titleKey: 'persistFailed',
      descriptionKey: 'persistFailedDesc',
    })
  })
})
