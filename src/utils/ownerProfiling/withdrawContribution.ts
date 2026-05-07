import { generalLogger } from '../logger'

/**
 * DATA-1 — withdraw a previously-submitted anonymized contribution
 * (GDPR right-to-erasure / "manage my contribution" UX).
 *
 * Calls Titan `POST /api/v2/multiples/contribute/withdraw`. The endpoint
 * is JWT-guarded; Venus inherits the auth cookie via `credentials:
 * include` because Venus + Mercury share the same Titan auth domain.
 *
 * The originating valuation_id is the only acceptable reference shape
 * for user-initiated withdrawals — Titan rejects non-UUID references
 * with a 400 (partner withdrawals require an admin token + the Delphi
 * route directly). Venus pins `contributor_reference = valuation_id`
 * at submit time, so this matches the contribution naturally.
 *
 * Idempotency: a retry after a transient network failure is safe.
 * Delphi's underlying handler returns `already_withdrawn` for a
 * second call with the same reference; this util surfaces that as a
 * successful no-op.
 */
export type WithdrawStatus = 'withdrawn' | 'already_withdrawn' | 'not_found'

export interface WithdrawResult {
  status: WithdrawStatus
  rowsAffected: number
  contributorReference: string
}

interface WithdrawArgs {
  /** Valuation UUID. Anything else is rejected by Titan with a 400. */
  valuationId: string
  /** Optional free-form rationale captured for audit (≤256 chars). */
  reason?: string
  signal?: AbortSignal
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}

/**
 * Returns the Titan response on success, throws on validation / auth /
 * transport errors. Callers should catch and surface a generic
 * "couldn't withdraw, please try again" — never leak the underlying
 * error to the user (security boundary).
 */
export async function withdrawAnonymizedContribution({
  valuationId,
  reason,
  signal,
}: WithdrawArgs): Promise<WithdrawResult> {
  const titanUrl = process.env.NEXT_PUBLIC_TITAN_API_URL || ''
  if (!titanUrl) {
    throw new Error('Titan API URL not configured')
  }
  const ref = valuationId.trim()
  if (!isUuid(ref)) {
    // Fail fast — no point round-tripping a known-bad shape.
    throw new Error('valuation_id must be a UUID')
  }

  const trimmedReason = reason?.trim()
  const body = {
    contributor_reference: ref,
    ...(trimmedReason ? { reason: trimmedReason.slice(0, 256) } : {}),
  }

  const res = await fetch(`${titanUrl}/api/v2/multiples/contribute/withdraw`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 401 || res.status === 403) {
    throw new Error('Authentication required to withdraw')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Withdraw failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const raw: unknown = await res.json().catch(() => null)
  if (raw == null || typeof raw !== 'object') {
    throw new Error('Withdraw: invalid Titan response')
  }
  const o = raw as Record<string, unknown>
  const status = o.status
  const rowsAffected = typeof o.rows_affected === 'number' ? o.rows_affected : 0
  const contributorReference =
    typeof o.contributor_reference === 'string' ? o.contributor_reference : ref

  if (
    status !== 'withdrawn' &&
    status !== 'already_withdrawn' &&
    status !== 'not_found'
  ) {
    throw new Error(
      `Withdraw: unexpected status ${typeof status === 'string' ? status : 'unknown'}`,
    )
  }

  generalLogger.info('Anonymized contribution withdrawn', {
    valuationIdPrefix: ref.slice(0, 8),
    status,
    rowsAffected,
  })

  return { status, rowsAffected, contributorReference }
}

// Exported for unit tests.
export const __testing__ = { isUuid }
