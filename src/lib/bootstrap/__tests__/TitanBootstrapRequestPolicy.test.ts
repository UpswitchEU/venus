import { CLIENT_CONTEXT_HEADERS } from '../../../constants/headers'
import { buildTitanBootstrapRequestPolicy } from '../TitanBootstrapRequestPolicy'
import type { BootstrapContext } from '../types'

describe('TitanBootstrapRequestPolicy', () => {
  it('builds the Titan request with trimmed report id and valid Venus mode', () => {
    const result = buildTitanBootstrapRequestPolicy({
      clientContext: null,
      context: {
        url: 'https://venus.test/nl/reports/r1',
        reportId: '  report-123  ',
        clientToken: 'token-1',
        clientId: 'relationship-1',
        flow: 'manual',
        mode: 'edit',
        version: 4,
        locale: 'nl',
      },
      hasClientTokenHint: true,
      traceId: 'trace-1',
    })

    expect(result.validReportId).toBe('report-123')
    expect(result.requestBody).toMatchObject({
      reportId: 'report-123',
      clientToken: 'token-1',
      clientId: 'relationship-1',
      flow: 'manual',
      mode: 'edit',
      version: 4,
      locale: 'nl',
    })
    expect(result.headers['X-Correlation-ID']).toBe('trace-1')
  })

  it('omits Mercury accountant mode before sending to Titan', () => {
    const result = buildTitanBootstrapRequestPolicy({
      clientContext: null,
      context: {
        url: 'https://venus.test/nl/reports/r1?mode=accountant',
        mode: 'accountant',
      } as BootstrapContext,
      hasClientTokenHint: false,
      traceId: 'trace-2',
    })

    expect(result.invalidMode).toBe('accountant')
    expect(result.requestBody.mode).toBeUndefined()
  })

  it('adds complete delegated client context headers', () => {
    const result = buildTitanBootstrapRequestPolicy({
      clientContext: {
        contextHeaders: {
          [CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]: 'client-user-1',
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: 'accountant-user-1',
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: 'relationship-1',
        },
        relationshipId: 'relationship-1',
      },
      context: { url: 'https://venus.test/nl/reports/r1', clientToken: 'token-1' },
      hasClientTokenHint: true,
      traceId: 'trace-3',
    })

    expect(result.clientContextStatus).toBe('delegated')
    expect(result.partialDelegated).toBe(false)
    expect(result.headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]).toBe('client-user-1')
    expect(result.headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]).toBe('accountant-user-1')
    expect(result.headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]).toBe('relationship-1')
  })

  it('allows accountant-owned pending invitations with partial delegated headers', () => {
    const result = buildTitanBootstrapRequestPolicy({
      clientContext: {
        contextHeaders: {
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: 'accountant-user-1',
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: 'relationship-1',
        },
        relationshipId: 'relationship-1',
      },
      context: { url: 'https://venus.test/nl/reports/r1', clientToken: 'token-1' },
      hasClientTokenHint: true,
      traceId: 'trace-4',
    })

    expect(result.clientContextStatus).toBe('delegated')
    expect(result.partialDelegated).toBe(true)
    expect(result.headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]).toBeUndefined()
    expect(result.headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]).toBe('accountant-user-1')
  })

  it('does not send incomplete delegated headers and falls back to relationship id', () => {
    const result = buildTitanBootstrapRequestPolicy({
      clientContext: {
        contextHeaders: {
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: 'relationship-fallback',
        },
        relationshipId: 'relationship-fallback',
      },
      context: { url: 'https://venus.test/nl/reports/r1', clientToken: 'token-1' },
      hasClientTokenHint: true,
      traceId: 'trace-5',
    })

    expect(result.clientContextStatus).toBe('incomplete')
    expect(result.headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]).toBeUndefined()
    expect(result.requestBody.clientId).toBe('relationship-fallback')
  })

  it('reports missing token context without inventing delegated headers', () => {
    const result = buildTitanBootstrapRequestPolicy({
      clientContext: { contextHeaders: {}, relationshipId: null },
      context: { url: 'https://venus.test/nl/reports/r1', clientToken: 'token-1' },
      hasClientTokenHint: true,
      traceId: 'trace-6',
    })

    expect(result.clientContextStatus).toBe('missing-token-context')
    expect(result.hasClientContextHeaders).toBe(false)
    expect(result.contextHeaderKeys).toEqual(['X-Correlation-ID'])
  })
})
