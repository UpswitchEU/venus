/**
 * Session ID validation for Titan API calls.
 * Titan requires session_id 8–128 chars; rejects 'new' and invalid lengths.
 *
 * Aligns with normalization persistence hooks: `persistNormalizationsBeforeCalculate`,
 * `normalizationSnapshot`, and `useNormalizationStore` skip Titan normalization calls unless
 * this passes — avoid integration/pre-session phases hitting `/api/normalization` with placeholders.
 *
 * @module utils/sessionIdValidation
 */
export function isValidSessionId(id: string): boolean {
  const t = String(id || '').trim()
  return t.length >= 8 && t.length <= 128 && t !== 'new'
}
