/**
 * Session ID validation for Titan API calls.
 * Titan requires session_id 8–128 chars; rejects 'new' and invalid lengths.
 *
 * @module utils/sessionIdValidation
 */

/** Titan requires session_id 8–128 chars; reject 'new' and invalid lengths */
export function isValidSessionId(id: string): boolean {
  const t = String(id || '').trim()
  return t.length >= 8 && t.length <= 128 && t !== 'new'
}
