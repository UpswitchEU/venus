/**
 * Auth cookie **scope** authority for Venus.
 *
 * Third copy of the same contract, alongside
 * `apps/titan-api/src/auth/utils/auth-cookie-scope.util.ts` and
 * `apps/mercury/shared/utils/auth/auth-cookie-scope.ts`. The three must agree,
 * because on 2026-09-19 they did not:
 *
 * | layer                                        | keeps    |
 * | -------------------------------------------- | -------- |
 * | Titan — `@fastify/cookie`                    | **FIRST** |
 * | Mercury / Venus — Next.js `RequestCookies`   | **LAST**  |
 * | `mergeCookieHeaderFromSetCookieHeaders`      | **LAST**  |
 *
 * RFC 6265 §5.4 sends the oldest cookie first, so a stale cookie left in a
 * foreign scope was what Titan authorised as, while the Next.js layers
 * resolved the current user. One operator was served another's advisor
 * portfolio.
 *
 * Venus matters here specifically because `bffAuthProxy` merges the raw
 * `Cookie` header into a name-keyed map before forwarding to Titan — which
 * **de-duplicates the conflict away**, so Titan's own fail-closed guard never
 * sees it. Without this check Venus would happily serve a jar that Mercury
 * bounces and Titan refuses.
 */

/** Cookies that carry identity. Duplicates of these are a security event. */
export const AUTH_IDENTITY_COOKIE_NAMES = [
  'upswitch_access_token',
  'upswitch_refresh_token',
] as const

export type DuplicateAuthCookie = {
  name: string
  /** Every value sent, in header order (index 0 is what Titan/Fastify would use). */
  values: string[]
  /** True when the values disagree — two different identities in one jar. */
  conflicting: boolean
}

/** Every value the browser sent for `name`, in header order. */
export function readAllCookieValues(
  rawCookieHeader: string | undefined | null,
  name: string
): string[] {
  if (!rawCookieHeader) return []
  const values: string[] = []
  for (const segment of rawCookieHeader.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq).trim() !== name) continue
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1)
    }
    values.push(value)
  }
  return values
}

/** Auth cookies the browser sent more than once. */
export function detectDuplicateAuthCookies(
  rawCookieHeader: string | undefined | null
): DuplicateAuthCookie[] {
  const duplicates: DuplicateAuthCookie[] = []
  for (const name of AUTH_IDENTITY_COOKIE_NAMES) {
    const values = readAllCookieValues(rawCookieHeader, name)
    if (values.length <= 1) continue
    duplicates.push({ name, values, conflicting: new Set(values).size > 1 })
  }
  return duplicates
}

/** True when the jar holds two *different* values for an identity cookie. */
export function hasConflictingAuthCookies(rawCookieHeader: string | undefined | null): boolean {
  return detectDuplicateAuthCookies(rawCookieHeader).some((d) => d.conflicting)
}

/** Redacted summary — token values are credentials and are never logged. */
export function describeDuplicateAuthCookies(duplicates: DuplicateAuthCookie[]): string {
  return duplicates
    .map((d) => `${d.name}[n=${d.values.length},conflicting=${d.conflicting}]`)
    .join(' ')
}
