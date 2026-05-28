/**
 * Encode / decode Silverfin firm id (+ optional CSRF nonce) in OAuth `state`
 * so the callback can recover `firm_id` (Silverfin does not add it to the
 * redirect query string) AND validate that the callback originated from a
 * flow this tab kicked off.
 *
 * Shape mirrors Mercury's helper at apps/mercury/shared/utils/silverfin-oauth-state.ts;
 * keeping the two in lockstep means a callback redirected to the wrong
 * tenant subdomain still validates against the originating tab's nonce
 * rather than silently linking to the wrong session.
 *
 * Wire shape (base64url-encoded JSON):
 *   { "firm_id": "12345", "nonce": "<random 32-byte token>" }
 */

export interface SilverfinOAuthStatePayload {
  firm_id: string
  nonce: string | null
}

export function encodeSilverfinOAuthState(firmId: string, nonce?: string): string {
  const trimmedFirm = firmId.trim()
  if (!trimmedFirm) {
    throw new Error('firm_id is required')
  }
  const trimmedNonce = (nonce || '').trim()
  const payload: { firm_id: string; nonce?: string } = { firm_id: trimmedFirm }
  if (trimmedNonce) {
    payload.nonce = trimmedNonce
  }
  const json = JSON.stringify(payload)
  const base64 = btoa(json)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Legacy single-value extractor — callers that need CSRF validation
 * should switch to ``decodeSilverfinOAuthStatePayload`` for both fields. */
export function decodeSilverfinOAuthState(state: string | null): string | null {
  return decodeSilverfinOAuthStatePayload(state)?.firm_id ?? null
}

export function decodeSilverfinOAuthStatePayload(
  state: string | null,
): SilverfinOAuthStatePayload | null {
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
    const o = JSON.parse(json) as { firm_id?: string; nonce?: string }
    const id = o.firm_id?.trim()
    if (!id) return null
    const nonce = o.nonce?.trim() || null
    return { firm_id: id, nonce }
  } catch {
    return null
  }
}
