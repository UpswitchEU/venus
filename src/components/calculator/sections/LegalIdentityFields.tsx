'use client'

import { getLegalFormOptions, normalizeLegalForm } from '@upswitch/types/entity-country'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraSelect } from '@/design-system/components/Select'
import { TARGET_COUNTRIES } from '../../../config/countries'
import type { ManualValuationFormData } from '../../../types/valuation'

interface LegalIdentityFieldsProps {
  formData: ManualValuationFormData
  initialData: Partial<ManualValuationFormData>
  isCalculating: boolean
  updateField: <K extends keyof ManualValuationFormData>(
    field: K,
    value: ManualValuationFormData[K]
  ) => void
  updateFormData: (updates: Record<string, unknown>) => void
  onJurisdictionChange: () => void
}

export function LegalIdentityFields({
  formData,
  initialData,
  isCalculating,
  updateField,
  updateFormData,
  onJurisdictionChange,
}: LegalIdentityFieldsProps) {
  const mi = useTranslations('manualInput')
  const locale = useLocale()
  const legalCountry = String(
    formData.registry_country ||
      initialData.registry_country ||
      formData.country ||
      initialData.country ||
      ''
  )
  const businessStructures = getLegalFormOptions(legalCountry, locale)
  const selectedLegalForm =
    normalizeLegalForm(legalCountry, formData.businessStructure || formData.legalForm) ??
    (formData.legalForm ? 'other' : 'unknown')
  return (
    <>
      <AuroraSelect
        label={mi('fields.registrationCountry')}
        options={TARGET_COUNTRIES.map((country) => ({
          value: country.code,
          label: country.name,
        }))}
        value={legalCountry}
        onChange={(val) => {
          updateField('registry_country', val)
          updateField('businessStructure', '')
          updateField('legalForm', '')
          updateField('kboNumber', '')
          updateField('registration_number', undefined)
          updateFormData({
            registry_country: val,
            legal_form: undefined,
            business_structure: undefined,
            registration_number: undefined,
            kbo_number: undefined,
            kvk_number: undefined,
            business_context: undefined,
          })
          onJurisdictionChange()
        }}
        size="sm"
        disabled={isCalculating}
      />
      <AuroraSelect
        label={mi('fields.legalForm')}
        options={businessStructures}
        value={selectedLegalForm}
        onChange={(val) => {
          updateField('businessStructure', val)
          const label =
            val === 'unknown'
              ? ''
              : val === 'other'
                ? formData.legalForm || ''
                : businessStructures.find((option) => option.value === val)?.label || val
          updateField('legalForm', label)
          updateFormData({
            business_structure: val,
            legal_form: label,
            registry_country: legalCountry,
            business_context: undefined,
          })
        }}
        size="sm"
        disabled={isCalculating}
      />
      {selectedLegalForm === 'other' && (
        <input
          aria-label={mi('fields.legalForm')}
          value={formData.legalForm || ''}
          disabled={isCalculating}
          className="w-full rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm"
          onChange={(event) => {
            updateField('legalForm', event.target.value)
            updateFormData({ legal_form: event.target.value, business_structure: 'other' })
          }}
        />
      )}{' '}
    </>
  )
}
