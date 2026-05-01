/**
 * Anonymous-landing → authenticated-Venus handoff.
 *
 * The public ``/[locale]/landing/startup`` page lets a founder fill out
 * the entire startup wizard before signing up.  When they hit "Generate
 * my report" we (a) snapshot the studio store + the manual identity
 * store into localStorage under a known key, (b) bounce them to Mercury
 * signup with a ``returnUrl`` pointing back at Venus's authenticated
 * ``/[locale]/reports/new?prefill_from=landing&selected_method=startup_valuation``,
 * and (c) the auth side reads the snapshot once on mount and hydrates
 * both stores so the founder lands in Venus with every section already
 * pre-filled — no re-typing.
 *
 * Why localStorage and not sessionStorage:
 *   - Mercury's signup flow is a hard navigation (separate origin) and
 *     can take long enough that the user closes / reopens the tab.
 *     localStorage survives a tab close; sessionStorage doesn't.
 *   - The snapshot self-expires (TTL) so a stale handoff from days ago
 *     doesn't silently pollute a fresh wizard run.
 *   - We never put anything sensitive in here (only the same numbers
 *     the founder typed into a public form).  No tokens, no PII the
 *     user didn't volunteer.
 *
 * Why we ship our own helper instead of reusing
 * ``capitalHistoryPrefill.ts``:
 *   - That helper carries two scalars (round size + dilution) for the
 *     studio→SaaS in-tab redirect — sessionStorage suffices there.
 *   - This helper carries a multi-store JSON snapshot through a
 *     cross-origin signup hop — different lifetime, different scope.
 *   - Sharing one helper would force one of the two to inherit the
 *     wrong tradeoff.  Two named helpers keep the contracts explicit.
 *
 * The shape is deliberately the public surface of the two stores —
 * ``useStartupValuationStore.applyFromSnapshot`` already exists for the
 * same handoff Titan uses (session-restore), so we re-use it on the
 * auth side rather than reinventing field-by-field merging.
 */

const STORAGE_KEY = 'venus_landing_studio_handoff'

/** 24-hour TTL.  A founder who comes back the next day still gets their
 *  inputs; one who comes back a week later starts clean.  The window is
 *  long enough to cover an email-verify roundtrip but short enough that
 *  a handoff written by a previous user on a shared device doesn't leak
 *  into the next session.  Tunable in one place if user research moves
 *  the needle. */
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Snapshot envelope.  The two ``Record<string, unknown>`` payloads are
 * the JSON-serialisable shapes of the Studio store and the Manual form
 * store respectively — narrower typing would require importing the
 * store types here, which creates a circular module dependency
 * (helper → store → component → helper).  The auth-side consumer
 * applies them through the typed ``applyFromSnapshot`` / ``updateFormData``
 * setters so any field-name drift is caught at the store boundary.
 */
export interface LandingStudioHandoff {
  /**
   * Snapshot of ``useStartupValuationStore`` produced by its
   * ``getSnapshot`` selector (or ``getState`` when no selector is
   * available).  Carries the wizard inputs (Berkus / Scorecard /
   * pedigree / traction / exit-story / round-simulator).
   */
  studio: Record<string, unknown>
  /**
   * Snapshot of the identity-bridge fields on ``useManualFormStore`` —
   * company_name, country_code, kbo_number, legal_form, nace_code,
   * nace_description, business_type_id, industry.  Read by
   * ``buildStartupValuationRequest`` so the auth-side calc has the same
   * KBO/KVK identity the landing page captured.
   */
  formData: Record<string, unknown>
  /**
   * Wall-clock timestamp at write.  Drives the TTL check on read.
   * ``Date.now()`` rather than ISO so the consumer can compare with
   * one subtraction.
   */
  written_at_ms: number
  /**
   * Source label — currently always ``"landing"``; reserved so future
   * surfaces (e.g. an in-Mercury embedded calculator) can re-use the
   * channel without colliding on the same key.
   */
  source: 'landing'
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/**
 * Persist a landing → authenticated handoff snapshot.  Silently no-ops
 * on the server (Next.js SSR pass) or when localStorage is locked down
 * (Safari private mode, third-party cookies disabled).  We never throw —
 * the user still gets to Mercury signup; the only loss is a typed
 * re-entry on the authenticated wizard, which is a degraded but valid
 * experience.
 */
export function writeLandingStudioHandoff(payload: {
  studio: Record<string, unknown>
  formData: Record<string, unknown>
}): void {
  if (!isBrowser()) return
  try {
    const envelope: LandingStudioHandoff = {
      studio: payload.studio,
      formData: payload.formData,
      written_at_ms: Date.now(),
      source: 'landing',
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // QuotaExceededError, security errors, third-party-cookies-disabled —
    // any of these shouldn't block the redirect to signup.  The auth
    // side will simply see no handoff and let the user start fresh.
  }
}

/**
 * Read-and-clear the handoff snapshot.  Returns ``null`` when nothing
 * was queued, the snapshot is malformed, the snapshot is older than
 * :data:`TTL_MS`, or localStorage is unavailable.
 *
 * The "consume" semantic is deliberate: callers hydrate the stores
 * once, then drop the snapshot in the same atomic step so a refresh
 * after the user has edited fields never re-overwrites their typed
 * values.  Stale entries (TTL) are silently dropped on read — never
 * leave them lingering.
 */
export function consumeLandingStudioHandoff(): LandingStudioHandoff | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    // Always clear — even on parse failure or TTL expiry, never leave
    // a corrupt or stale entry to surprise a future read.
    window.localStorage.removeItem(STORAGE_KEY)
    const parsed = JSON.parse(raw) as Partial<LandingStudioHandoff> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (
      typeof parsed.written_at_ms !== 'number' ||
      !Number.isFinite(parsed.written_at_ms)
    ) {
      return null
    }
    if (Date.now() - parsed.written_at_ms > TTL_MS) {
      return null
    }
    if (
      !parsed.studio ||
      typeof parsed.studio !== 'object' ||
      Array.isArray(parsed.studio)
    ) {
      return null
    }
    if (
      !parsed.formData ||
      typeof parsed.formData !== 'object' ||
      Array.isArray(parsed.formData)
    ) {
      return null
    }
    return {
      studio: parsed.studio as Record<string, unknown>,
      formData: parsed.formData as Record<string, unknown>,
      written_at_ms: parsed.written_at_ms,
      source: 'landing',
    }
  } catch {
    return null
  }
}

/**
 * Peek without consuming — used by the auth-side mount logic to decide
 * whether to render a "we're hydrating your inputs" splash before the
 * wizard renders the prefilled state.  Returns ``true`` only when a
 * non-stale snapshot is queued.
 *
 * Implementation note: we don't use the parsed ``LandingStudioHandoff``
 * here because the consumer doesn't need it yet.  Keeping this purely
 * boolean avoids a second JSON-parse roundtrip on the same object the
 * subsequent ``consume`` call will parse for real.
 */
export function hasLandingStudioHandoff(): boolean {
  if (!isBrowser()) return false
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<LandingStudioHandoff> | null
    if (!parsed || typeof parsed.written_at_ms !== 'number') return false
    return Date.now() - parsed.written_at_ms <= TTL_MS
  } catch {
    return false
  }
}
