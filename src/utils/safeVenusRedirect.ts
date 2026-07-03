import { tryNormalizeToOrigin } from './normalizeExplicitUrl'

export const VENUS_SITE_CANONICAL = 'https://valuation.upswitch.app'

const STATIC_TRUSTED_VENUS_REDIRECT_HOSTS = new Set([
  'valuation.upswitch.app',
  'preview.valuation.upswitch.app',
  'staging.valuation.upswitch.app',
  'valuation.upswitch.biz',
  'venus-git-main-upswitch.vercel.app',
  'venus-git-staging-upswitch.vercel.app',
])

function isLoopbackRedirectHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

function configuredVenusRedirectOrigins(): Set<string> {
  return new Set(
    [
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_VENUS_URL,
      process.env.VERCEL_URL,
    ]
      .map(tryNormalizeToOrigin)
      .filter((origin): origin is string => Boolean(origin))
  )
}

export function isTrustedVenusRedirectOrigin(origin: string | undefined): boolean {
  const normalized = tryNormalizeToOrigin(origin)
  if (!normalized) return false
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (isLoopbackRedirectHost(parsed.hostname)) return true
    if (STATIC_TRUSTED_VENUS_REDIRECT_HOSTS.has(parsed.hostname.toLowerCase())) return true
    return configuredVenusRedirectOrigins().has(parsed.origin)
  } catch {
    return false
  }
}

export function venusRedirectOriginFromOrigin(origin: string | undefined): string {
  const normalized = tryNormalizeToOrigin(origin)
  if (normalized && isTrustedVenusRedirectOrigin(normalized)) return normalized
  return tryNormalizeToOrigin(process.env.NEXT_PUBLIC_BASE_URL) ?? VENUS_SITE_CANONICAL
}

function hasUnsafeInternalPathChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char === '\\' || code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function safeVenusInternalPath(raw: string | null | undefined): string | null {
  const path = raw?.trim()
  if (!path || hasUnsafeInternalPathChar(path)) return null
  if (!path.startsWith('/') || path.startsWith('//')) return null
  try {
    const candidate = new URL(path, VENUS_SITE_CANONICAL)
    if (candidate.origin !== VENUS_SITE_CANONICAL) return null
    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return null
  }
}

export function safeVenusSameOriginNavigationTarget(
  raw: string | null | undefined,
  origin: string | undefined
): string | null {
  const target = raw?.trim()
  if (!target) return null

  const baseOrigin = venusRedirectOriginFromOrigin(origin)
  if (target.startsWith('/')) {
    return safeVenusInternalPath(target)
  }

  try {
    const parsed = new URL(target, baseOrigin)
    if (parsed.origin !== baseOrigin) return null
    const internalPath = safeVenusInternalPath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
    return internalPath ? parsed.toString() : null
  } catch {
    return null
  }
}

export function venusInternalRedirectUrl(
  origin: string | undefined,
  pathname: string,
  search?: string | null
): URL {
  const url = new URL(safeVenusInternalPath(pathname) ?? '/', venusRedirectOriginFromOrigin(origin))
  if (search?.trim()) {
    url.search = search.startsWith('?') ? search : `?${search}`
  }
  return url
}

export type SafeNewTabUrlOptions = {
  allowExternalHttps?: boolean
  allowBlob?: boolean
  allowInternalPath?: boolean
}

export function safeNewTabUrl(
  raw: string | null | undefined,
  options: SafeNewTabUrlOptions = {}
): string | null {
  const target = raw?.trim()
  if (!target) return null
  const { allowExternalHttps = true, allowBlob = false, allowInternalPath = true } = options
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : VENUS_SITE_CANONICAL
  const internalPath = safeVenusInternalPath(target)
  if (allowInternalPath && internalPath) return internalPath

  try {
    const parsed = new URL(target, currentOrigin)
    if (
      allowInternalPath &&
      parsed.origin === currentOrigin &&
      safeVenusInternalPath(parsed.pathname)
    ) {
      return parsed.toString()
    }
    if (allowExternalHttps && parsed.protocol === 'https:') return parsed.toString()
    if (parsed.protocol === 'http:' && isLoopbackRedirectHost(parsed.hostname)) {
      return parsed.toString()
    }
    if (allowBlob && parsed.protocol === 'blob:' && parsed.origin === currentOrigin) {
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}

export function safeExternalHref(raw: string | null | undefined): string | null {
  return safeNewTabUrl(raw, { allowInternalPath: false })
}

export function openSafeNewTabUrl(
  raw: string | null | undefined,
  options: SafeNewTabUrlOptions = {}
): Window | null {
  if (typeof window === 'undefined') return null
  const safeUrl = safeNewTabUrl(raw, options)
  if (!safeUrl) return null
  return window.open(safeUrl, '_blank', 'noopener,noreferrer')
}
