import type { ManualValuationFormData } from '@/types/valuation'

// Recovery contains transient edits, never the authority for company identity.
// Both panel aliases and API fields must be removed, including legacy payloads.
const IDENTITY_KEYS = [
  'companyName',
  'kboNumber',
  'legalForm',
  'address',
  'naceCode',
  'naceDescription',
  'canonicalNaceCode',
  'businessType',
  'businessTypeCode',
  'businessModel',
  'industry',
  'country',
  'country_code',
  'yearFounded',
  'businessStructure',
  'company_name',
  'registration_number',
  'kbo_number',
  'kvk_number',
  'vat_number',
  'city',
  'postal_code',
  'legal_form',
  'nace_code',
  'nace_description',
  'activity_code',
  'activity_label',
  'canonical_nace_code',
  'taxonomy',
  'business_type',
  'business_type_id',
  'business_model',
  'founding_year',
  'company_id',
  'company_graph_context',
  'business_description',
  'business_highlights',
  'business_context',
] as const
const identityKeys = new Set<string>(IDENTITY_KEYS)
const forbiddenKey =
  /(?:token|password|secret|credential|cookie|html|valuation.?result|company.?info|company.?name|session.?data|partial.?data|__proto__|constructor|prototype)/i

/** Strip identifying/report/auth payload on write AND read (including old tabs). */
export function sanitizeAccountingReconnectDraft(
  draft: ManualValuationFormData
): ManualValuationFormData {
  const clean = JSON.parse(
    JSON.stringify(draft, (key, value: unknown) =>
      identityKeys.has(key) || forbiddenKey.test(key) ? undefined : value
    )
  ) as ManualValuationFormData
  return {
    ...clean,
    companyName: '',
    businessType: '',
    industry: '',
    country: '',
    yearFounded: '',
    businessStructure: '',
  }
}

/** Only the currently bootstrapped client supplies identity when restoring edits. */
export function restoreAccountingReconnectDraft(
  draft: ManualValuationFormData,
  current: Partial<ManualValuationFormData>
): ManualValuationFormData {
  const restored = { ...current, ...sanitizeAccountingReconnectDraft(draft) }
  for (const key of IDENTITY_KEYS) {
    delete (restored as Record<string, unknown>)[key]
    if (Object.hasOwn(current, key)) {
      ;(restored as Record<string, unknown>)[key] = current[key as keyof typeof current]
    }
  }
  return {
    ...restored,
    companyName: current.companyName ?? current.company_name ?? '',
    businessType: current.businessType ?? current.business_type_id ?? '',
    industry: current.industry ?? '',
    country: current.country ?? current.country_code ?? '',
    yearFounded:
      current.yearFounded ?? (current.founding_year == null ? '' : String(current.founding_year)),
    businessStructure: current.businessStructure ?? current.business_type ?? '',
    kboNumber: current.kboNumber ?? current.kbo_number,
    legalForm: current.legalForm ?? current.legal_form,
    naceCode: current.naceCode ?? current.nace_code,
    canonicalNaceCode: current.canonicalNaceCode ?? current.canonical_nace_code,
  }
}

export function isAccountingReconnectDraft(value: unknown): value is ManualValuationFormData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const draft = value as Record<string, unknown>
  return (
    [
      'companyName',
      'businessType',
      'industry',
      'country',
      'yearFounded',
      'businessStructure',
    ].every((key) => typeof draft[key] === 'string') &&
    typeof draft.ownerManagers === 'number' &&
    Number.isFinite(draft.ownerManagers) &&
    (draft.fteEmployees == null ||
      (typeof draft.fteEmployees === 'number' && Number.isFinite(draft.fteEmployees))) &&
    Array.isArray(draft.yearlyFinancials) &&
    draft.yearlyFinancials.length <= 100 &&
    draft.yearlyFinancials.every(
      (row) =>
        row &&
        typeof row === 'object' &&
        !Array.isArray(row) &&
        typeof row.year === 'string' &&
        /^\d{4}$/.test(row.year) &&
        ['revenue', 'ebitda'].every(
          (key) => row[key] == null || (typeof row[key] === 'number' && Number.isFinite(row[key]))
        )
    )
  )
}
