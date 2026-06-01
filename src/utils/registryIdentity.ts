function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = String(value).trim()
  return cleaned ? cleaned : null
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = cleanString(value)
    if (cleaned) return cleaned
  }
  return null
}

export function normalizeRegistryIdentity(value: unknown): string | null {
  const cleaned = cleanString(value)
  if (!cleaned) return null
  const normalized = cleaned.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return normalized || null
}

export function getRegistryIdentityFromRecord(value: unknown): string | null {
  const record = asRecord(value)
  const businessContext = asRecord(record.business_context ?? record.businessContext)
  const businessInfo = asRecord(record._businessInfo ?? record.businessInfo ?? record.business_info)
  const companyInfo = asRecord(record.companyInfo ?? record.company_info)
  const kboData = asRecord(record.kboData ?? record.kbo_data)

  return normalizeRegistryIdentity(
    firstString(
      businessContext.kbo_number,
      businessContext.kboNumber,
      businessContext.kbo_registration_number,
      businessContext.kboRegistrationNumber,
      businessContext.kbo_registration,
      businessContext.kboRegistration,
      businessContext.kvk_number,
      businessContext.kvkNumber,
      businessContext.kvk_registration_number,
      businessContext.kvkRegistrationNumber,
      businessContext.kvk_registration,
      businessContext.kvkRegistration,
      businessContext.registration_number,
      businessContext.registrationNumber,
      businessContext.company_registration_number,
      businessContext.companyRegistrationNumber,
      businessContext.company_number,
      businessContext.companyNumber,
      businessContext.enterprise_number,
      businessContext.enterpriseNumber,
      businessContext.company_id,
      businessContext.companyId,
      businessInfo.kbo_number,
      businessInfo.kboNumber,
      businessInfo.kbo_registration_number,
      businessInfo.kboRegistrationNumber,
      businessInfo.kbo_registration,
      businessInfo.kboRegistration,
      businessInfo.kvk_number,
      businessInfo.kvkNumber,
      businessInfo.kvk_registration_number,
      businessInfo.kvkRegistrationNumber,
      businessInfo.kvk_registration,
      businessInfo.kvkRegistration,
      businessInfo.registration_number,
      businessInfo.registrationNumber,
      businessInfo.company_registration_number,
      businessInfo.companyRegistrationNumber,
      businessInfo.company_number,
      businessInfo.companyNumber,
      businessInfo.enterprise_number,
      businessInfo.enterpriseNumber,
      businessInfo.company_id,
      businessInfo.companyId,
      record.kbo_number,
      record.kboNumber,
      record.kbo_registration_number,
      record.kboRegistrationNumber,
      record.kbo_registration,
      record.kboRegistration,
      record.kvk_number,
      record.kvkNumber,
      record.kvk_registration_number,
      record.kvkRegistrationNumber,
      record.kvk_registration,
      record.kvkRegistration,
      record.registration_number,
      record.registrationNumber,
      record.company_registration_number,
      record.companyRegistrationNumber,
      record.company_number,
      record.companyNumber,
      record.enterprise_number,
      record.enterpriseNumber,
      record.company_id,
      record.companyId,
      companyInfo.kboNumber,
      companyInfo.kbo_number,
      companyInfo.kvkNumber,
      companyInfo.kvk_number,
      companyInfo.registrationNumber,
      companyInfo.registration_number,
      companyInfo.companyNumber,
      companyInfo.company_number,
      companyInfo.enterpriseNumber,
      companyInfo.enterprise_number,
      companyInfo.companyId,
      companyInfo.company_id,
      kboData.kboNumber,
      kboData.kbo_number,
      kboData.kvkNumber,
      kboData.kvk_number,
      kboData.registrationNumber,
      kboData.registration_number,
      kboData.companyNumber,
      kboData.company_number,
      kboData.enterpriseNumber,
      kboData.enterprise_number,
      kboData.companyId,
      kboData.company_id
    )
  )
}

export function hasConflictingRegistryIdentity(left: unknown, right: unknown): boolean {
  const leftIdentity = getRegistryIdentityFromRecord(left)
  const rightIdentity = getRegistryIdentityFromRecord(right)
  return !!leftIdentity && !!rightIdentity && leftIdentity !== rightIdentity
}
