import { ENGINE_TO_MERCURY_MESSAGE_TYPES } from '@/constants/crossAppMessages'
import { EMBEDDED_STORAGE_KEY } from '@/hooks/useEmbeddedMode'
import { isLegacyReturnUrl, isTrustedUpswitchHostname } from '@/lib/return-url'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { generalLogger } from '@/utils/logger'
import {
  buildManualExitClientViewFallbackUrl,
  buildManualExitClientViewTarget,
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
      returnUrl:
        sessionStorage.getItem('upswitch_return_url') ?? urlParams.get('return_url'),
      sourceApp: sessionStorage.getItem('upswitch_source') ?? urlParams.get('source'),
    }
  } catch {
    return { returnUrl: null, sourceApp: null }
  }
}

export function isManualMercuryEmbeddedContext(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      sessionStorage.getItem(EMBEDDED_STORAGE_KEY) === 'true' || window.self !== window.top
    )
  } catch {
    return true
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

  if (raw.startsWith('/')) {
    return raw
  }

  const base = (mercuryBaseUrl ?? getMercuryUrl()).replace(/\/$/, '')
  try {
    const baseOrigin = new URL(base).origin
    const target = new URL(raw)
    if (target.origin !== baseOrigin) return null
    if (!isTrustedUpswitchHostname(target.hostname)) return null
    return `${target.pathname}${target.search}${target.hash}`
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

  const path = targetPath ?? resolveMercuryNavigationPathForEmbed(targetUrl)

  if (isManualMercuryEmbeddedContext() && path) {
    try {
      window.parent.postMessage(
        {
          type: ENGINE_TO_MERCURY_MESSAGE_TYPES.navigateToMercury,
          source: 'venus',
          data: { url: path },
        },
        '*'
      )
      window.setTimeout(() => {
        window.location.href = targetUrl
      }, 750)
      return
    } catch (error) {
      generalLogger.warn('[manualMercuryNavigate] navigateToMercury postMessage failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      if (postEngineCloseOnEmbedFailure) {
        try {
          window.parent.postMessage(
            { type: ENGINE_TO_MERCURY_MESSAGE_TYPES.engineClose, source: 'venus' },
            '*'
          )
        } catch {
          // Cross-window messaging can fail in hardened browser contexts.
        }
      }
    }
  }

  window.location.href = targetUrl
}

export interface BuildManualMercuryReturnFromBrowserParams {
  currentLocale: string
  clientContextId?: string | null
  hasCompletedValuation: boolean
  mercuryUrl?: string
}

/** Resolve a safe Mercury return URL from browser handoff state. */
export function buildManualMercuryReturnFromBrowser({
  currentLocale,
  clientContextId,
  hasCompletedValuation,
  mercuryUrl,
}: BuildManualMercuryReturnFromBrowserParams): string {
  const { returnUrl, sourceApp } = readManualMercuryHandoffFromBrowser()
  return buildManualExitClientViewTarget({
    returnUrl,
    clientContextId,
    currentLocale,
    sourceApp,
    mercuryUrl: mercuryUrl ?? getMercuryUrl(),
    hasCompletedValuation,
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

  window.location.href = trimmed
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
