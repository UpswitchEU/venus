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
import { generalLogger } from '../../../utils/logger'
import { CustomBusinessTypeSearch } from '../../forms'
import CompanyNameInput from '../../forms/CompanyNameInput'

interface BasicInformationSectionProps {
  formData: ValuationFormData
  updateFormData: (data: Partial<ValuationFormData>) => void
  businessTypes: BusinessType[]
  businessTypesLoading: boolean
  businessTypesError: string | null
  prefilledQuery?: string | null // Optional prefilled query from URL
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

  // Construct initial selected company from stored KBO data if available
  // This allows the company summary card to show when restoring a previously verified company
  // ✅ FIX: Check both business_context AND top-level formData fields (from Mercury business card)
  const initialSelectedCompany = useMemo<CompanySearchResult | null>(() => {
    if (!formData.company_name) return null

    // Check for KBO data in business_context first (preferred source - from previous verification)
    const businessContext = formData.business_context as any
    let kboRegistration =
      businessContext?.kbo_registration || businessContext?.kbo_registration_number
    let legalForm = businessContext?.legal_form
    let companyId = businessContext?.company_id
    let companyAddress = businessContext?.company_address || ''
    let companyStatus = businessContext?.company_status || 'Active'

    // ✅ FIX: Also check top-level formData fields (from Mercury business card prefill)
    // When data comes from Mercury, KBO fields are at top level, not in business_context
    if (!kboRegistration) {
      // Check top-level kbo_number (from business card API)
      kboRegistration = (formData as any).kbo_number || (formData as any).kbo_registration
    }
    if (!legalForm) {
      legalForm = (formData as any).legal_form
    }
    if (!companyAddress) {
      // Try to construct address from location/city/postal_code
      const location = (formData as any).location || (formData as any).city
      const postalCode = (formData as any).postal_code
      if (location || postalCode) {
        companyAddress = [postalCode, location].filter(Boolean).join(' ') || ''
      }
    }
    // Default status to Active if not set
    if (!companyStatus) {
      companyStatus = 'Active'
    }

    // If we have KBO registration data (from either source), construct a CompanySearchResult
    if (kboRegistration && formData.company_name) {
      return {
        company_id: companyId || kboRegistration, // Use stored company_id or fallback to registration number
        company_name: formData.company_name,
        result_type: 'COMPANY',
        registration_number: kboRegistration,
        country_code: formData.country_code || 'BE',
        legal_form: legalForm || '',
        address: companyAddress,
        status: companyStatus,
        confidence_score: 1.0,
        registry_name: 'KBO',
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
            formData.country_code || 'BE',
            1
          )

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

              // Update with fresh data
              setSelectedCompany(freshData)
            }
          }
        } catch (error) {
          generalLogger.warn('[BasicInfo] Background verification failed, using cached data', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          // Keep showing cached data on error
        } finally {
          setIsVerifyingCompany(false)
        }
      }
    }

    verifyRestoredCompany()
  }, [initialSelectedCompany, selectedCompany, formData.country_code])

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
      const currentBusinessContext = (currentFormData.business_context as any) || {}
      const updatedBusinessContext = {
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

      // Fetch financial data if available
      if (selectedCompany.company_id && selectedCompany.company_id.length > 3) {
        try {
          const { registryService } = await import('../../../services/registry/registryService')
          const financialData = await registryService.getCompanyFinancials(
            selectedCompany.company_id,
            currentFormData.country_code || 'BE'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany])

  return (
    <AuroraFormSection title={t('forms.sections.basicInformation')}>
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

              updateFormData({
                business_type_id: businessType.id,
                business_model: businessType.id,
                industry: businessType.industry || businessType.industryMapping || 'services',
                subIndustry: businessType.category,
                // Store internal metadata for backend
                _internal_dcf_preference: businessType.dcfPreference,
                _internal_multiples_preference: businessType.multiplesPreference,
                _internal_owner_dependency_impact: businessType.ownerDependencyImpact,
                _internal_key_metrics: businessType.keyMetrics,
                _internal_typical_employee_range: businessType.typicalEmployeeRange,
                _internal_typical_revenue_range: businessType.typicalRevenueRange,
              } as any)
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
          onBlur={() => {}}
          placeholder={t('forms.fields.companyNamePlaceholder')}
          countryCode={formData.country_code || 'BE'}
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
          value={formData.founding_year || new Date().getFullYear() - 5}
          onChange={(e) =>
            updateFormData({
              founding_year: parseInt(e.target.value) || new Date().getFullYear() - 5,
            })
          }
          onBlur={() => {}}
          name="founding_year"
          min={1900}
          max={new Date().getFullYear()}
          showArrows={true}
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
