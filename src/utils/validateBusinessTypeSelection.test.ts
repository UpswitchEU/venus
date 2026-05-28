import { describe, expect, it } from 'vitest'
import { validateBusinessTypeSelection } from './validateBusinessTypeSelection'

describe('validateBusinessTypeSelection', () => {
  it('blocks accounting id when label is fintech', () => {
    expect(
      validateBusinessTypeSelection({
        businessTypeId: 'accounting',
        businessTypeTitle: 'Fintech — Lending & Credit',
        industry: 'lending',
      }),
    ).toMatch(/Fintech/)
  })

  it('allows consistent fintech selection', () => {
    expect(
      validateBusinessTypeSelection({
        businessTypeId: 'fintech-lending',
        businessTypeTitle: 'Fintech — Lending & Credit',
        industry: 'lending',
      }),
    ).toBeNull()
  })
})
