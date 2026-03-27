/**
 * Encode / decode Silverfin firm id in OAuth `state` so the callback can recover
 * `firm_id` (Silverfin does not add it to the redirect query string).
 */

export function encodeSilverfinOAuthState(firmId: string): string {
  const trimmed = firmId.trim()
  if (!trimmed) {
    throw new Error('firm_id is required')
  }
  const json = JSON.stringify({ firm_id: trimmed })
  const base64 = btoa(json)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeSilverfinOAuthState(state: string | null): string | null {
  if (!state?.trim()) {
    return null
  }
  try {
    let b64 = state.trim().replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) {
      b64 += '='.repeat(4 - pad)
    }
    const json = atob(b64)
    const o = JSON.parse(json) as { firm_id?: string }
    const id = o.firm_id?.trim()
    return id || null
  } catch {
    return null
  }
}
