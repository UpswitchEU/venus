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

/** Humanize a taxonomy slug ("retail-services" → "Retail services") for display. */
function humanizeTaxon(value?: string | null): string {
  if (!value) return ''
  const spaced = value.replace(/[-_]+/g, ' ').trim()
  if (!spaced) return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
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
  const dcfPct = Math.round((selectedMetadata?.dcf_preference ?? 0) * 100)
  const multiplesPct = Math.round((selectedMetadata?.multiples_preference ?? 0) * 100)

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
      {/* Label lives INSIDE the trigger (entity-search style) so the resting
          field is visually identical to the country / company-search fields. */}
      <BusinessTypeMultiSelect
        label={label}
        value={value}
        options={options}
        onChange={handleSelectionChange}
        copy={selectorCopy(locale, t)}
        loading={loadingTypes}
        error={loadingError}
        required
        showCategories={false}
      />

      {showPreview && selectedId && (
        <div className="mt-4">
          {loadingMetadata ? (
            <div className="flex items-center justify-center rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-6">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-foreground/10 border-t-primary" />
            </div>
          ) : selectedMetadata ? (
            <div className="space-y-4 rounded-xl border border-primary/15 bg-foreground/[0.02] bg-gradient-to-br from-primary/[0.08] to-transparent p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-foreground/[0.08] bg-foreground/[0.05] text-2xl">
                  {selectedMetadata.icon || '🏢'}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-foreground">
                    {selectedMetadata.title}
                  </h3>
                  {(selectedMetadata.sector || selectedMetadata.industry) && (
                    <p className="truncate text-xs text-foreground/50">
                      {[
                        humanizeTaxon(selectedMetadata.sector),
                        humanizeTaxon(selectedMetadata.industry),
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  )}
                </div>
              </div>

              {(selectedMetadata.typical_revenue_median ||
                selectedMetadata.typical_ebitda_margin_median ||
                selectedMetadata.typical_employee_median) && (
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  {selectedMetadata.typical_revenue_median && (
                    <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.04] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                        Typical revenue
                      </p>
                      <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
                        {formatCurrency(selectedMetadata.typical_revenue_median)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-foreground/40">
                        {formatCurrency(selectedMetadata.typical_revenue_min)} –{' '}
                        {formatCurrency(selectedMetadata.typical_revenue_max)}
                      </p>
                    </div>
                  )}

                  {selectedMetadata.typical_ebitda_margin_median && (
                    <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.04] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                        EBITDA margin
                      </p>
                      <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_median)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-foreground/40">
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_min)} –{' '}
                        {formatPercentage(selectedMetadata.typical_ebitda_margin_max)}
                      </p>
                    </div>
                  )}

                  {selectedMetadata.typical_employee_median && (
                    <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.04] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                        Typical employees
                      </p>
                      <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
                        {selectedMetadata.typical_employee_median}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-foreground/40">
                        {selectedMetadata.typical_employee_min} –{' '}
                        {selectedMetadata.typical_employee_max}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {keyMetricLabels.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                    Key metrics we'll ask about
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {keyMetricLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-md border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(selectedMetadata.questions?.length || selectedMetadata.dcf_preference) && (
                <div className="space-y-2 border-t border-foreground/[0.08] pt-3.5">
                  <div className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                    <span>
                      {selectedMetadata.dcf_preference ? 'Valuation method' : 'Targeted questions'}
                    </span>
                    {selectedMetadata.questions && selectedMetadata.questions.length > 0 && (
                      <span className="font-mono tabular-nums normal-case tracking-normal text-foreground/55">
                        {selectedMetadata.questions.length} questions
                        {requiredQuestionsCount > 0 && ` · ${requiredQuestionsCount} required`}
                      </span>
                    )}
                  </div>
                  {selectedMetadata.dcf_preference && (
                    <>
                      <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div className="bg-primary" style={{ width: `${dcfPct}%` }} />
                        <div className="bg-accent" style={{ width: `${multiplesPct}%` }} />
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-foreground/55">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm bg-primary" />
                          {dcfPct}% DCF
                        </span>
                        <span className="flex items-center gap-1.5">
                          {multiplesPct}% Multiples
                          <span className="h-2 w-2 rounded-sm bg-accent" />
                        </span>
                      </div>
                    </>
                  )}
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
