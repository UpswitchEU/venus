import { getMercuryUrl } from './getMercuryUrl'
import {
  MERCURY_SITE_WWW_CANONICAL,
  tryNormalizeToOrigin,
} from './normalizeExplicitUrl'

const STATIC_TRUSTED_MERCURY_PARENT_HOSTS = new Set([
  'upswitch.app',
  'www.upswitch.app',
  'preview.upswitch.app',
  'staging.upswitch.app',
  'upswitch.biz',
  'mercury-git-main-upswitch.vercel.app',
  'mercury-git-staging-upswitch.vercel.app',
])

export type MercuryParentMessage = Record<string, unknown> & {
  type: string
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

export function isTrustedMercuryParentOrigin(
  rawOrigin: string | null | undefined,
  configuredOrigin = resolveConfiguredMercuryParentOrigin()
): boolean {
  const origin = tryNormalizeToOrigin(rawOrigin)
  if (!origin) return false
  if (configuredOrigin && origin === configuredOrigin) return true

  try {
    const parsed = new URL(origin)
    if (parsed.protocol === 'http:') {
      return process.env.NODE_ENV !== 'production' && isLoopbackHost(parsed.hostname)
    }
    if (parsed.protocol !== 'https:') return false
    return STATIC_TRUSTED_MERCURY_PARENT_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

function resolveConfiguredMercuryParentOrigin(): string {
  return tryNormalizeToOrigin(getMercuryUrl()) ?? MERCURY_SITE_WWW_CANONICAL
}

function resolveReferrerOrigin(): string | null {
  if (typeof document === 'undefined') return null
  return tryNormalizeToOrigin(document.referrer)
}

export function resolveMercuryParentTargetOrigin(): string {
  const configuredOrigin = resolveConfiguredMercuryParentOrigin()
  const referrerOrigin = resolveReferrerOrigin()
  if (referrerOrigin && isTrustedMercuryParentOrigin(referrerOrigin, configuredOrigin)) {
    return referrerOrigin
  }
  return configuredOrigin
}

export function postMessageToMercuryParent(message: MercuryParentMessage): boolean {
  if (typeof window === 'undefined' || window.parent === window) return false

  try {
    window.parent.postMessage(message, resolveMercuryParentTargetOrigin())
    return true
  } catch {
    return false
  }
}
