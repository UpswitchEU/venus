// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualNewValuationUrl,
  resolveManualNewValuationClientId,
  resolveManualNewValuationPrefilledCompanyName,
} from './manualNewValuation'

describe('manualNewValuation', () => {
  it('prefers the collected company name, then accountant client name', () => {
    expect(
      resolveManualNewValuationPrefilledCompanyName({
        collectedCompanyName: '  Operating Co  ',
        isAccountantFlow: true,
        clientCompanyName: 'Client Co',
      })
    ).toBe('Operating Co')

    expect(
      resolveManualNewValuationPrefilledCompanyName({
        collectedCompanyName: '',
        isAccountantFlow: true,
        clientCompanyName: 'Client Co',
      })
    ).toBe('Client Co')

    expect(
      resolveManualNewValuationPrefilledCompanyName({
        collectedCompanyName: '',
        isAccountantFlow: false,
        clientCompanyName: 'Client Co',
      })
    ).toBeUndefined()
  })

  it('carries client context only for accountant or acting-client flows', () => {
    expect(
      resolveManualNewValuationClientId({
        isAccountantMode: true,
        clientContextId: 'client-1',
        relationshipId: 'relationship-1',
      })
    ).toBe('client-1')

    expect(
      resolveManualNewValuationClientId({
        isAccountantMode: false,
        isActingAsClient: true,
        relationshipId: 'relationship-1',
      })
    ).toBe('relationship-1')

    expect(
      resolveManualNewValuationClientId({
        isAccountantMode: false,
        relationshipId: 'relationship-1',
      })
    ).toBeUndefined()
  })

  it('builds fresh valuation URLs with preserved bootstrap params', () => {
    expect(
      buildManualNewValuationUrl({
        locale: 'nl',
        collectedCompanyName: '',
        isAccountantFlow: true,
        clientCompanyName: 'Client Co',
        isAccountantMode: true,
        clientContextId: 'client-1',
        currentSearch: '?source=mercury&flow=advisor&unknown=drop',
      })
    ).toBe('/nl/reports/new?clientId=client-1&prefilledQuery=Client+Co&flow=advisor&source=mercury')
  })
})
