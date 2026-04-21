/**
 * Identity-fingerprinted sessionStorage helpers for the "Nieuwe schatting"
 * (New valuation) prefill payload.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 *
 * `ManualLayout.handleConfirmNewValuation` snapshots the current form into
 * sessionStorage so that, when the user clicks **Nieuwe schatting**, the next
 * `/reports/new` load can restore their financial inputs without making them
 * re-type everything. The original implementation stored the raw `formData`
 * blob, including identity fields (`company_name`, `kbo_number`, `city`,
 * `nace_code`, …).
 *
 * This created a cross-company poisoning vector twin to the server-side
 * "orphaned-seller bug" we fixed in
 * `apps/titan-api/src/valuations/sessions/bootstrap/bootstrap.service.ts`:
 *
 *   1. Owner valuates company **A** (e.g. BAKKERIJ VAN DAMME).
 *   2. Storage now holds `{ company_name: "BAKKERIJ VAN DAMME", … }`.
 *   3. Owner abandons that flow (closes tab, goes to dashboard, …).
 *   4. From the Mercury dashboard the owner clicks **Vul uw cijfers in** for
 *      a *different* company **B** (e.g. RESTAURANT AB).
 *   5. Bootstrap correctly hydrates the form with RESTAURANT AB.
 *   6. `useBootstrapSync` then reads the storage and *overwrites* identity
 *      fields with BAKKERIJ — reproducing the original bug entirely on the
 *      client, regardless of any backend fix.
 *
 * ─── How this helper makes the flow robust ──────────────────────────────────
 *
 *   • On write, we attach an `_identityFingerprint` derived from KBO/VAT/
 *     company name. KBO and VAT are exact-match keys; company name is a
 *     normalized, case-insensitive, alphanumeric-only fallback for sellers
 *     who never resolved a registry record (preview-only flow).
 *
 *   • On read, the caller passes the *bootstrap target* identity. If the
 *     fingerprints do not match, we treat the storage as belonging to a
 *     different company and discard it entirely (the user is starting a
 *     valuation for a different business — restoring stale financials would
 *     be just as misleading as restoring stale identity).
 *
 *   • If a stored payload has no fingerprint at all (legacy entries written
 *     before this helper landed), we strip identity fields defensively before
 *     restoring, so a pre-existing storage cannot poison new bootstraps even
 *     once. Subsequent writes will carry the new fingerprint.
 *
 * The helper deliberately lives outside React state so it can be unit-tested
 * with plain Vitest fakes (no jsdom render cycle required) and reused by both
 * `ManualLayout.tsx` (write-side) and `useBootstrapSync.ts` (read-side)
 * without circular imports.
 *
 * @module utils/newValuationPrefillStorage
 */

const STORAGE_KEY = 'venus_new_valuation_prefill'

/** Soft cap mirroring the original ManualLayout guard against huge payloads. */
const MAX_PAYLOAD_BYTES = 500_000

/**
 * Identity fields stripped from any restored payload as a defensive net.
 *
 * Keep in sync with `buildPrefillSessionFields` /
 * `buildPrefillFormFields` in `apps/venus/src/hooks/useBootstrapSync.ts`
 * and with `ValuationRequest` in `apps/venus/src/types/valuation.ts`.
 *
 * Anything that uniquely identifies *which* business is being valued belongs
 * here. Financial inputs (revenue, EBITDA, headcount, etc.) intentionally do
 * NOT belong here — those are the user's typed work that "Nieuwe schatting"
 * exists to preserve.
 */
const IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  'company_name',
  'country_code',
  'industry',
  'business_model',
  'business_type',
  'business_type_id',
  'business_context',
  'founding_year',
  'city',
  'kbo_number',
  'vat_number',
  'postal_code',
  'legal_form',
  'nace_code',
  'nace_description',
  'activity_code',
  'activity_label',
  'taxonomy',
  'canonical_nace_code',
])

export interface IdentityFingerprint {
  /** KBO / KVK enterprise number, normalized (digits only). */
  kboNumber?: string
  /** VAT number, normalized (uppercase, alphanumeric only). */
  vatNumber?: string
  /** Company name fallback, normalized (uppercase, alphanumeric only). */
  companyName?: string
}

interface StoredPrefillEnvelope {
  _fromNewValuation: true
  _normCount?: number
  /** Added in this helper; absent for pre-helper legacy entries. */
  _identityFingerprint?: IdentityFingerprint
  [key: string]: unknown
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function normalizeAlnum(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return compact || undefined
}

function normalizeDigits(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const compact = String(value).replace(/\D/g, '')
  return compact || undefined
}

/**
 * Extract a normalized identity fingerprint from any object that might carry
 * KBO/VAT/company-name fields (form data, bootstrap prefill, partial DTOs).
 *
 * Returns `undefined` when no usable identifier was present so callers can
 * distinguish "no identity yet" from "identity = empty string".
 */
export function buildIdentityFingerprint(
  source:
    | Record<string, unknown>
    | { kboNumber?: string | null; vatNumber?: string | null; companyName?: string | null }
    | null
    | undefined
): IdentityFingerprint | undefined {
  if (!source || typeof source !== 'object') return undefined
  const record = source as Record<string, unknown>

  const kboNumber =
    normalizeDigits(record.kbo_number) ??
    normalizeDigits(record.kboNumber) ??
    normalizeDigits((record.companyInfo as Record<string, unknown> | undefined)?.kboNumber)

  const vatNumber =
    normalizeAlnum(record.vat_number) ??
    normalizeAlnum(record.vatNumber) ??
    normalizeAlnum((record.companyInfo as Record<string, unknown> | undefined)?.vatNumber)

  const companyName =
    normalizeAlnum(record.company_name) ??
    normalizeAlnum(record.companyName) ??
    normalizeAlnum((record.companyInfo as Record<string, unknown> | undefined)?.companyName)

  if (!kboNumber && !vatNumber && !companyName) return undefined
  return {
    ...(kboNumber ? { kboNumber } : {}),
    ...(vatNumber ? { vatNumber } : {}),
    ...(companyName ? { companyName } : {}),
  }
}

/**
 * Decide whether a stored payload's fingerprint matches the bootstrap target.
 *
 * Precedence (any one match is sufficient — registries are the strongest
 * signal, name is the weak fallback):
 *   1. KBO/KVK number — exact match
 *   2. VAT number    — exact match
 *   3. Company name  — normalized exact match
 *
 * Any explicit conflict (e.g. both fingerprints have a KBO number and they
 * differ) is treated as a hard mismatch even if other fields happen to align.
 */
export function fingerprintsMatch(
  stored: IdentityFingerprint | undefined,
  target: IdentityFingerprint | undefined
): boolean {
  if (!stored || !target) return false

  if (stored.kboNumber && target.kboNumber) {
    return stored.kboNumber === target.kboNumber
  }
  if (stored.vatNumber && target.vatNumber) {
    return stored.vatNumber === target.vatNumber
  }
  if (stored.companyName && target.companyName) {
    return stored.companyName === target.companyName
  }
  return false
}

export interface WriteOptions {
  /** Number of accepted normalizations (preserved for telemetry). */
  normCount?: number
}

/**
 * Persist a "Nieuwe schatting" prefill snapshot, automatically attaching an
 * identity fingerprint derived from the snapshot itself. Returns `true` when
 * the write succeeded; `false` when sessionStorage is unavailable, the
 * payload exceeded `MAX_PAYLOAD_BYTES`, or no usable identity fingerprint
 * could be derived (a fingerprint-less write would defeat the whole guard).
 */
export function writeNewValuationPrefill(
  formData: Record<string, unknown>,
  options: WriteOptions = {}
): boolean {
  const storage = safeSessionStorage()
  if (!storage) return false

  const fingerprint = buildIdentityFingerprint(formData)
  if (!fingerprint) {
    // Refuse to write a fingerprint-less payload — restoring it could only
    // ever happen via the legacy defensive path, which strips identity
    // fields anyway, so the write would be net-useless and just take up
    // sessionStorage budget.
    return false
  }

  const payload: StoredPrefillEnvelope = {
    ...formData,
    _fromNewValuation: true,
    _identityFingerprint: fingerprint,
    ...(typeof options.normCount === 'number' ? { _normCount: options.normCount } : {}),
  }

  // Strip non-serializable keys defensively (mirrors original logic).
  delete (payload as Record<string, unknown>).html_report
  delete (payload as Record<string, unknown>).valuation_result

  let json: string
  try {
    json = JSON.stringify(payload, (_, value) =>
      typeof value === 'function' || typeof value === 'symbol' ? undefined : value
    )
  } catch {
    return false
  }
  if (!json || json.length >= MAX_PAYLOAD_BYTES) return false

  try {
    storage.setItem(STORAGE_KEY, json)
    return true
  } catch {
    return false
  }
}

export interface ReadResult {
  /** Sanitized payload safe to merge into the form store. */
  data: Record<string, unknown>
  /** True when an identity fingerprint comparison was made AND it matched. */
  matched: boolean
  /** True when the stored payload predated this helper (no fingerprint). */
  legacy: boolean
  /** Number of accepted normalizations preserved on the previous attempt. */
  normCount?: number
}

/**
 * Read and consume the stored prefill, returning a sanitized payload to merge
 * into the form. The storage entry is removed unconditionally — both on
 * success (the data has been handed back) and on mismatch/error (so a
 * poisoned entry cannot keep firing on subsequent loads).
 *
 * Behaviour:
 *   • No storage / parse error          → returns `null`, storage cleared.
 *   • Fingerprint absent (legacy entry) → returns sanitized payload with all
 *     identity fields stripped (`legacy: true`).
 *   • Fingerprint present and matches   → returns sanitized payload with
 *     identity fields stripped as a belt-and-braces measure (`matched: true`).
 *   • Fingerprint present and mismatches → returns `null` (the payload
 *     belongs to a different business and must not bleed across companies).
 */
export function readNewValuationPrefill(
  targetIdentity: IdentityFingerprint | undefined
): ReadResult | null {
  const storage = safeSessionStorage()
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  // Whatever happens below, do not let a malformed/poisoned entry persist.
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const envelope = parsed as StoredPrefillEnvelope
  if (envelope._fromNewValuation !== true) return null

  const stored = envelope._identityFingerprint
  const legacy = !stored

  if (stored && !fingerprintsMatch(stored, targetIdentity)) {
    // Cross-company storage — drop everything. Even non-identity financial
    // fields are misleading when applied to a different company's valuation.
    return null
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(envelope)) {
    if (key.startsWith('_')) continue
    if (IDENTITY_FIELDS.has(key)) continue
    if (value === undefined || value === null) continue
    if (typeof value === 'function' || typeof value === 'symbol') continue
    sanitized[key] = value
  }

  return {
    data: sanitized,
    matched: !legacy,
    legacy,
    ...(typeof envelope._normCount === 'number' ? { normCount: envelope._normCount } : {}),
  }
}

/**
 * Forcefully drop the prefill storage entry. Safe to call on logout / session
 * reset / hard navigation.
 */
export function clearNewValuationPrefill(): void {
  const storage = safeSessionStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Exported for test-only assertions; do not import from production code. */
export const __test = {
  STORAGE_KEY,
  IDENTITY_FIELDS,
  MAX_PAYLOAD_BYTES,
}
