/**
 * OwnershipStructureSection Component
 *
 * Single Responsibility: Render Ownership Structure form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/OwnershipStructureSection
 */

'use client'

import { useTranslations } from 'next-intl'
import React from 'react'
import {
  AuroraFormAlert,
  AuroraFormGrid,
  AuroraFormSection,
  AuroraNumberInput,
  AuroraSelect,
} from '../../../design-system/components'
import type { ValuationFormData } from '../../../types/valuation'

interface OwnershipStructureSectionProps {
  formData: ValuationFormData
  updateFormData: (data: Partial<ValuationFormData>) => void
  employeeCountError: string | null
  setEmployeeCountError: (error: string | null) => void
}

export const OwnershipStructureSection: React.FC<OwnershipStructureSectionProps> = ({
  formData,
  updateFormData,
  employeeCountError,
  setEmployeeCountError,
}) => {
  const t = useTranslations('forms.sections')

  return (
    <AuroraFormSection title={t('ownershipStructure')}>
      <AuroraFormGrid columns={2}>
        {/* Business Type */}
        <AuroraSelect
          label={t('businessStructure')}
          placeholder={t('selectStructure')}
          options={[
            { value: 'sole-trader', label: t('soleTrader') },
            { value: 'company', label: t('companyWithShareholders') },
          ]}
          value={formData.business_type || 'company'}
          onChange={(value) =>
            updateFormData({ business_type: value as 'sole-trader' | 'company' })
          }
        />
      </AuroraFormGrid>

      {/* Owner Concentration Fields - Only for Companies */}
      {formData.business_type === 'company' && (
        <AuroraFormGrid columns={2} className="mt-6">
          <AuroraNumberInput
            label={t('activeOwnerManagers')}
            placeholder={t('ownerManagersPlaceholder')}
            value={formData.number_of_owners !== undefined ? String(formData.number_of_owners) : ''}
            onChange={(e) => {
              // Allow empty string during editing
              if (e.target.value === '') {
                updateFormData({ number_of_owners: undefined })
                return
              }
              const parsedValue = parseInt(e.target.value)
              if (!isNaN(parsedValue)) {
                // Apply min/max constraints only when there's a valid number
                const value = Math.max(1, Math.min(100, parsedValue))
                updateFormData({ number_of_owners: value })
              }
            }}
            onBlur={(e) => {
              // Apply default value of 1 only on blur if field is empty
              if (e.target.value === '' || !e.target.value) {
                updateFormData({ number_of_owners: 1 })
              }
            }}
            name="number_of_owners"
            min={1}
            max={100}
            step={1}
            helpText={t('ownerManagersHelp')}
          />

          <AuroraNumberInput
            label={t('fteEmployees')}
            placeholder={t('ftePlaceholder')}
            value={
              formData.number_of_employees !== undefined
                ? formData.number_of_employees.toString()
                : ''
            }
            onChange={(e) => {
              const inputValue = e.target.value.trim()
              let value: number | undefined
              if (inputValue === '') {
                value = undefined
              } else {
                const num = parseInt(inputValue, 10)
                value = !isNaN(num) && num >= 0 ? num : undefined
              }
              updateFormData({ number_of_employees: value })
              if (employeeCountError && value !== undefined) {
                setEmployeeCountError(null)
              }
            }}
            onBlur={() => undefined}
            name="number_of_employees"
            min={0}
            step={1}
            error={employeeCountError || undefined}
            touched={!!employeeCountError}
            required={
              formData.business_type === 'company' &&
              !!(formData.number_of_owners && formData.number_of_owners > 0)
            }
            helpText={`${t('fteHelp')}${
              formData.business_type === 'company' &&
              formData.number_of_owners &&
              formData.number_of_owners > 0
                ? t('fteHelpRequired')
                : ''
            }`}
          />

          {/* Owner Concentration Risk Warning */}
          {formData.business_type === 'company' &&
            formData.number_of_owners !== undefined &&
            formData.number_of_employees !== undefined &&
            (() => {
              const ownerRatio =
                formData.number_of_employees === 0
                  ? 1.0
                  : formData.number_of_owners / formData.number_of_employees

              if (ownerRatio >= 0.5) {
                // ≥ 80% owner ratio (or 100% owner-operated) = CRITICAL at -20%
                // 50%–79% = HIGH at -12%
                const isCritical = ownerRatio >= 0.8 || formData.number_of_employees === 0
                const riskLevel = isCritical ? 'CRITICAL' : 'HIGH'
                const discount = isCritical ? '-20%' : '-12%'

                return (
                  <div className="@4xl:col-span-2">
                    <AuroraFormAlert
                      type={isCritical ? 'error' : 'warning'}
                      title={`${riskLevel} Key Person Risk - Valuation Impact: ${discount}`}
                    >
                      <p className="text-sm leading-relaxed">
                        {isCritical ? (
                          <>
                            This business is <strong>100% owner-operated</strong> with no non-owner
                            employees. This represents maximum key person risk and will reduce your
                            valuation multiple by <strong>20%</strong>.
                          </>
                        ) : (
                          <>
                            Owner ratio of <strong>{(ownerRatio * 100).toFixed(0)}%</strong>{' '}
                            indicates high key person dependency. This will reduce your valuation
                            multiple by <strong>{discount}</strong>.
                          </>
                        )}
                      </p>
                      {isCritical && (
                        <p className="mt-2 text-xs text-success">
                          <strong>Tip:</strong> Hiring 2-3 employees could increase your business
                          value by €150K-200K
                        </p>
                      )}
                    </AuroraFormAlert>
                  </div>
                )
              }
              return null
            })()}
        </AuroraFormGrid>
      )}
    </AuroraFormSection>
  )
}
