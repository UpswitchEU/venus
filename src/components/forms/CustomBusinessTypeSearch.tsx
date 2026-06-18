import {
  BusinessTypeMultiSelect,
  type BusinessTypeMultiSelectCopy,
  type BusinessTypePrimaryMultiple,
  type BusinessTypeOption as SharedBusinessTypeOption,
} from '@upswitch/business-type-selector'
import React, { useMemo } from 'react'
import type { BusinessType } from '../../services/businessTypesApi'

interface CustomBusinessTypeSearchProps {
  value?: string
  businessTypes: BusinessType[]
  onChange: (businessType: BusinessType) => void
  onSuggest?: (suggestion: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  loading?: boolean
  label?: string
  className?: string
  initialQuery?: string
}

const DEFAULT_LABEL = 'Business Type'

function primaryMultipleFromBusinessType(
  businessType: BusinessType
): BusinessTypePrimaryMultiple | null {
  if (businessType.primaryMultiple) return businessType.primaryMultiple

  if (typeof businessType.evEbitdaMedian === 'number') {
    return {
      metric: 'ev_ebitda',
      label: 'EV/EBITDA',
      median: businessType.evEbitdaMedian,
      p25: businessType.evEbitdaP25,
      p75: businessType.evEbitdaP75,
      basis: businessType.multipleBasis,
      lowSampleSuppressed: businessType.lowSampleSuppressed,
    }
  }

  if (typeof businessType.evRevenueMedian === 'number') {
    return {
      metric: 'ev_revenue',
      label: 'EV/Revenue',
      median: businessType.evRevenueMedian,
      p25: businessType.evRevenueP25,
      p75: businessType.evRevenueP75,
      basis: businessType.multipleBasis,
      lowSampleSuppressed: businessType.lowSampleSuppressed,
    }
  }

  if (typeof businessType.peRatioMedian === 'number') {
    return {
      metric: 'pe',
      label: 'P/E',
      median: businessType.peRatioMedian,
      p25: businessType.peRatioP25,
      p75: businessType.peRatioP75,
      basis: businessType.multipleBasis,
      lowSampleSuppressed: businessType.lowSampleSuppressed,
    }
  }

  return null
}

function legacyCopy(placeholder?: string): BusinessTypeMultiSelectCopy {
  return {
    searchPlaceholder: placeholder || 'Search business types...',
    selectPlaceholder: 'Select business type',
    allCategories: 'All categories',
    loading: 'Loading business types...',
    empty: 'No business types found',
    popular: 'Popular',
    required: '* Required',
    offline: 'Using offline data',
    selectedLabel: 'Selected business types',
    clearSelection: 'Remove',
    multipleUnavailable: 'Multiple not available',
    lowSampleSuppressed: 'Multiple hidden: low sample',
  }
}

function toSharedOption(businessType: BusinessType): SharedBusinessTypeOption {
  return {
    id: businessType.id,
    title: businessType.title,
    description: businessType.short_description || businessType.description,
    icon: businessType.icon,
    categoryId: businessType.category_id || businessType.category,
    categoryLabel: businessType.category,
    keywords: businessType.keywords,
    popular: businessType.popular,
    primaryMultiple: primaryMultipleFromBusinessType(businessType),
  }
}

/**
 * @deprecated Use `src/components/BusinessTypeSelector` in product flows.
 *
 * Kept as a compatibility shim for old form imports, but it now renders the
 * shared multi-select surface so the legacy single-select floating card cannot
 * reappear in Venus.
 */
export function CustomBusinessTypeSearch({
  value,
  businessTypes,
  onChange,
  onSuggest,
  placeholder,
  disabled = false,
  required = false,
  loading = false,
  label = DEFAULT_LABEL,
  className = '',
  initialQuery,
}: CustomBusinessTypeSearchProps) {
  const businessTypeById = useMemo(
    () => new Map(businessTypes.map((businessType) => [businessType.id, businessType])),
    [businessTypes]
  )
  const options = useMemo(() => businessTypes.map(toSharedOption), [businessTypes])

  const handleChange = (ids: string[]) => {
    const nextId = ids.find((id) => id !== value) ?? ids.at(-1)
    const selectedType = nextId ? businessTypeById.get(nextId) : undefined
    if (selectedType) onChange(selectedType)
  }

  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <BusinessTypeMultiSelect
        value={value ? [value] : []}
        options={options}
        onChange={handleChange}
        copy={legacyCopy(placeholder)}
        disabled={disabled}
        loading={loading}
        showCategories
        required={required}
      />
      {initialQuery && !value && (
        <p className="mt-2 text-xs text-foreground/50">Initial search: {initialQuery}</p>
      )}
      {onSuggest && initialQuery && !options.length && (
        <button
          type="button"
          onClick={() => onSuggest(initialQuery)}
          className="mt-2 text-xs font-medium text-primary hover:text-primary/80"
        >
          Suggest "{initialQuery}"
        </button>
      )}
    </div>
  )
}
