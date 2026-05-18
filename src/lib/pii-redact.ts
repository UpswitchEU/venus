/**
 * P0-4 — Venus structured-PII redactor for observability egress
 * (PostHog event properties).
 *
 * Mirrors `apps/mercury/shared/lib/pii-redact.ts` and
 * `packages/llm-privacy/src/sanitizer.ts:redactStructuredPii`
 * byte-for-byte. When Venus opts into transpiling the shared package,
 * delete this file and import from `@upswitch/llm-privacy/sanitizer`.
 *
 * See docs/security/data-anonymization-architecture-2026-05-17.md §P0-4.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
const KBO_DOTTED_RE = /\b\d{4}\.\d{3}\.\d{3}\b/g
const BE_VAT_RE = /\bBE\s?0?\d{9,10}\b/gi
const IBAN_RE = /\b[A-Z]{2}\d{2}[\sA-Z0-9]{10,34}\b/gi
const URL_RE = /https?:\/\/[^\s]+/gi
const PHONE_LIKE_RE = /(?:\+32|0032|0)(?:[\s./-]?\d){8,12}\b/gi
const LONG_DIGIT_RUN_RE = /\b\d{13,}\b/g

export function redactStructuredPii(raw: string | null | undefined): string {
  if (raw == null) return ''
  let s = String(raw).normalize('NFKC')

  s = s.replace(EMAIL_RE, '[email]')
  s = s.replace(URL_RE, '[url]')
  s = s.replace(BE_VAT_RE, '[vat]')
  s = s.replace(IBAN_RE, '[iban]')
  s = s.replace(KBO_DOTTED_RE, '[ondernemingsnummer]')
  s = s.replace(PHONE_LIKE_RE, '[telefoon]')
  s = s.replace(LONG_DIGIT_RUN_RE, '[nummer]')

  return s
}

export function scrubPostHogParams(
  params: Record<string, string | number | boolean> | undefined
): Record<string, string | number | boolean> | undefined {
  if (!params) return params
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === 'string' ? redactStructuredPii(v) : v
  }
  return out
}
