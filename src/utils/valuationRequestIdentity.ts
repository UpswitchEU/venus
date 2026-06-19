import { firstNonEmptyString, parsePostalCityFromAddress } from './buildValuationRequest.helpers'

export interface ValuationRequestIdentityInput {
  countryCode: string
  formDataRecord: Record<string, unknown>
  businessContext: unknown
}

export interface ValuationRequestIdentityFields {
  registrationNumber: string | null
  kboNumber: string | null | undefined
  kvkNumber: string | null | undefined
  vatNumber: string | null
  legalForm: string | null
  postalCode: string | null
  city: string | null
}

export function resolveValuationRequestIdentity({
  countryCode,
  formDataRecord: fd,
  businessContext,
}: ValuationRequestIdentityInput): ValuationRequestIdentityFields {
  const businessContextRecord =
    businessContext && typeof businessContext === 'object'
      ? (businessContext as Record<string, unknown>)
      : {}
  const contextExplicitRegistration = firstNonEmptyString(
    businessContextRecord.registration_number,
    businessContextRecord.registrationNumber,
    businessContextRecord.company_registration_number,
    businessContextRecord.companyRegistrationNumber,
    businessContextRecord.company_number,
    businessContextRecord.companyNumber,
    businessContextRecord.enterprise_number,
    businessContextRecord.enterpriseNumber
  )
  const contextCompanyId = firstNonEmptyString(
    businessContextRecord.company_id,
    businessContextRecord.companyId
  )
  const contextExplicitKboAlias = firstNonEmptyString(
    businessContextRecord.kbo_number,
    businessContextRecord.kboNumber,
    businessContextRecord.kbo_registration_number,
    businessContextRecord.kboRegistrationNumber,
    businessContextRecord.kbo_registration,
    businessContextRecord.kboRegistration
  )
  const contextExplicitKvkAlias = firstNonEmptyString(
    businessContextRecord.kvk_number,
    businessContextRecord.kvkNumber,
    businessContextRecord.kvk_registration_number,
    businessContextRecord.kvkRegistrationNumber,
    businessContextRecord.kvk_registration,
    businessContextRecord.kvkRegistration
  )
  const topLevelKboAlias = firstNonEmptyString(
    fd.kbo_number,
    fd.kboNumber,
    fd.kbo_registration_number,
    fd.kboRegistrationNumber,
    fd.kbo_registration,
    fd.kboRegistration
  )
  const topLevelKvkAlias = firstNonEmptyString(
    fd.kvk_number,
    fd.kvkNumber,
    fd.kvk_registration_number,
    fd.kvkRegistrationNumber,
    fd.kvk_registration,
    fd.kvkRegistration
  )
  const topLevelRegistrationAlias = firstNonEmptyString(
    fd.registration_number,
    fd.registrationNumber,
    fd.company_registration_number,
    fd.companyRegistrationNumber,
    fd.company_number,
    fd.companyNumber,
    fd.enterprise_number,
    fd.enterpriseNumber
  )
  const contextGenericRegistration = firstNonEmptyString(
    contextExplicitRegistration,
    contextCompanyId
  )
  const contextKboAlias = firstNonEmptyString(
    contextExplicitKboAlias,
    countryCode === 'BE' ? contextExplicitRegistration : null,
    countryCode === 'BE' ? contextCompanyId : null
  )
  const contextKvkAlias = firstNonEmptyString(
    contextExplicitKvkAlias,
    // BasicInformationSection stores the selected registry number under the
    // legacy KBO alias even for NL/KVK searches.
    countryCode === 'NL' ? contextExplicitKboAlias : null,
    countryCode === 'NL' ? contextExplicitRegistration : null,
    countryCode === 'NL' ? contextCompanyId : null
  )
  const kboNumber =
    countryCode === 'BE'
      ? firstNonEmptyString(contextKboAlias, topLevelKboAlias)
      : countryCode === 'NL'
        ? undefined
        : topLevelKboAlias
  const kvkNumber =
    countryCode === 'NL'
      ? firstNonEmptyString(contextKvkAlias, topLevelKvkAlias, topLevelKboAlias)
      : countryCode === 'BE'
        ? undefined
        : topLevelKvkAlias
  const contextIdentityApplied =
    countryCode === 'BE'
      ? !!contextKboAlias
      : countryCode === 'NL'
        ? !!contextKvkAlias
        : !!contextGenericRegistration
  const contextRegistrationNumber =
    countryCode === 'NL'
      ? firstNonEmptyString(
          contextKvkAlias,
          contextExplicitKboAlias,
          contextExplicitRegistration,
          contextCompanyId
        )
      : countryCode === 'BE'
        ? firstNonEmptyString(contextKboAlias, contextExplicitRegistration, contextCompanyId)
        : contextGenericRegistration
  const registrationNumber =
    firstNonEmptyString(
      contextRegistrationNumber,
      contextIdentityApplied ? null : topLevelRegistrationAlias,
      countryCode === 'NL' ? kvkNumber : kboNumber,
      kboNumber,
      kvkNumber,
      contextIdentityApplied ? null : contextCompanyId
    ) ?? (contextIdentityApplied ? null : contextGenericRegistration)
  const contextVatNumber = firstNonEmptyString(
    businessContextRecord.vat_number,
    businessContextRecord.vatNumber,
    businessContextRecord.vat,
    businessContextRecord.btw_number,
    businessContextRecord.btwNumber
  )
  const vatNumber = contextIdentityApplied
    ? firstNonEmptyString(contextVatNumber, fd.vat_number, fd.vatNumber)
    : firstNonEmptyString(fd.vat_number, fd.vatNumber, contextVatNumber)
  const contextLegalForm = firstNonEmptyString(
    businessContextRecord.legal_form,
    businessContextRecord.legalForm
  )
  const legalForm = contextIdentityApplied
    ? firstNonEmptyString(contextLegalForm, fd.legal_form, fd.legalForm)
    : firstNonEmptyString(fd.legal_form, fd.legalForm, contextLegalForm)
  const parsedAddressLocation = parsePostalCityFromAddress(
    firstNonEmptyString(
      businessContextRecord.company_address,
      businessContextRecord.companyAddress,
      businessContextRecord.registered_address,
      businessContextRecord.registeredAddress,
      businessContextRecord.address,
      businessContextRecord.company_location,
      businessContextRecord.companyLocation,
      businessContextRecord.location
    )
  )
  const contextPostalCode = firstNonEmptyString(
    businessContextRecord.postal_code,
    businessContextRecord.postalCode,
    businessContextRecord.company_postal_code,
    businessContextRecord.companyPostalCode,
    parsedAddressLocation.postalCode
  )
  const postalCode = contextIdentityApplied
    ? firstNonEmptyString(contextPostalCode, fd.postal_code, fd.postalCode)
    : firstNonEmptyString(fd.postal_code, fd.postalCode, contextPostalCode)
  const contextCity = firstNonEmptyString(
    businessContextRecord.city,
    businessContextRecord.company_city,
    businessContextRecord.companyCity,
    businessContextRecord.municipality,
    parsedAddressLocation.city
  )
  const city = contextIdentityApplied
    ? firstNonEmptyString(contextCity, fd.city, fd.companyCity)
    : firstNonEmptyString(fd.city, fd.companyCity, contextCity)

  return {
    registrationNumber,
    kboNumber,
    kvkNumber,
    vatNumber,
    legalForm,
    postalCode,
    city,
  }
}
