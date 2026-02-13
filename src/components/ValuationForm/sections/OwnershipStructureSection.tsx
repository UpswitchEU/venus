/**
 * OwnershipStructureSection Component
 *
 * Single Responsibility: Render Ownership Structure form section
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/sections/OwnershipStructureSection
 */

import React from 'react'
import type { ValuationFormData } from '../../../types/valuation'
import { CustomDropdown, CustomNumberInputField } from '../../forms'

interface OwnershipStructureSectionProps {
  formData: ValuationFormData
  updateFormData: (data: Partial<ValuationFormData>) => void
  employeeCountError: string | null
  setEmployeeCountError: (error: string | null) => void
}

/**
 * OwnershipStructureSection Component
 *
 * Renders Ownership Structure section with:
 * - Business Structure (sole-trader/company)
 * - Shares for Sale (if company)
 * - Owner-Managers count (if company)
 * - Employee count (if company)
 * - Owner Concentration Risk Warning (if applicable)
 */
export const OwnershipStructureSection: React.FC<OwnershipStructureSectionProps> = ({
  formData,
  updateFormData,
  employeeCountError,
  setEmployeeCountError,
}) => {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white mb-6 pb-2 border-b border-white/10 tracking-tight">
        Ownership Structure
      </h3>

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-6">
        {/* Business Type */}
        <CustomDropdown
          label="Business Structure"
          placeholder="Select structure..."
          options={[
            { value: 'sole-trader', label: 'Sole Trader (100% owned)' },
            { value: 'company', label: 'Company (with shareholders)' },
          ]}
          value={formData.business_type || 'company'}
          onChange={(value) =>
            updateFormData({ business_type: value as 'sole-trader' | 'company' })
          }
        />

        {/* Shares for Sale */}
        {formData.business_type === 'company' && (
          <CustomNumberInputField
            label="Equity Stake for Sale (%)"
            placeholder="e.g., 51 (majority control) or 25 (minority stake)"
            value={formData.shares_for_sale || 100}
            onChange={(e) => updateFormData({ shares_for_sale: parseFloat(e.target.value) || 100 })}
            onBlur={() => {}}
            name="shares_for_sale"
            min={0}
            max={100}
            step={0.1}
            suffix="%"
            helpText="Equity interest to be valued. Minority stakes (<50%) often incur a 'Discount for Lack of Control' (DLOC) of 15-30%. Majority stakes (>50%) may command a 'Control Premium' reflecting the value of strategic decision-making power."
          />
        )}
      </div>

      {/* Owner Concentration Fields - Only for Companies */}
      {formData.business_type === 'company' && (
        <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-6">
          <CustomNumberInputField
            label="Active Owner-Managers"
            placeholder="e.g., 2 (founder + COO who owns equity)"
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
            showArrows={true}
            helpText="Number of equity holders with critical operational roles. Used to assess 'Key Person Risk'. High dependency on owner-operators (vs. professional management) increases the Specific Risk Premium, reducing the valuation multiple by 5-20%."
          />

          <CustomNumberInputField
            label="Full-Time Equivalent (FTE) Employees"
            placeholder="e.g., 12 (include part-time as FTE)"
            value={
              formData.number_of_employees !== undefined
                ? formData.number_of_employees.toString()
                : ''
            }
            onChange={(e) => {
              const inputValue = e.target.value
              // Allow empty string, 0, or positive numbers
              const value =
                inputValue === ''
                  ? undefined
                  : inputValue === '0'
                    ? 0
                    : parseInt(inputValue) > 0
                      ? parseInt(inputValue)
                      : undefined
              updateFormData({ number_of_employees: value })
              // Clear error when user provides a valid value (including 0)
              if (employeeCountError && value !== undefined) {
                setEmployeeCountError(null)
              }
            }}
            onBlur={() => {}}
            name="number_of_employees"
            min={0}
            step={1}
            error={employeeCountError || undefined}
            touched={!!employeeCountError}
            required={
              formData.business_type === 'company' &&
              !!(formData.number_of_owners && formData.number_of_owners > 0)
            }
            helpText={`Normalized workforce count (Full-Time Equivalents). Critical for calculating Revenue/Employee efficiency ratios and assessing 'Key Person Dependency'. A higher ratio of employees to owners indicates transferable organizational value.${
              formData.business_type === 'company' &&
              formData.number_of_owners &&
              formData.number_of_owners > 0
                ? ' Required for Key Person Risk calculation. 0 is valid for owner-only entities.'
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
                const riskLevel = ownerRatio >= 0.5 ? 'CRITICAL' : 'HIGH'
                const discount = ownerRatio >= 0.5 ? '-20%' : '-12%'
                const isCritical = formData.number_of_employees === 0

                return (
                  <div
                    className={`p-4 rounded-xl border ${
                      isCritical
                        ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                        : 'bg-amber-50/90 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          isCritical ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                        }`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm mb-1">
                          {riskLevel} Key Person Risk - Valuation Impact: {discount}
                        </h4>
                        <p className="text-sm opacity-90 leading-relaxed">
                          {isCritical ? (
                            <>
                              This business is <strong>100% owner-operated</strong> with no
                              non-owner employees. This represents maximum key person risk and will
                              reduce your valuation multiple by <strong>20%</strong>.
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
                          <div className="mt-3 flex items-start gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                            <span>💡</span>
                            <span>
                              <strong>Tip:</strong> Hiring 2-3 employees could increase your
                              business value by €150K-200K
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }
              return null
            })()}
        </div>
      )}
    </div>
  )
}
