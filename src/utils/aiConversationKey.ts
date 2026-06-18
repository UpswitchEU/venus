/**
 * Cross-app AI conversation key derivation.
 *
 * MUST stay byte-for-byte identical to Mercury's and Titan's
 * client-scoped `client_<clientUserId>` branch in
 * `apps/mercury/shared/components/ai-dock/tool-card-parser.ts`.
 * Tests in both apps pin the same shared fixture input -> output so drift
 * surfaces in CI.
 *
 * Why a duplicate (not a shared package):
 *   The client-scoped branch is ~10 lines of pure string math. Lifting it into
 *   `packages/types` (or a new `packages/ai-keys`) would add a
 *   build-graph edge for negligible savings. The byte-equality
 *   contract is enforced by a shared root fixture consumed by both apps.
 *
 * What this key unlocks:
 *   When the Mercury advisor dock and the Venus calculator chat
 *   drawer BOTH produce `client_<clientUserId>` as the conversation
 *   key, Titan's `conversation.service.ts` finds (or creates) the
 *   SAME `ai_conversations` row for both surfaces — because non-UUID
 *   `reportId` strings are routed to the `session_id` column
 *   (`conversation.service.ts:30-32`). No DB migration needed; the
 *   string is the index.
 *
 * Fallback shape:
 *   When no clientUserId is available (Venus on a stand-alone
 *   valuation, or the accountant cleared client context), we fall
 *   back to whatever key the caller normally uses (the report UUID
 *   or `val_<x>` session key). That keeps non-client-context threads
 *   on their existing keys — no surprise orphaning.
 */

export interface ClientScopedKeyArgs {
  /**
   * The customer's user UUID. In Venus this comes from
   * `useClientContext().clientUserId` (set when the accountant has
   * entered client view via the role switcher).
   */
  clientUserId?: string | null
}

export {
  deriveAdvisorWorkspaceSessionKey,
  deriveClientScopedSessionKey as deriveClientScopedSessionKeyFromPackage,
} from '@upswitch/ai-actions'

/**
 * Returns `client_<clientUserId>` when the customer is in scope,
 * `null` otherwise. Callers fall back to their existing key when
 * `null` — this function deliberately does NOT manufacture an
 * "advisor-scratchpad" fallback (Venus has no advisor scratchpad
 * surface; that's Mercury's concern).
 */
export function deriveClientScopedSessionKey(args: ClientScopedKeyArgs): string | null {
  const clientId =
    typeof args.clientUserId === 'string' && args.clientUserId.length > 0 ? args.clientUserId : null
  if (!clientId) return null
  return `client_${clientId}`
}
