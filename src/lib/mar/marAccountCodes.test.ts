import { describe, expect, it } from 'vitest'
import {
  isImportedLedgerDirectorCompCode,
  isMarOwnerDirectorCompensationAccount,
  isMarPersonnelSocialChargesBucket,
  normalizedMarAccountCodePrefix,
} from './marAccountCodes'

describe('marAccountCodes', () => {
  it('normalizes padded and suffixed GL strings', () => {
    expect(normalizedMarAccountCodePrefix('\u00a0620000\u00a0')).toBe('620000')
    expect(normalizedMarAccountCodePrefix('620000-ext')).toBe('620000')
  })

  it('identifies 62000x personnel buckets', () => {
    expect(isMarPersonnelSocialChargesBucket('620000')).toBe(true)
    expect(isMarPersonnelSocialChargesBucket('620009')).toBe(true)
    expect(isMarPersonnelSocialChargesBucket('620010')).toBe(false)
  })

  it('classifies director-comp codes but not personnel buckets', () => {
    expect(isMarOwnerDirectorCompensationAccount('620010')).toBe(true)
    expect(isMarOwnerDirectorCompensationAccount('620000')).toBe(false)
    expect(isMarOwnerDirectorCompensationAccount('618100')).toBe(true)
  })

  it('treats 620 and director codes as imported salary signal', () => {
    expect(isImportedLedgerDirectorCompCode('620')).toBe(true)
    expect(isImportedLedgerDirectorCompCode('620010')).toBe(true)
    expect(isImportedLedgerDirectorCompCode('620000')).toBe(false)
  })
})
