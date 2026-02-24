/**
 * BusinessTypeSelector Component
 *
 * Enhanced business type selector with metadata preview.
 * Shows typical ranges, key metrics, and smart defaults.
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { BusinessTypeFull } from '../hooks/useBusinessTypeFull'
import { useBusinessTypeFull } from '../hooks/useBusinessTypeFull'
import { useBusinessTypes } from '../hooks/useBusinessTypes'

// ============================================================================
// TYPES
// ============================================================================

interface BusinessTypeSelectorProps {
  value: string | null
  onChange: (businessTypeId: string) => void
  onMetadataLoaded?: (metadata: BusinessTypeFull) => void
  showPreview?: boolean
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BusinessTypeSelector: React.FC<BusinessTypeSelectorProps> = ({
  value,
  onChange,
  onMetadataLoaded,
  showPreview = true,
  className = '',
}) => {
  const t = useTranslations('common')
  const { businessTypeOptions, loading: loadingTypes } = useBusinessTypes()
  const [selectedId, setSelectedId] = useState<string | null>(value)

  // Load full metadata when a business type is selected
  const { businessType: selectedMetadata, loading: loadingMetadata } =
    useBusinessTypeFull(selectedId)

  // Notify parent when metadata is loaded
  React.useEffect(() => {
    if (selectedMetadata && onMetadataLoaded) {
      onMetadataLoaded(selectedMetadata as BusinessTypeFull)
    }
  }, [selectedMetadata, onMetadataLoaded])

  // Handle selection
  const handleSelect = (businessTypeId: string) => {
    setSelectedId(businessTypeId)
    onChange(businessTypeId)
  }

  // Format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Format percentage
  const formatPercentage = (value?: number) => {
    if (!value) return 'N/A'
    return `${value}%`
  }

  return (
    <div className={`business-type-selector ${className}`}>
      {/* Selector Dropdown */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Business Type <span className="text-rust-500">*</span>
        </label>
        <select
          value={selectedId || ''}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={loadingTypes}
          className="block w-full rounded-md border-foreground/10 shadow-sm focus:border-primary focus:ring-primary"
        >
          <option value="">
            {loadingTypes ? t('loadingBusinessTypes') : t('selectBusinessType')}
          </option>
          {businessTypeOptions.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Metadata Preview */}
      {showPreview && selectedId && (
        <div className="mt-4">
          {loadingMetadata ? (
            <div className="flex items-center justify-center p-6 bg-muted rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : selectedMetadata ? (
            <div className="bg-gradient-to-br from-primary-50 to-canvas rounded-lg p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center space-x-3">
                <span className="text-4xl">{selectedMetadata.icon}</span>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{selectedMetadata.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedMetadata.sector} • {selectedMetadata.industry}
                  </p>
                </div>
              </div>

              {/* Typical Ranges */}
              {(selectedMetadata.typical_revenue_median ||
                selectedMetadata.typical_ebitda_margin_median ||
                selectedMetadata.typical_employee_median) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Revenue */}
                  {selectedMetadata.typical_revenue_median && (
                    <div className="bg-card rounded-md p-3">
                      <p className="text-xs text-muted-foreground mb-1">Typical Revenue</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatCurrency(selectedMetadata.typical_revenue_median)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Range: {formatCurrency(selectedMetadata.typical_revenue_min)} -{' '}
                        {formatCurrency(selectedMetadata.typical_revenue_max)}
                      </p>
                    </div>
                  )}

                  {/* EBITDA Margin */}
                  {selectedMetadata.typical_ebitda_margin_median && (
                    <div className="bg-card rounded-md p-3">
                      <p className="text-xs text-muted-foreground mb-1">Typical EBITDA Margin</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_median)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Range: {formatPercentage(selectedMetadata.typical_ebitda_margin_min)} -{' '}
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_max)}
                      </p>
                    </div>
                  )}

                  {/* Employees */}
                  {selectedMetadata.typical_employee_median && (
                    <div className="bg-card rounded-md p-3">
                      <p className="text-xs text-muted-foreground mb-1">Typical Employees</p>
                      <p className="text-lg font-semibold text-foreground">
                        {selectedMetadata.typical_employee_median}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Range: {selectedMetadata.typical_employee_min} -{' '}
                        {selectedMetadata.typical_employee_max}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Key Metrics */}
              {selectedMetadata.key_metrics && selectedMetadata.key_metrics.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Key Metrics We'll Ask About:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMetadata.key_metrics
                      .slice(0, 4)
                      .map((metric: { label?: string; name?: string }, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                        >
                          {metric.label || metric.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Questions Count */}
              {selectedMetadata.questions && selectedMetadata.questions.length > 0 && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  {selectedMetadata.questions.length} targeted questions
                  {selectedMetadata.questions.filter((q: { required?: boolean }) => q.required)
                    .length > 0 &&
                    ` (${selectedMetadata.questions.filter((q: { required?: boolean }) => q.required).length} required)`}
                </div>
              )}

              {/* Valuation Method Preference */}
              {selectedMetadata.dcf_preference && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  Valuation: {Math.round(selectedMetadata.dcf_preference * 100)}% DCF,{' '}
                  {Math.round(selectedMetadata.multiples_preference * 100)}% Multiples
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default BusinessTypeSelector
