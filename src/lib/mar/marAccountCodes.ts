/**
 * Belgian MAR (Minimum Algemeen Rekeningenstelsel) GL code helpers.
 *
 * Mirrors Titan `mar-account-mapping.ts` and Hermes `mar_account_codes.py` so
 * Venus normalization / SDE prefill does not drift from backend personnel-bucket
 * guards (e.g. Yuki mislabelling 620000 as director pay).
 */

/** Leading digit run from provider GL codes (NBSP, dots, suffixes stripped). */
export function normalizedMarAccountCodePrefix(accountCode: string | null | undefined): string {
  if (accountCode == null) return ''
  let s = String(accountCode)
    .replace(/\ufeff/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
  s = s.replace(/\./g, '')
  s = s.replace(/\s+/g, '')
  if (!s) return ''
  const match = s.match(/^\d+/)
  return match?.[0] ?? s
}

/**
 * Aggregate personnel / social-charges bucket (e.g. 620000).
 * Not defensible as an owner-comp add-back even when mislabelled in Yuki.
 */
export function isMarPersonnelSocialChargesBucket(accountCode: string | null | undefined): boolean {
  return normalizedMarAccountCodePrefix(accountCode).startsWith('62000')
}

/** Owner / director compensation codes (excludes 62000x personnel massa). */
export function isMarOwnerDirectorCompensationAccount(
  accountCode: string | null | undefined
): boolean {
  const code = normalizedMarAccountCodePrefix(accountCode)
  if (!code) return false
  return (
    code.startsWith('618') ||
    code.startsWith('6240') ||
    code.startsWith('695') ||
    (code.startsWith('6200') && !code.startsWith('62000'))
  )
}

/** Trial-balance director-comp codes Venus treats as imported-ledger salary signal. */
export function isImportedLedgerDirectorCompCode(accountCode: string | null | undefined): boolean {
  const normalized = normalizedMarAccountCodePrefix(accountCode)
  if (!normalized || isMarPersonnelSocialChargesBucket(normalized)) return false
  return normalized === '620' || isMarOwnerDirectorCompensationAccount(normalized)
}
