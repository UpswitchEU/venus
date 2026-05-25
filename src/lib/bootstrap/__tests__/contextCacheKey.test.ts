import { describe, expect, it } from 'vitest'
import {
  getBootstrapCacheLookupKey,
  getBootstrapContextCacheKey,
  getBootstrapReportCacheKey,
} from '../contextCacheKey'
import type { BootstrapContext } from '../types'

const mercuryReportContext: BootstrapContext = {
  url: 'https://preview.valuation.upswitch.app/nl/reports/710e7011-8c98-44f9-919e-aa81754051af?cacheBust=1',
  cookies: 'volatile-cookie',
  reportId: '710e7011-8c98-44f9-919e-aa81754051af',
  clientToken: 'consumed-token',
  clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
  flow: 'manual',
  mode: 'edit',
  version: undefined,
  locale: 'nl',
  embedded: false,
  returnUrl: 'https://preview.upswitch.app/nl/advisor/clients/e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
  sourceApp: 'mercury',
}

describe('bootstrap context cache keys', () => {
  it('normalizes missing and new report ids to the new-report key', () => {
    expect(getBootstrapReportCacheKey(undefined)).toBe('new')
    expect(getBootstrapReportCacheKey('')).toBe('new')
    expect(getBootstrapReportCacheKey(' new ')).toBe('new')
    expect(getBootstrapReportCacheKey(' report-a ')).toBe('report-a')
  })

  it('ignores volatile url, cookies, and client token values', () => {
    const firstKey = getBootstrapContextCacheKey(mercuryReportContext)
    const secondKey = getBootstrapContextCacheKey({
      ...mercuryReportContext,
      url: 'https://preview.valuation.upswitch.app/nl/reports/710e7011-8c98-44f9-919e-aa81754051af?_t=999',
      cookies: 'different-cookie',
      clientToken: 'different-token',
    })

    expect(secondKey).toBe(firstKey)
  })

  it('scopes existing report caches by delegated client context', () => {
    const originalKey = getBootstrapContextCacheKey(mercuryReportContext)
    const otherClientKey = getBootstrapContextCacheKey({
      ...mercuryReportContext,
      clientId: 'different-client',
    })

    expect(otherClientKey).not.toBe(originalKey)
  })

  it('scopes new report caches by prefill, locale, return target, and source', () => {
    const alphaKey = getBootstrapContextCacheKey({
      reportId: 'new',
      prefilledQuery: 'Alpha BV',
      locale: 'nl',
      flow: 'manual',
      sourceApp: 'mercury',
      returnUrl: 'https://preview.upswitch.app/nl/advisor/clients/client-a',
    })

    expect(
      getBootstrapContextCacheKey({
        reportId: 'new',
        prefilledQuery: 'Beta BV',
        locale: 'nl',
        flow: 'manual',
        sourceApp: 'mercury',
        returnUrl: 'https://preview.upswitch.app/nl/advisor/clients/client-a',
      })
    ).not.toBe(alphaKey)
    expect(
      getBootstrapContextCacheKey({
        reportId: 'new',
        prefilledQuery: 'Alpha BV',
        locale: 'fr',
        flow: 'manual',
        sourceApp: 'mercury',
        returnUrl: 'https://preview.upswitch.app/nl/advisor/clients/client-a',
      })
    ).not.toBe(alphaKey)
    expect(
      getBootstrapContextCacheKey({
        reportId: 'new',
        prefilledQuery: 'Alpha BV',
        locale: 'nl',
        flow: 'manual',
        sourceApp: 'direct',
        returnUrl: 'https://preview.upswitch.app/nl/advisor/clients/client-a',
      })
    ).not.toBe(alphaKey)
    expect(
      getBootstrapContextCacheKey({
        reportId: 'new',
        prefilledQuery: 'Alpha BV',
        locale: 'nl',
        flow: 'manual',
        sourceApp: 'mercury',
        returnUrl: 'https://preview.upswitch.app/nl/advisor/clients/client-b',
      })
    ).not.toBe(alphaKey)
  })

  it('uses the same bare report lookup shape as the service fallback path', () => {
    expect(getBootstrapCacheLookupKey('report-a')).toBe(
      'report:report-a:client::source::prefill::flow::mode::version::locale::embedded:0:return:'
    )
    expect(getBootstrapCacheLookupKey({ reportId: 'report-a' })).toBe(
      getBootstrapCacheLookupKey('report-a')
    )
  })
})
