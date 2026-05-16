/**
 * PostHog env reads only (no posthog-js). Safe to import from server code.
 *
 * Canonical: NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN + NEXT_PUBLIC_POSTHOG_HOST.
 * Legacy: NEXT_PUBLIC_POSTHOG_KEY — still supported for existing deploys.
 */
export function getPostHogProjectToken(): string | undefined {
  const t =
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  return t || undefined
}

export function getPostHogApiHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com'
}
