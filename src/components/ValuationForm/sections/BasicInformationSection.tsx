/**
 * BasicInformationSection Component
 *
 * Single Responsibility: Render Basic Information form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/BasicInformationSection
 */

import { useTranslations } from 'next-intl'
import React, { useEffect, useMemo, useState } from 'react'
import { TARGET_COUNTRIES } from '../../../config/countries'
import {
  AuroraFormAlert,
  AuroraFormGrid,
  AuroraFormSection,
  AuroraFullWidthField,
  AuroraNumberInput,
  AuroraSelect,
} from '../../../design-system/components'
import { suggestionService } from '../../../services/businessTypeSuggestionApi'
import type { BusinessType } from '../../../services/businessTypesApi'
import type { CompanySearchResult } from '../../../services/registry/types'
import type { ValuationFormData } from '../../../types/valuation'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'
import { CustomBusinessTypeSearch } from '../../forms'
import CompanyNameInput from '../../forms/CompanyNameInput'
import { fetchBusinessTypeById } from '../../../services/fetchBusinessTypeById'
import { useSectorMismatchWarning } from '../../../hooks/useSectorMismatchWarning'
import { useManualResultsStore } from '../../../store/manual'
import { buildBusinessTypeFormData } from '../utils/businessTypeFormData'

interface BasicInformationSectionProps {
  formData: ValuationFormData
  updateFormData: (data: Partial<ValuationFormData>) => void
  businessTypes: BusinessType[]
  businessTypesLoading: boolean
  businessTypesError: string | null
  prefilledQuery?: string | null // Optional prefilled query from URL
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getStringValue(value: unknown, key: string): string | undefined {
  const recordValue = asRecord(value)[key]
  return typeof recordValue === 'string' && recordValue.trim() ? recordValue : undefined
}

function getFirstStringValue(value: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const recordValue = getStringValue(value, key)
    if (recordValue) return recordValue
  }
  return undefined
}

/**
 * BasicInformationSection Component
 *
 * Renders Basic Information section with:
 * - Business Type Search
 * - Company Name
 * - Founding Year
 * - Country
 */
export const BasicInformationSection: React.FC<BasicInformationSectionProps> = ({
  formData,
  updateFormData,
  businessTypes,
  businessTypesLoading,
  businessTypesError,
  prefilledQuery,
}) => {
  const t = useTranslations()
  // Track which fields were auto-filled from registry
  const [autoFilledFields, setAutoFilledFields] = useState<string[]>([])

  // LinkedIn pattern: Form owns selected company state
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null)
  const [isVerifyingCompany, setIsVerifyingCompany] = useState(false)
  const effectiveCountryCode =
    selectedCompany?.country_code ||
    formData.country_code ||
    getStringValue(formData.business_context, 'country_code') ||
    'BE'

  const sectorMismatchFromNace = useSectorMismatchWarning({
    business_type_id: formData.business_type_id,
    nace_code:
      selectedCompany?.nace_code ||
      selectedCompany?.activity_code ||
      selectedCompany?.canonical_nace_code ||
      formData.nace_code,
    activity_code: formData.activity_code,
    canonical_nace_code: formData.canonical_nace_code,
    country_code: effectiveCountryCode,
    industry: formData.industry,
  })

  // Construct initial selected company from stored KBO data if available
  // This allows the company summary card to show when restoring a previously verified company
  // ✅ FIX: Check both business_context AND top-level formData fields (from Mercury business card)
  const initialSelectedCompany = useMemo<CompanySearchResult | null>(() => {
    if (!formData.company_name) return null

    // Check for KBO data in business_context first (preferred source - from previous verification)
    const businessContext = formData.business_context
    let kboRegistration =
      getFirstStringValue(businessContext, ['kbo_registration', 'kbo_registration_number']) ??
      formData.kbo_number
    let legalForm = getStringValue(businessContext, 'legal_form') ?? formData.legal_form
    const companyId = getStringValue(businessContext, 'company_id')
    let companyAddress = getStringValue(businessContext, 'company_address') ?? ''
    const companyStatus = getStringValue(businessContext, 'company_status') ?? 'Active'

    // ✅ FIX: Also check top-level formData fields (from Mercury business card prefill)
    // When data comes from Mercury, KBO fields are at top level, not in business_context
    if (!kboRegistration) {
      kboRegistration = getStringValue(formData, 'kbo_registration')
    }
    if (!legalForm) {
      legalForm = formData.legal_form
    }
    if (!companyAddress) {
      // Try to construct address from location/city/postal_code
      const location = getStringValue(formData, 'location') || formData.city
      const postalCode = formData.postal_code
      if (location || postalCode) {
        companyAddress = [postalCode, location].filter(Boolean).join(' ') || ''
      }
    }

    // If we have KBO registration data (from either source), construct a CompanySearchResult
    if (kboRegistration && formData.company_name) {
      const countryCode = formData.country_code || 'BE'
      return {
        company_id: companyId || kboRegistration, // Use stored company_id or fallback to registration number
        company_name: formData.company_name,
        result_type: 'COMPANY',
        registration_number: kboRegistration,
        country_code: countryCode,
        legal_form: legalForm || '',
        address: companyAddress,
        status: companyStatus,
        confidence_score: 1.0,
        registry_name: countryCode === 'NL' ? 'KVK' : 'KBO',
        registry_url: '',
      }
    }

    return null
  }, [
    formData.company_name,
    formData.business_context,
    formData.country_code,
    // ✅ FIX: Include top-level KBO fields in dependencies
    // Access via formData object to ensure reactivity
    formData,
  ])

  // Background verification when restoring saved company
  // ✅ FIX: Also set selectedCompany immediately if KBO data exists in top-level formData
  // This ensures the preview card shows immediately when data is prefilled from Mercury
  useEffect(() => {
    const controller = new AbortController()

    const verifyRestoredCompany = async () => {
      if (initialSelectedCompany && !selectedCompany) {
        // ✅ FIX: Show company immediately (smooth UX) - no dropdown flash
        generalLogger.info('[BasicInfo] Setting selectedCompany from prefilled KBO data', {
          company_name: initialSelectedCompany.company_name,
          registration_number: initialSelectedCompany.registration_number,
          source: 'prefilled',
        })
        setSelectedCompany(initialSelectedCompany)

        // Verify in background
        setIsVerifyingCompany(true)
        try {
          const { registryService } = await import('../../../services/registry/registryService')
          const response = await registryService.searchCompanies(
            initialSelectedCompany.company_name,
            effectiveCountryCode,
            1,
            controller.signal
          )

          if (controller.signal.aborted) return

          if (response.success && response.results?.[0]) {
            const freshData = response.results[0]

            // Check if data changed
            const dataChanged =
              freshData.registration_number !== initialSelectedCompany.registration_number ||
              freshData.legal_form !== initialSelectedCompany.legal_form ||
              freshData.status !== initialSelectedCompany.status ||
              freshData.address !== initialSelectedCompany.address

            if (dataChanged) {
              generalLogger.info('[BasicInfo] KBO data updated since last save', {
                company_name: freshData.company_name,
                changes: {
                  registration:
                    freshData.registration_number !== initialSelectedCompany.registration_number,
                  legal_form: freshData.legal_form !== initialSelectedCompany.legal_form,
                  status: freshData.status !== initialSelectedCompany.status,
                  address: freshData.address !== initialSelectedCompany.address,
                },
              })

              setSelectedCompany(freshData)
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return
          generalLogger.warn('[BasicInfo] Background verification failed, using cached data', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          // Keep showing cached data on error
        } finally {
          if (!controller.signal.aborted) {
            setIsVerifyingCompany(false)
          }
        }
      } else {
        setIsVerifyingCompany(false)
      }
    }

    verifyRestoredCompany()
    return () => {
      controller.abort()
      setIsVerifyingCompany(false)
    }
  }, [effectiveCountryCode, initialSelectedCompany, selectedCompany])

  // Save company data when selectedCompany changes
  useEffect(() => {
    if (!selectedCompany) return

    const saveCompanyData = async () => {
      generalLogger.info('[BasicInfo] Saving company data', {
        company_name: selectedCompany.company_name,
        registration_number: selectedCompany.registration_number,
      })

      // Get current form data snapshot to avoid stale closures
      const currentFormData = formData
      const currentBusinessContext = asRecord(currentFormData.business_context)
      const updatedBusinessContext: ValuationFormData['business_context'] = {
        ...currentBusinessContext,
        kbo_registration: selectedCompany.registration_number,
        kbo_registration_number: selectedCompany.registration_number,
        legal_form: selectedCompany.legal_form,
        company_id: selectedCompany.company_id,
        company_address: selectedCompany.address,
        company_status: selectedCompany.status,
      }

      const updates: Partial<ValuationFormData> = {
        business_context: updatedBusinessContext,
      }

      // Pre-populate business type from Titan enrichment (NACE/SBI). Only when
      // the form has no type yet — never overwrite a manual choice.
      if (selectedCompany.business_type_id && !currentFormData.business_type_id) {
        const enriched = await fetchBusinessTypeById(selectedCompany.business_type_id)
        if (enriched) {
          Object.assign(updates, buildBusinessTypeFormData(enriched))
        } else {
          updates.business_type_id = selectedCompany.business_type_id
        }
      }

      // Fetch financial data if available
      if (selectedCompany.company_id && selectedCompany.company_id.length > 3) {
        try {
          const { registryService } = await import('../../../services/registry/registryService')
          const financialData = await registryService.getCompanyFinancials(
            selectedCompany.company_id,
            currentFormData.country_code || selectedCompany.country_code || 'BE'
          )

          // Auto-fill founding_year if available and not already set
          if (financialData.founding_year && !currentFormData.founding_year) {
            updates.founding_year = financialData.founding_year
          }

          // Auto-fill industry if available and not already set
          if (
            financialData.industry_description &&
            !currentFormData.industry &&
            !currentFormData.business_type_id
          ) {
            updates.industry = financialData.industry_description
          }

          // Auto-fill number_of_employees if available
          if (financialData.employees && !currentFormData.number_of_employees) {
            updates.number_of_employees = financialData.employees
          }

          // Track auto-filled fields
          const filledFields: string[] = []
          if (updates.founding_year) filledFields.push('Founding year')
          if (updates.industry) filledFields.push('Industry')
          if (updates.number_of_employees) filledFields.push('Employees')

          if (filledFields.length > 0) {
            setAutoFilledFields(filledFields)
            setTimeout(() => setAutoFilledFields([]), 5000)

            generalLogger.info('[BasicInfo] Auto-filled fields from KBO', {
              filledFields,
              company_id: selectedCompany.company_id,
            })
          }
        } catch (error) {
          generalLogger.warn('[BasicInfo] Failed to fetch financial data', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      updateFormData(updates)
    }

    saveCompanyData()
  }, [selectedCompany, formData, updateFormData])

  return (
    <AuroraFormSection title={t('forms.sections.basicInformation')}>
      {sectorMismatchFromNace && (
        <AuroraFullWidthField>
          <AuroraFormAlert type="warning">
            {t('forms.warnings.sectorMismatch', {
              naceType: sectorMismatchFromNace.naceTypeTitle,
              selected:
                businessTypes.find((bt) => bt.id === formData.business_type_id)?.title ??
                sectorMismatchFromNace.selectedTitle,
            })}
          </AuroraFormAlert>
        </AuroraFullWidthField>
      )}
      <AuroraFormGrid columns={2}>
        {/* Business Type Selector - replaces Industry, Sub-Industry, and Business Model */}
        {/* MOVED TO TOP: Aligns with AI-guided flow & enables intelligent triage from question 1 */}
        <AuroraFullWidthField>
          <CustomBusinessTypeSearch
            value={formData.business_type_id}
            businessTypes={businessTypes}
            initialQuery={prefilledQuery && !formData.business_type_id ? prefilledQuery : undefined}
            onChange={(businessType) => {
              // Log selected business type for debugging
              generalLogger.debug('Business type selected', {
                id: businessType.id,
                title: businessType.title,
                dcfPreference: businessType.dcfPreference,
                multiplesPreference: businessType.multiplesPreference,
                ownerDependencyImpact: businessType.ownerDependencyImpact,
                keyMetrics: businessType.keyMetrics,
                hasPreferences: !!(
                  businessType.dcfPreference !== undefined &&
                  businessType.multiplesPreference !== undefined
                ),
                allKeys: Object.keys(businessType),
              })

              generalLogger.info('Business type selected', {
                id: businessType.id,
                title: businessType.title,
                industryMapping: businessType.industryMapping,
                industry: businessType.industry,
                metadata: {
                  dcfPreference: businessType.dcfPreference,
                  multiplesPreference: businessType.multiplesPreference,
                  ownerDependencyImpact: businessType.ownerDependencyImpact,
                },
              })

              // Warn if industry classification is missing but proceed with 'services' fallback
              if (!businessType.industry && !businessType.industryMapping) {
                generalLogger.warn(
                  'Business type missing industry classification — using services fallback',
                  { id: businessType.id }
                )
              }

              useManualResultsStore.getState().clearResults()
              updateFormData(buildBusinessTypeFormData(businessType))
            }}
            onSuggest={async (suggestion) => {
              try {
                await suggestionService.submitSuggestion({
                  suggestion,
                  context: {
                    industry: formData.industry,
                    search_query: suggestion,
                    description: `User searched for: ${suggestion}`,
                  },
                })

                generalLogger.info('Business type suggestion submitted', { suggestion })
              } catch (error) {
                // BANK-GRADE: Specific error handling - suggestion submission failure
                if (error instanceof Error) {
                  generalLogger.error('Failed to submit suggestion', {
                    error: error.message,
                    stack: error.stack,
                  })
                } else {
                  generalLogger.error('Failed to submit suggestion', {
                    error: String(error),
                  })
                }
              }
            }}
            placeholder={t('forms.fields.businessTypeSearch')}
            label={t('forms.fields.businessType')}
            required
            loading={businessTypesLoading}
            disabled={businessTypesLoading}
          />
          {businessTypesError && (
            <p className="mt-2 text-sm text-warning">
              Using offline business types. Some options may be limited.
            </p>
          )}
        </AuroraFullWidthField>

        {/* Company Name with KBO Registry Check */}
        {/* MOVED AFTER BUSINESS TYPE: Enables context-aware KBO validation */}
        {/* LinkedIn pattern: Selection shows preview, save happens on calculate */}
        <CompanyNameInput
          label={t('forms.fields.companyName')}
          type="text"
          name="company_name"
          value={formData.company_name || ''}
          onChange={(value) => updateFormData({ company_name: value })}
          onBlur={() => undefined}
          placeholder={t('forms.fields.companyNamePlaceholder')}
          countryCode={effectiveCountryCode}
          selectedCompany={selectedCompany}
          onCompanyChange={(company) => {
            setSelectedCompany(company)
            if (company) {
              updateFormData({ company_name: company.company_name })
            }
          }}
          onClearCompany={() => {
            // Clear selected company but keep the current input value
            // This allows user to edit/change the name without losing what they typed
            setSelectedCompany(null)
            // Don't clear company_name - let user edit the existing value
            generalLogger.info('[BasicInfo] Clearing company selection', {
              previous_company: selectedCompany?.company_name,
              keeping_input_value: formData.company_name,
            })
          }}
          isVerifying={isVerifyingCompany}
          required
        />

        {/* Registry Data Preview - Show auto-filled fields */}
        {autoFilledFields.length > 0 && (
          <AuroraFullWidthField>
            <AuroraFormAlert type="success" title={t('forms.kboLookup.autoFilledFromRegistry')}>
              {autoFilledFields.join(', ')}
            </AuroraFormAlert>
          </AuroraFullWidthField>
        )}

        {/* Founding Year */}
        <AuroraNumberInput
          label={t('forms.fields.yearBusinessCommenced')}
          placeholder={t('forms.fields.yearBusinessCommencedPlaceholder')}
          value={formData.founding_year || getCurrentFilingYear() - 5}
          onChange={(e) =>
            updateFormData({
              founding_year: parseInt(e.target.value, 10) || getCurrentFilingYear() - 5,
            })
          }
          onBlur={() => undefined}
          name="founding_year"
          min={1900}
          max={new Date().getFullYear()}
          helpText={t('forms.fields.yearBusinessCommencedHelp')}
          required
        />

        {/* Country */}
        <AuroraSelect
          label={t('forms.fields.primaryOperatingCountry')}
          placeholder={t('forms.fields.countrySelect')}
          options={TARGET_COUNTRIES.map((country) => ({
            value: country.code,
            label: `${country.flag} ${country.name} (${country.currencySymbol})`,
          }))}
          value={formData.country_code || ''}
          onChange={(value) => updateFormData({ country_code: value })}
          helpText={t('forms.fields.primaryOperatingCountryHelp')}
          required
        />
      </AuroraFormGrid>
    </AuroraFormSection>
  )
}
