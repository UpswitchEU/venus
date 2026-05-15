import { type Dispatch, type SetStateAction, useEffect } from 'react'
import {
  isLegalFormBusinessTypeValue,
  looksLikeNaceCode,
} from '../../../services/naceBusinessTypeService'
import type { ValuationFormData } from '../../../types/valuation'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { mergeSessionSurfaceForOptionalPrefill } from '../../../utils/mergeOptionalSessionPrefillFields'

interface ManualCollectedDataIdentity {
  address?: string
  businessModel?: string
  businessStructure?: string
  businessType?: string
  companyName?: string
  country?: string
  industry?: string
  kboNumber?: string
  legalForm?: string
  naceCode?: string
  naceDescription?: string
  yearFounded?: string
}

export interface ManualCollectedDataFormSurface {
  activityCode?: string | null
  address?: string
  businessModel?: string | null
  businessTypeId?: string | null
  city?: string | null
  companyName?: string | null
  country?: string | null
  industry?: string | null
  kboNumber?: string | null
  legalForm?: string | null
  naceCode?: string | null
  naceDescription?: string | null
  postalCode?: string | null
  yearFounded?: number | null
}

export interface UseManualCollectedDataSyncParams<
  TCollectedData extends ManualCollectedDataIdentity,
> {
  formSurface: ManualCollectedDataFormSurface
  restorationComplete: boolean
  sessionData: unknown
  setCollectedData: Dispatch<SetStateAction<TCollectedData>>
  updateFormData: (patch: Partial<ValuationFormData>) => void
}

export function useManualCollectedDataSync<TCollectedData extends ManualCollectedDataIdentity>({
  formSurface,
  restorationComplete,
  sessionData,
  setCollectedData,
  updateFormData,
}: UseManualCollectedDataSyncParams<TCollectedData>) {
  const {
    activityCode,
    address,
    businessModel,
    businessTypeId,
    city,
    companyName,
    country,
    industry,
    kboNumber,
    legalForm,
    naceCode,
    naceDescription,
    postalCode,
    yearFounded,
  } = formSurface

  useEffect(() => {
    setCollectedData((prev) => {
      const next = { ...prev }
      if (companyName && companyName !== prev.companyName) next.companyName = companyName
      if ((businessTypeId ?? '') !== prev.businessType) next.businessType = businessTypeId ?? ''
      if (industry && industry !== prev.industry) next.industry = industry
      const nextBusinessModel = businessModel || 'services'
      if (nextBusinessModel !== (prev.businessModel || '')) {
        next.businessModel = nextBusinessModel
      }
      if (country && country !== prev.country) next.country = country
      const yearStr = yearFounded ? String(yearFounded) : ''
      if (yearStr && yearStr !== prev.yearFounded) next.yearFounded = yearStr
      if (kboNumber && kboNumber !== prev.kboNumber) next.kboNumber = kboNumber
      if (legalForm && legalForm !== prev.legalForm) next.legalForm = legalForm
      const derivedBusinessStructure = mapLegalFormToBusinessStructure(legalForm || '')
      next.businessStructure = derivedBusinessStructure || prev.businessStructure || undefined
      if (address && address !== prev.address) next.address = address
      const displayNace = activityCode || naceCode
      if (displayNace && displayNace !== prev.naceCode) next.naceCode = displayNace
      if (naceDescription && naceDescription !== prev.naceDescription) {
        next.naceDescription = naceDescription
      }
      return next
    })
  }, [
    activityCode,
    address,
    businessModel,
    businessTypeId,
    companyName,
    country,
    industry,
    kboNumber,
    legalForm,
    naceCode,
    naceDescription,
    setCollectedData,
    yearFounded,
  ])

  useEffect(() => {
    if (!restorationComplete) return

    const merged = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>
    const sessionSurface = readManualSessionIdentitySurface(merged)
    const shouldHydrate = shouldHydrateManualSessionIdentity({
      form: {
        businessTypeId,
        companyName,
        kboNumber,
        legalForm,
        naceCode,
      },
      session: sessionSurface,
    })
    if (!shouldHydrate) return

    const shouldUseSessionBusinessType = Boolean(
      sessionSurface.businessType &&
        !looksLikeNaceCode(sessionSurface.businessType) &&
        !isLegalFormBusinessTypeValue(sessionSurface.businessType)
    )

    const formUpdates = buildManualSessionIdentityFormUpdates({
      form: {
        activityCode,
        businessTypeId,
        city,
        companyName,
        country,
        industry,
        kboNumber,
        legalForm,
        naceCode,
        naceDescription,
        postalCode,
        yearFounded,
      },
      session: sessionSurface,
      shouldUseSessionBusinessType,
    })
    if (Object.keys(formUpdates).length > 0) {
      updateFormData(formUpdates)
    }

    setCollectedData((prev) =>
      mergeManualSessionIdentityIntoCollectedData(
        prev,
        sessionSurface,
        shouldUseSessionBusinessType
      )
    )
  }, [
    activityCode,
    businessTypeId,
    city,
    companyName,
    country,
    industry,
    kboNumber,
    legalForm,
    naceCode,
    naceDescription,
    postalCode,
    restorationComplete,
    sessionData,
    setCollectedData,
    updateFormData,
    yearFounded,
  ])
}

interface ManualSessionIdentitySurface {
  address?: string
  businessType?: string
  canonicalNace?: string
  city?: string
  company?: string
  country?: string
  industry?: string
  kbo?: string
  legal?: string
  nace?: string
  naceDescription?: string
  postalCode?: string
  year?: unknown
}

function readManualSessionIdentitySurface(
  merged: Record<string, unknown>
): ManualSessionIdentitySurface {
  const company =
    (merged.company_name as string)?.trim() || (merged.companyName as string)?.trim() || undefined
  const canonicalNace = (
    (merged.canonical_nace_code || merged.nace_code || merged.naceCode) as string
  )?.trim()
  const activity = (merged.activity_code || merged.activityCode) as string | undefined
  const nace = activity?.trim() || canonicalNace || undefined
  const postalCode = (merged.postal_code || merged.postalCode) as string | undefined
  const city = merged.city as string | undefined

  return {
    address: [postalCode, city].filter(Boolean).join(' '),
    businessType: (merged.business_type_id || merged.businessTypeId || merged.business_type) as
      | string
      | undefined,
    canonicalNace,
    city,
    company,
    country: (merged.country_code || merged.countryCode || merged.country) as string | undefined,
    industry: merged.industry as string | undefined,
    kbo: (merged.kbo_number || merged.kboNumber) as string | undefined,
    legal: (merged.legal_form || merged.legalForm) as string | undefined,
    nace,
    naceDescription: (merged.activity_label || merged.nace_description || merged.naceDescription) as
      | string
      | undefined,
    postalCode,
    year: merged.founding_year ?? merged.founded_year,
  }
}

function shouldHydrateManualSessionIdentity({
  form,
  session,
}: {
  form: Pick<
    ManualCollectedDataFormSurface,
    'businessTypeId' | 'companyName' | 'kboNumber' | 'legalForm' | 'naceCode'
  >
  session: ManualSessionIdentitySurface
}) {
  const hasSessionPrefill = Boolean(session.company || session.kbo || session.legal)
  const formStoreEmpty =
    !form.companyName?.trim() && !form.kboNumber?.trim() && !form.legalForm?.trim()
  const sessionHasNace = Boolean(session.nace || session.canonicalNace)
  const sessionHasBusinessType = Boolean(session.businessType)
  const formMissingNace = sessionHasNace && !form.naceCode?.trim()
  const formMissingBusinessType = sessionHasBusinessType && !form.businessTypeId?.trim()

  return hasSessionPrefill && (formStoreEmpty || formMissingNace || formMissingBusinessType)
}

function buildManualSessionIdentityFormUpdates({
  form,
  session,
  shouldUseSessionBusinessType,
}: {
  form: ManualCollectedDataFormSurface
  session: ManualSessionIdentitySurface
  shouldUseSessionBusinessType?: boolean
}): Partial<ValuationFormData> {
  const formUpdates: Partial<ValuationFormData> = {}

  if (session.company && !form.companyName?.trim()) formUpdates.company_name = session.company
  if (session.kbo && !form.kboNumber?.trim()) formUpdates.kbo_number = session.kbo
  if (session.legal && !form.legalForm?.trim()) formUpdates.legal_form = session.legal
  if (session.postalCode && !form.postalCode?.trim()) formUpdates.postal_code = session.postalCode
  if (session.city && !form.city?.trim()) formUpdates.city = session.city
  if (session.canonicalNace && !form.naceCode?.trim()) formUpdates.nace_code = session.canonicalNace
  if (
    session.nace?.trim() &&
    session.canonicalNace &&
    session.nace.trim() !== session.canonicalNace &&
    !form.activityCode?.trim()
  ) {
    formUpdates.activity_code = session.nace.trim()
  }
  if (session.naceDescription && !form.naceDescription?.trim()) {
    formUpdates.nace_description = session.naceDescription
  }
  if (session.country && !form.country?.trim()) formUpdates.country_code = session.country
  if (session.year != null && form.yearFounded == null) {
    formUpdates.founding_year = Number(session.year)
  }
  if (shouldUseSessionBusinessType && !form.businessTypeId?.trim()) {
    formUpdates.business_type_id = session.businessType
  }
  if (session.industry && !form.industry?.trim()) formUpdates.industry = session.industry

  return formUpdates
}

function mergeManualSessionIdentityIntoCollectedData<
  TCollectedData extends ManualCollectedDataIdentity,
>(
  previous: TCollectedData,
  session: ManualSessionIdentitySurface,
  shouldUseSessionBusinessType?: boolean
): TCollectedData {
  const next = { ...previous }
  if (session.company && !previous.companyName) next.companyName = session.company
  if (session.kbo && !previous.kboNumber) next.kboNumber = session.kbo
  if (session.legal && !previous.legalForm) {
    next.legalForm = session.legal
    const mapped = mapLegalFormToBusinessStructure(session.legal)
    if (mapped && !previous.businessStructure) next.businessStructure = mapped
  }
  if (session.address && !previous.address) next.address = session.address
  if (session.nace && !previous.naceCode) next.naceCode = session.nace
  if (session.naceDescription && !previous.naceDescription) {
    next.naceDescription = session.naceDescription
  }
  if (session.country && !previous.country) next.country = session.country
  if (session.year != null && !previous.yearFounded) next.yearFounded = String(session.year)
  if (shouldUseSessionBusinessType && !previous.businessType) {
    next.businessType = session.businessType
  }
  if (session.industry && !previous.industry) next.industry = session.industry

  return next
}
