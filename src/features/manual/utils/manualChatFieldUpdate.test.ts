// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualChatFieldUpdateBridge,
  formatManualChatFieldUpdateValue,
} from './manualChatFieldUpdate'

describe('manualChatFieldUpdate', () => {
  it('maps company identity fields to collected data keys and form patches', () => {
    expect(buildManualChatFieldUpdateBridge('company_name', ' Acme ')).toEqual({
      collectedDataKey: 'companyName',
      collectedDataValue: ' Acme ',
      formPatch: { company_name: 'Acme' },
    })
    expect(buildManualChatFieldUpdateBridge('business_type_id', 'restaurant')).toMatchObject({
      collectedDataKey: 'businessType',
      formPatch: { business_type_id: 'restaurant' },
    })
    expect(buildManualChatFieldUpdateBridge('naceCode', '62.010')).toMatchObject({
      collectedDataKey: 'naceCode',
      formPatch: { nace_code: '62.010' },
    })
  })

  it('keeps postal code and city out of collected data while patching the form store', () => {
    expect(buildManualChatFieldUpdateBridge('postal_code', '2000')).toEqual({
      collectedDataKey: undefined,
      collectedDataValue: '2000',
      formPatch: { postal_code: '2000' },
    })
    expect(buildManualChatFieldUpdateBridge('city', 'Antwerp')).toMatchObject({
      collectedDataKey: undefined,
      formPatch: { city: 'Antwerp' },
    })
  })

  it('splits Belgian address strings into postal code and city', () => {
    expect(buildManualChatFieldUpdateBridge('address', '2000 Antwerp')).toMatchObject({
      collectedDataKey: 'address',
      formPatch: { postal_code: '2000', city: 'Antwerp' },
    })
    expect(buildManualChatFieldUpdateBridge('address', 'Antwerp')).toMatchObject({
      formPatch: { city: 'Antwerp' },
    })
  })

  it('parses numeric owner and employee counts', () => {
    expect(buildManualChatFieldUpdateBridge('ownerManagers', '3')).toMatchObject({
      collectedDataKey: 'ownerManagers',
      formPatch: { number_of_owners: 3 },
    })
    expect(buildManualChatFieldUpdateBridge('number_of_employees', '11-25')).toMatchObject({
      collectedDataKey: 'fteEmployees',
      formPatch: { number_of_employees: 18 },
    })
  })

  it('does not patch empty strings or invalid numbers', () => {
    expect(buildManualChatFieldUpdateBridge('companyName', '   ').formPatch).toEqual({})
    expect(buildManualChatFieldUpdateBridge('founding_year', 'not a year').formPatch).toEqual({})
    expect(buildManualChatFieldUpdateBridge('ownerManagers', -1).formPatch).toEqual({})
  })

  it('keeps unknown fields as collected data-only updates', () => {
    expect(buildManualChatFieldUpdateBridge('customField', 42)).toEqual({
      collectedDataKey: 'customField',
      collectedDataValue: 42,
      formPatch: {},
    })
  })

  it('formats update values the same way as the chat toast', () => {
    expect(formatManualChatFieldUpdateValue(60_000, 'nl')).toBe('€60.000')
    expect(formatManualChatFieldUpdateValue(60_000, 'en')).toBe('€60.000')
    expect(formatManualChatFieldUpdateValue('Acme', 'en')).toBe('Acme')
  })
})
