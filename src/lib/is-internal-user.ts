/**
 * Venus internal-user detection — mirrors Mercury's
 * `apps/mercury/shared/lib/is-internal-user.ts`. Kept as a separate file
 * (rather than importing across apps) because Venus and Mercury are deployed
 * independently and the env var contract may diverge over time.
 *
 * Detection sources:
 *   1. Email domain matches `@upswitch.com`, `@upswitch.app`, etc.
 *   2. `NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS` env (comma/whitespace separated)
 *   3. `NEXT_PUBLIC_INTERNAL_EMAILS` env exact-match allowlist
 *
 * The Venus property (`G-0RW0LNCVBG`) is its own GA4 stream; tagging staff
 * with `is_internal=true` lets cross-property GA4 reports (Mercury + Venus
 * federated funnels) filter out dogfooding traffic with a single user-property
 * exclusion instead of joining session IDs across two properties.
 */

const DEFAULT_INTERNAL_EMAIL_DOMAINS: readonly string[] = [
  'upswitch.com',
  'upswitch.app',
  'upswitch.eu',
  'upswitch.io',
]

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
}

function getInternalEmailDomains(): string[] {
  const fromEnv = parseAllowlist(process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAINS)
  return Array.from(new Set<string>([...DEFAULT_INTERNAL_EMAIL_DOMAINS, ...fromEnv]))
}

function getInternalEmailAllowlist(): string[] {
  return parseAllowlist(process.env.NEXT_PUBLIC_INTERNAL_EMAILS)
}

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return false
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return false
  const domain = trimmed.slice(at + 1)

  if (getInternalEmailAllowlist().includes(trimmed)) return true

  const internalDomains = getInternalEmailDomains()
  for (const internal of internalDomains) {
    if (domain === internal || domain.endsWith(`.${internal}`)) return true
  }
  return false
}
