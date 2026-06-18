'use client'

import {
  BusinessTypeMultiSelect,
  type BusinessTypeMultiSelectCopy,
  type BusinessTypeOption as SharedBusinessTypeOption,
} from '@upswitch/business-type-selector'
import * as React from 'react'
import { defaultBusinessTypes } from './BusinessTypeData'
import type { BusinessType } from './EntitySearchTypes'

type LegacyBusinessTypeSearchSize = 'sm' | 'md' | 'lg'

export interface BusinessTypeSearchInputProps {
  /** Floating label text */
  label?: string
  /** Current value (business type ID) */
  value: string
  /** Change handler */
  onChange: (value: string, businessType?: BusinessType) => void
  /** Container className */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Custom business types list */
  types?: BusinessType[]
  /** Kept for backwards-compatible call sites; the shared selector searches by NACE keywords. */
  naceMatchedTypeId?: string
  /** Loading state */
  loading?: boolean
  /** Error when loading types failed */
  loadError?: string | null
  /** Callback to retry loading types */
  onRetryLoad?: () => void
  /** Country code kept for backwards compatibility */
  countryCode?: string
  /** Legacy visual size prop */
  size?: LegacyBusinessTypeSearchSize
}

function humanizeBusinessTypeSlug(slug: string): string {
  if (!slug?.trim()) return ''
  return slug
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function legacySelectorCopy(label: string): BusinessTypeMultiSelectCopy {
  return {
    searchPlaceholder: 'Zoek bedrijfstypes...',
    selectPlaceholder: label,
    allCategories: 'Alle categorieen',
    loading: 'Bedrijfstypes laden...',
    empty: 'Geen bedrijfstypes gevonden',
    popular: 'Populair',
    required: '* Verplicht',
    offline: 'Offline gegevens',
    selectedLabel: 'Geselecteerde bedrijfstypes',
    clearSelection: 'Verwijderen',
    multipleUnavailable: 'Multiple niet beschikbaar',
    lowSampleSuppressed: 'Multiple verborgen: lage steekproef',
  }
}

function toSharedOption(type: BusinessType): SharedBusinessTypeOption {
  return {
    id: type.id,
    title: type.name,
    description: type.description,
    icon: type.emoji,
    categoryId: type.category,
    categoryLabel: type.code || type.category,
    popular: type.popular,
    naceCodes: type.code ? [type.code] : [],
  }
}

/**
 * @deprecated Use `src/components/BusinessTypeSelector` in product flows.
 *
 * This compatibility wrapper intentionally delegates to the shared
 * multi-select package so no reachable code path can render the old
 * single-select floating card.
 */
export const BusinessTypeSearchInput = React.forwardRef<
  HTMLInputElement,
  BusinessTypeSearchInputProps
>(
  (
    {
      label = 'Bedrijfstype',
      value,
      onChange,
      className,
      disabled,
      types = defaultBusinessTypes,
      loading = false,
      loadError = null,
      onRetryLoad,
    },
    ref
  ) => {
    const hiddenInputRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => hiddenInputRef.current as HTMLInputElement)

    const typeById = React.useMemo(() => new Map(types.map((type) => [type.id, type])), [types])
    const options = React.useMemo(() => {
      const sharedOptions = types.map(toSharedOption)
      if (value && !sharedOptions.some((option) => option.id === value)) {
        sharedOptions.unshift({
          id: value,
          title: humanizeBusinessTypeSlug(value),
          categoryLabel: 'Legacy',
        })
      }
      return sharedOptions
    }, [types, value])

    const handleChange = React.useCallback(
      (ids: string[]) => {
        if (ids.length === 0) {
          onChange('')
          return
        }

        const nextId = ids.find((id) => id !== value) ?? ids.at(-1) ?? ''
        onChange(nextId, typeById.get(nextId))
      },
      [onChange, typeById, value]
    )

    return (
      <div className={className}>
        <input ref={hiddenInputRef} type="hidden" value={value} readOnly />
        <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>
        <BusinessTypeMultiSelect
          value={value ? [value] : []}
          options={options}
          onChange={handleChange}
          copy={legacySelectorCopy(label)}
          disabled={disabled}
          loading={loading}
          error={loadError}
          showCategories={false}
          required={false}
        />
        {loadError && onRetryLoad && (
          <button
            type="button"
            onClick={onRetryLoad}
            className="mt-2 text-xs font-medium text-primary hover:text-primary/80"
          >
            Opnieuw proberen
          </button>
        )}
      </div>
    )
  }
)
BusinessTypeSearchInput.displayName = 'BusinessTypeSearchInput'
