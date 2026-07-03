import { ENGINE_TO_MERCURY_MESSAGE_TYPES } from '@/constants/crossAppMessages'
import { EMBEDDED_STORAGE_KEY } from '@/hooks/useEmbeddedMode'
import {
  getSafeMercuryNavigationUrl,
  isLegacyReturnUrl,
  isTrustedUpswitchHostname,
} from '@/lib/return-url'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { generalLogger } from '@/utils/logger'
import { postMessageToMercuryParent } from '@/utils/mercuryParentMessaging'
import {
  buildManualExitClientViewFallbackUrl,
  buildManualExitClientViewTarget,
  getManualImportReviewSessionKey,
} from './manualMercuryNavigation'

export interface ManualMercuryHandoff {
  returnUrl: string | null
  sourceApp: string | null
}

/** Read cross-app handoff params persisted at Venus auth init. */
export function readManualMercuryHandoffFromBrowser(): ManualMercuryHandoff {
  if (typeof window === 'undefined') {
    return { returnUrl: null, sourceApp: null }
  }
  try {
    const urlParams = new URLSearchParams(window.location.search)
    return {
      returnUrl: sessionStorage.getItem('upswitch_return_url') ?? urlParams.get('return_url'),
      sourceApp: sessionStorage.getItem('upswitch_source') ?? urlParams.get('source'),
    }
  } catch {
    return { returnUrl: null, sourceApp: null }
  }
}

export function isManualMercuryEmbeddedContext(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true' || window.self !== window.top
  } catch {
    return true
  }
}

function rewriteLegacyImportReviewPath(path: string): string {
  try {
    const url = new URL(path, 'https://mercury.local')
    if (url.searchParams.get('import_review') !== '1') return path

    const match = url.pathname.match(/^\/([^/]+)\/advisor\/clients\/([^/]+)\/?$/)
    if (!match) return path

    const [, locale, encodedClientId] = match
    const query = new URLSearchParams({ clientId: decodeURIComponent(encodedClientId) })
    const sessionKey = getManualImportReviewSessionKey(
      url.searchParams.get('sessionKey') ?? url.searchParams.get('session_key')
    )
    if (sessionKey) query.set('sessionKey', sessionKey)

    const focusField = url.searchParams.get('focusField')?.trim()
    if (focusField) query.set('focusField', focusField)
    const flagYear = url.searchParams.get('flagYear')?.trim()
    if (flagYear) query.set('flagYear', flagYear)

    return `/${locale}/advisor/import-review?${query}${url.hash}`
  } catch {
    return path
  }
}

/**
 * Relative Mercury path safe for `navigateToMercury` postMessage.
 * Mirrors Mercury `resolveSameOriginMercuryNavigationPath`.
 */
export function resolveMercuryNavigationPathForEmbed(
  rawUrl: string,
  mercuryBaseUrl?: string
): string | null {
  const raw = rawUrl.trim()
  if (!raw) return null

  if (raw.startsWith('//')) {
    return null
  }

  if (raw.startsWith('/')) {
    return rewriteLegacyImportReviewPath(raw)
  }

  const base = (mercuryBaseUrl ?? getMercuryUrl()).replace(/\/$/, '')
  try {
    const baseOrigin = new URL(base).origin
    const target = new URL(raw)
    if (target.origin !== baseOrigin) return null
    if (!isTrustedUpswitchHostname(target.hostname)) return null
    return rewriteLegacyImportReviewPath(`${target.pathname}${target.search}${target.hash}`)
  } catch {
    return null
  }
}

export interface PerformManualMercuryNavigationParams {
  targetUrl: string
  /** Pre-built relative path; computed from `targetUrl` when omitted. */
  targetPath?: string | null
  /** When embedded navigation fails, post `engineClose` so the modal is not stuck open. */
  postEngineCloseOnEmbedFailure?: boolean
}

/**
 * Navigate back to Mercury from Venus manual/report surfaces.
 * Uses `navigateToMercury` when embedded so the parent shell updates (not only the iframe).
 */
export function performManualMercuryNavigation({
  targetUrl,
  targetPath,
  postEngineCloseOnEmbedFailure = false,
}: PerformManualMercuryNavigationParams): void {
  if (typeof window === 'undefined') return

  const safeTargetUrl = getSafeMercuryNavigationUrl(targetUrl)
  const path = targetPath
    ? resolveMercuryNavigationPathForEmbed(targetPath)
    : resolveMercuryNavigationPathForEmbed(safeTargetUrl)

  if (isManualMercuryEmbeddedContext() && path) {
    try {
      const didPost = postMessageToMercuryParent({
          type: ENGINE_TO_MERCURY_MESSAGE_TYPES.navigateToMercury,
          source: 'venus',
          data: { url: path },
        })
      if (didPost) {
        window.setTimeout(() => {
          window.location.assign(safeTargetUrl)
        }, 750)
        return
      }
    } catch (error) {
      generalLogger.warn('[manualMercuryNavigate] navigateToMercury postMessage failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      if (postEngineCloseOnEmbedFailure) {
        try {
          postMessageToMercuryParent({
            type: ENGINE_TO_MERCURY_MESSAGE_TYPES.engineClose,
            source: 'venus',
          })
        } catch {
          // Cross-window messaging can fail in hardened browser contexts.
        }
      }
    }
  }

  window.location.assign(safeTargetUrl)
}

export interface BuildManualMercuryReturnFromBrowserParams {
  currentLocale: string
  clientContextId?: string | null
  hasCompletedValuation: boolean
  mercuryUrl?: string
  companyName?: string | null
  reportId?: string | null
}

/** Resolve a safe Mercury return URL from browser handoff state. */
export function buildManualMercuryReturnFromBrowser({
  currentLocale,
  clientContextId,
  hasCompletedValuation,
  mercuryUrl,
  companyName,
  reportId,
}: BuildManualMercuryReturnFromBrowserParams): string {
  const { returnUrl, sourceApp } = readManualMercuryHandoffFromBrowser()
  return buildManualExitClientViewTarget({
    returnUrl,
    clientContextId,
    currentLocale,
    sourceApp,
    mercuryUrl: mercuryUrl ?? getMercuryUrl(),
    hasCompletedValuation,
    companyName,
    reportId,
  })
}

export function hasUsableMercuryHandoffReturnUrl(): boolean {
  const { returnUrl } = readManualMercuryHandoffFromBrowser()
  return Boolean(returnUrl && !isLegacyReturnUrl(returnUrl))
}

/**
 * Navigate to Mercury using handoff params. Works in top-level and embedded iframe.
 */
/** Route after delete / redirect: Mercury absolute URL vs Venus-relative path. */
export function performManualFlowRedirect(
  redirectUrl: string,
  options?: { routerPush?: (href: string) => void }
): void {
  if (typeof window === 'undefined') return

  const trimmed = redirectUrl.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    performManualMercuryNavigation({
      targetUrl: trimmed,
      postEngineCloseOnEmbedFailure: true,
    })
    return
  }

  if (options?.routerPush && trimmed.startsWith('/')) {
    options.routerPush(trimmed)
    return
  }

  window.location.assign(getSafeMercuryNavigationUrl(trimmed))
}

export function navigateToMercuryFromManualHandoff(
  params: BuildManualMercuryReturnFromBrowserParams
): void {
  try {
    performManualMercuryNavigation({
      targetUrl: buildManualMercuryReturnFromBrowser(params),
      postEngineCloseOnEmbedFailure: true,
    })
  } catch (error) {
    generalLogger.error('[manualMercuryNavigate] navigateToMercuryFromManualHandoff failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    performManualMercuryNavigation({
      targetUrl: buildManualExitClientViewFallbackUrl({
        clientContextId: params.clientContextId,
        currentLocale: params.currentLocale,
        sourceApp: readManualMercuryHandoffFromBrowser().sourceApp,
        mercuryUrl: params.mercuryUrl ?? getMercuryUrl(),
      }),
      postEngineCloseOnEmbedFailure: true,
    })
  }
}
