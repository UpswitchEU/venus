/**
 * Response-shape adapters for Venus's chat-drawer approve handlers
 * (`handleApproveSellabilityRun`, future `handleApproveReportGeneration`
 * etc.).
 *
 * Why a dedicated file: the BFF response shapes for Sellability + PDF
 * generation are NOT stable across Mercury vs Venus deployments — Titan
 * wraps responses as `{ success, data }` but legacy or direct Titan
 * endpoints sometimes surface fields at the top level. Each surface
 * (Mercury dock, Venus drawer) defensively parses BOTH shapes, and that
 * defensive parsing has historically lived as inline ad-hoc code that
 * silently regresses when one of the wrappers changes.
 *
 * MIRROR of `apps/mercury/shared/components/ai-dock/tool-card-parser.ts`'s
 * `parseSellabilityScoreResponse` / `parseReportPdfResponse` /
 * `extractErrorMessage`. The two are intentionally kept in sync — if one
 * adapter changes, the other should too. Tests in both apps pin the
 * behavior independently so cross-app drift is caught at test time.
 */

export interface SellabilityScoreParseResult {
  score: number;
  band: string;
  confidence?: string;
}

/**
 * Extract sellability score + band from Venus's /api/sellability/score
 * proxy response. Accepts either the BFF-wrapped shape
 *   `{ success: true, data: { score, band, confidence? } }`
 * or the legacy/direct shape
 *   `{ score, band, confidence? }`.
 *
 * Returns null when neither carries a usable score. Top-level wins
 * on conflict (matches Mercury parity).
 *
 * Venus's drawer carries an optional `confidence` field that Mercury's
 * dock doesn't render — included here so toast labels can show "high"
 * vs "low" when present without breaking when absent.
 */
export function parseSellabilityScoreResponse(
  json: unknown
): SellabilityScoreParseResult | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as {
    score?: unknown;
    band?: unknown;
    confidence?: unknown;
    data?: unknown;
  };

  if (typeof obj.score === 'number' && typeof obj.band === 'string') {
    return {
      score: obj.score,
      band: obj.band,
      ...(typeof obj.confidence === 'string' && { confidence: obj.confidence }),
    };
  }

  const data = obj.data as
    | { score?: unknown; band?: unknown; confidence?: unknown }
    | undefined;
  if (
    data &&
    typeof data === 'object' &&
    typeof data.score === 'number' &&
    typeof data.band === 'string'
  ) {
    return {
      score: data.score,
      band: data.band,
      ...(typeof data.confidence === 'string' && { confidence: data.confidence }),
    };
  }

  return null;
}

/**
 * Extract a human-presentable error message from a BFF / Titan error
 * response. Tries `error`, then `message`, then falls back to a generic
 * "HTTP <status>" string. Returns the fallback even when `json` is
 * malformed (non-object, null, missing fields).
 *
 * NOTE — Venus historically reads `error` FIRST (not `message`) for this
 * surface, because the Venus /api/sellability/score proxy emits
 * `{ success: false, error: '<msg>' }` on Titan failure. Mercury's twin
 * tries `message` first because its proxy wraps Titan's `message` field
 * directly. Both fallback chains are pinned by tests so divergence is
 * deliberate and visible.
 */
export function extractErrorMessage(json: unknown, status: number): string {
  if (json && typeof json === 'object') {
    const obj = json as { error?: unknown; message?: unknown };
    if (typeof obj.error === 'string' && obj.error.length > 0) return obj.error;
    if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
  }
  return `HTTP ${status}`;
}
