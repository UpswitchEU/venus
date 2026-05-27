import type { BootstrapContext } from './types'

/**
 * Build the stable cache identity for bootstrap requests.
 *
 * The key intentionally excludes raw URL, cookies, and clientToken:
 * - URL can contain cache-busting or UI-only params.
 * - Cookies are volatile and unavailable in client code.
 * - clientToken is consumed/sanitized during Mercury delegated handoff.
 *
 * Keep this module as the single source of truth for both service-level and
 * provider-level caches so a report cannot hydrate from another context.
 */
export function getBootstrapReportCacheKey(reportId: string | null | undefined): string {
  const trimmed = reportId?.trim()
  return trimmed && trimmed !== 'new' ? trimmed : 'new'
}

function joinCacheKeyParts(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(':')
}

export function getBootstrapContextCacheKey(context: BootstrapContext | null | undefined): string {
  const reportKey = getBootstrapReportCacheKey(context?.reportId)
  const clientId = context?.clientId?.trim() || ''
  const sourceApp = context?.sourceApp?.trim() || ''
  const prefilledQuery = context?.prefilledQuery?.trim() || ''
  const flow = context?.flow || ''
  const mode = context?.mode || ''
  const mercuryPersonaMode = context?.mercuryPersonaMode?.trim() || ''
  const version = context?.version == null ? '' : String(context.version)
  const locale = context?.locale?.trim() || ''
  const embedded = context?.embedded ? '1' : '0'
  const returnUrl = context?.returnUrl?.trim() || ''

  return joinCacheKeyParts(
    reportKey === 'new' ? 'new' : 'report',
    reportKey,
    'client',
    clientId,
    'source',
    sourceApp,
    'prefill',
    prefilledQuery,
    'flow',
    flow,
    'mode',
    mode,
    'mercuryMode',
    mercuryPersonaMode,
    'version',
    version,
    'locale',
    locale,
    'embedded',
    embedded,
    'return',
    returnUrl
  )
}

export function getBootstrapCacheLookupKey(
  contextOrReportId: BootstrapContext | string | null | undefined
): string {
  if (typeof contextOrReportId === 'object' && contextOrReportId !== null) {
    return getBootstrapContextCacheKey(contextOrReportId)
  }

  const reportKey = getBootstrapReportCacheKey(contextOrReportId)
  return joinCacheKeyParts(
    reportKey === 'new' ? 'new' : 'report',
    reportKey,
    'client',
    '',
    'source',
    '',
    'prefill',
    '',
    'flow',
    '',
    'mode',
    '',
    'mercuryMode',
    '',
    'version',
    '',
    'locale',
    '',
    'embedded',
    '0',
    'return',
    ''
  )
}
