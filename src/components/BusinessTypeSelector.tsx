/**
 * BusinessTypeSelector adapter.
 *
 * Venus owns the data hooks and metadata preview. The multi-select/chip/inline
 * multiple UI is shared with Mercury via `@upswitch/business-type-selector`.
 */

import {
  BusinessTypeMultiSelect,
  type BusinessTypeMultiSelectCopy,
  type BusinessTypePrimaryMultiple,
  type BusinessTypeOption as SharedBusinessTypeOption,
} from '@upswitch/business-type-selector'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import type { BusinessTypeFull } from '../hooks/useBusinessTypeFull'
import { useBusinessTypeFull } from '../hooks/useBusinessTypeFull'
import { useBusinessTypes } from '../hooks/useBusinessTypes'
import type { BusinessType } from '../services/businessTypesApi'

interface BusinessTypeSelectorProps {
  label?: string
  value: string | string[] | null
  onChange: (businessTypeId: string | string[]) => void
  onSelectionChange?: (businessTypeIds: string[], businessTypes: BusinessType[]) => void
  onMetadataLoaded?: (metadata: BusinessTypeFull) => void
  fallbackOptions?: SharedBusinessTypeOption[]
  selectionMode?: 'single' | 'multiple'
  showPreview?: boolean
  className?: string
}

function selectorCopy(
  locale: string,
  t: ReturnType<typeof useTranslations>
): BusinessTypeMultiSelectCopy {
  const isDutch = locale === 'nl'
  const isFrench = locale === 'fr'
  return {
    searchPlaceholder: isFrench
      ? 'Rechercher des types d’entreprise...'
      : isDutch
        ? 'Zoek bedrijfstypes...'
        : 'Search business types...',
    selectPlaceholder: t('selectBusinessType'),
    allCategories: isFrench
      ? 'Toutes les categories'
      : isDutch
        ? 'Alle categorieen'
        : 'All categories',
    loading: t('loadingBusinessTypes'),
    empty: isFrench
      ? 'Aucun type d’entreprise trouve'
      : isDutch
        ? 'Geen bedrijfstypes gevonden'
        : 'No business types found',
    popular: isFrench ? 'Populaire' : isDutch ? 'Populair' : 'Popular',
    required: isFrench ? '* Obligatoire' : isDutch ? '* Verplicht' : '* Required',
    offline: isFrench ? 'Donnees hors ligne' : isDutch ? 'Offline gegevens' : 'Using offline data',
    selectedLabel: isFrench
      ? 'Types d’entreprise selectionnes'
      : isDutch
        ? 'Geselecteerde bedrijfstypes'
        : 'Selected business types',
    clearSelection: isFrench ? 'Supprimer' : isDutch ? 'Verwijderen' : 'Remove',
    multipleUnavailable: isFrench
      ? 'Multiple indisponible'
      : isDutch
        ? 'Multiple niet beschikbaar'
        : 'Multiple not available',
    lowSampleSuppressed: isFrench
      ? 'Multiple masque: echantillon faible'
      : isDutch
        ? 'Multiple verborgen: lage steekproef'
        : 'Multiple hidden: low sample',
  }
}

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

function toSharedOption(businessType: BusinessType): SharedBusinessTypeOption {
  return {
    id: businessType.id,
    title: businessType.title,
    description: businessType.description || businessType.short_description,
    icon: businessType.icon,
    categoryId: businessType.category_id,
    categoryLabel: businessType.category,
    keywords: businessType.keywords,
    popular: businessType.popular,
    primaryMultiple: primaryMultipleFromBusinessType(businessType),
  }
}

function fallbackOptionToBusinessType(option: SharedBusinessTypeOption): BusinessType {
  return {
    id: option.id,
    title: option.title,
    description: option.description ?? '',
    icon: option.icon ?? '🏢',
    category: option.categoryLabel ?? option.categoryId ?? '',
    category_id: option.categoryId ?? option.categoryLabel ?? '',
    industryMapping: option.categoryLabel ?? option.categoryId ?? option.id,
    keywords: option.keywords ?? [],
    popular: Boolean(option.popular),
    primaryMultiple: option.primaryMultiple ?? undefined,
    status: 'active',
    createdAt: '',
    updatedAt: '',
  }
}

export function BusinessTypeSelector({
  label = 'Business Type',
  value,
  onChange,
  onSelectionChange,
  onMetadataLoaded,
  fallbackOptions = [],
  selectionMode = 'multiple',
  showPreview = true,
  className = '',
}: BusinessTypeSelectorProps) {
  const t = useTranslations('common')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
  const { businessTypes, loading: loadingTypes, error: loadingError } = useBusinessTypes()
  const [selectedId, setSelectedId] = useState<string | null>(
    Array.isArray(value) ? value[0] || null : value
  )

  useEffect(() => {
    setSelectedId(Array.isArray(value) ? value[0] || null : value)
  }, [value])

  const { businessType: selectedMetadata, loading: loadingMetadata } =
    useBusinessTypeFull(selectedId)

  const options = useMemo(() => {
    const byId = new Map<string, SharedBusinessTypeOption>()
    for (const option of fallbackOptions) {
      byId.set(option.id, option)
    }
    for (const businessType of businessTypes) {
      byId.set(businessType.id, toSharedOption(businessType))
    }
    return Array.from(byId.values())
  }, [businessTypes, fallbackOptions])
  const businessTypeById = useMemo(() => {
    const byId = new Map<string, BusinessType>()
    for (const option of fallbackOptions) {
      byId.set(option.id, fallbackOptionToBusinessType(option))
    }
    for (const businessType of businessTypes) {
      byId.set(businessType.id, businessType)
    }
    return byId
  }, [businessTypes, fallbackOptions])

  const keyMetricLabels = Array.from(
    new Set(
      selectedMetadata?.key_metrics
        ?.map((metric) => metric.label ?? metric.name)
        .filter((label): label is string => Boolean(label)) ?? []
    )
  ).slice(0, 4)
  const requiredQuestionsCount =
    selectedMetadata?.questions.filter((question) => question.required).length ?? 0

  useEffect(() => {
    if (selectedMetadata && onMetadataLoaded) {
      onMetadataLoaded(selectedMetadata)
    }
  }, [selectedMetadata, onMetadataLoaded])

  const handleSelectionChange = (ids: string[]) => {
    const currentIds = Array.isArray(value) ? value : value ? [value] : []
    const normalizedIds =
      selectionMode === 'single'
        ? ids
            .filter((id) => !currentIds.includes(id))
            .slice(-1)
            .concat(ids.filter((id) => currentIds.includes(id)).slice(0, 1))
            .slice(0, 1)
        : ids
    const selectedBusinessTypes = normalizedIds.flatMap((id) => {
      const businessType = businessTypeById.get(id)
      return businessType ? [businessType] : []
    })
    setSelectedId(normalizedIds[0] || null)
    onSelectionChange?.(normalizedIds, selectedBusinessTypes)
    onChange(normalizedIds.length > 1 ? normalizedIds : normalizedIds[0] || '')
  }

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A'
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (percentageValue?: number) => {
    if (!percentageValue) return 'N/A'
    return `${percentageValue}%`
  }

  return (
    <div className={`business-type-selector ${className}`}>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {label} <span className="text-rust-500">*</span>
        </label>
        <BusinessTypeMultiSelect
          value={value}
          options={options}
          onChange={handleSelectionChange}
          copy={selectorCopy(locale, t)}
          loading={loadingTypes}
          error={loadingError}
          required
          showCategories={false}
        />
      </div>

      {showPreview && selectedId && (
        <div className="mt-4">
          {loadingMetadata ? (
            <div className="flex items-center justify-center rounded-lg bg-muted p-6">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : selectedMetadata ? (
            <div className="space-y-4 rounded-lg bg-gradient-to-br from-primary-50 to-canvas p-6">
              <div className="flex items-center space-x-3">
                <span className="text-4xl">{selectedMetadata.icon || '🏢'}</span>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {selectedMetadata.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedMetadata.sector} • {selectedMetadata.industry}
                  </p>
                </div>
              </div>

              {(selectedMetadata.typical_revenue_median ||
                selectedMetadata.typical_ebitda_margin_median ||
                selectedMetadata.typical_employee_median) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {selectedMetadata.typical_revenue_median && (
                    <div className="rounded-md bg-card p-3">
                      <p className="mb-1 text-xs text-muted-foreground">Typical Revenue</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatCurrency(selectedMetadata.typical_revenue_median)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Range: {formatCurrency(selectedMetadata.typical_revenue_min)} -{' '}
                        {formatCurrency(selectedMetadata.typical_revenue_max)}
                      </p>
                    </div>
                  )}

                  {selectedMetadata.typical_ebitda_margin_median && (
                    <div className="rounded-md bg-card p-3">
                      <p className="mb-1 text-xs text-muted-foreground">Typical EBITDA Margin</p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_median)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Range: {formatPercentage(selectedMetadata.typical_ebitda_margin_min)} -{' '}
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_max)}
                      </p>
                    </div>
                  )}

                  {selectedMetadata.typical_employee_median && (
                    <div className="rounded-md bg-card p-3">
                      <p className="mb-1 text-xs text-muted-foreground">Typical Employees</p>
                      <p className="text-lg font-semibold text-foreground">
                        {selectedMetadata.typical_employee_median}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Range: {selectedMetadata.typical_employee_min} -{' '}
                        {selectedMetadata.typical_employee_max}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {keyMetricLabels.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Key Metrics We'll Ask About:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {keyMetricLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedMetadata.questions && selectedMetadata.questions.length > 0 && (
                <div className="flex items-center text-sm text-muted-foreground">
                  {selectedMetadata.questions.length} targeted questions
                  {requiredQuestionsCount > 0 && ` (${requiredQuestionsCount} required)`}
                </div>
              )}

              {selectedMetadata.dcf_preference && (
                <div className="flex items-center text-sm text-muted-foreground">
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
