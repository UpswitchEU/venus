/**
 * Standalone (non-embedded) report-ready hash policy.
 *
 * When the engine renders a report that was opened as a top-level page (i.e.
 * NOT inside an iframe handed off from Mercury), we mark the URL with
 * `#ready` once the bootstrap has synced. Mercury's transition loader and any
 * external automation/E2E harness can poll for this hash to know the report
 * has fully loaded.
 *
 * Two invariants are enforced here:
 *
 *   1. The user-visible URL must NEVER contain the internal codename `venus`.
 *      We deliberately moved away from the legacy `#venus-ready` token to
 *      `#ready` for that reason. See:
 *      `apps/venus/src/components/ValuationReport.tsx`.
 *
 *   2. Pages already on the legacy `#venus-ready` hash (in-flight tabs that
 *      loaded before the rename shipped) MUST NOT be rewritten — that would
 *      be a redundant `replaceState` call producing pointless history noise.
 *
 * Extracting this into a pure helper lets us regression-test the policy
 * without spinning up the full `ValuationReport` React tree.
 */

export const STANDALONE_REPORT_READY_HASH = '#ready' as const
export const LEGACY_STANDALONE_REPORT_READY_HASH = '#venus-ready' as const

export interface StandaloneReportReadyHashInput {
  pathname: string
  search: string
  hash: string
}

export interface StandaloneReportReadyHashResult {
  /** True if the caller should invoke `history.replaceState` with `nextUrl`. */
  shouldReplace: boolean
  /** Full URL (path + search + hash) to write when `shouldReplace` is true. */
  nextUrl: string
}

/**
 * Decide whether a standalone report page should rewrite its URL hash to
 * `#ready` and produce the next URL.
 *
 * - Returns `shouldReplace: false` if the hash is already `#ready` or the
 *   legacy `#venus-ready` (no user-facing benefit to rewriting either).
 * - Returns `shouldReplace: true` with the new URL otherwise.
 *
 * The function never reveals the internal codename in `nextUrl`.
 */
export function resolveStandaloneReportReadyHash(
  input: StandaloneReportReadyHashInput
): StandaloneReportReadyHashResult {
  const { pathname, search, hash } = input
  if (hash === STANDALONE_REPORT_READY_HASH || hash === LEGACY_STANDALONE_REPORT_READY_HASH) {
    return { shouldReplace: false, nextUrl: `${pathname}${search}${hash}` }
  }
  return {
    shouldReplace: true,
    nextUrl: `${pathname}${search}${STANDALONE_REPORT_READY_HASH}`,
  }
}
