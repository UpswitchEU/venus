/**
 * Titan refuses an unpublishable report with a typed body carrying a stable `code` and a
 * `remediation` sentence the adviser can act on. BFF error bodies keep both so the browser
 * can show the remediation (localized by code) instead of a generic "try again".
 */
export function pickPdfRefusalFields(body: unknown): { code?: string; remediation?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  const record = body as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code.trim() : ''
  const remediation = typeof record.remediation === 'string' ? record.remediation.trim() : ''
  return {
    ...(code ? { code } : {}),
    ...(remediation ? { remediation } : {}),
  }
}
