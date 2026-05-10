'use client'

/**
 * Equipment Economic-Lifespan Revaluation
 * ---------------------------------------
 * Belgian SMEs commonly accelerate fiscal depreciation (degressive method
 * etc.) so the tax book value of equipment reaches zero years before the
 * asset retires economically. This section captures the economic reality:
 *
 *   economic_book = original_cost × (1 − age / economic_useful_life)
 *   meerwaarde    = economic_book − tax_book
 *
 * The meerwaarde flows into the engine via `nav_equipment_revaluation`
 * and shows up in the GNA audit log alongside other per-asset revaluations.
 *
 * Round-1 fix B1: i18n + step badge — every label now resolves through
 * next-intl, the section header is the same `ValuationSectionHeader`
 * rhythm as the rest of the left panel, and Belgian-Dutch jargon
 * ("Materieel") is gated behind the locale.
 */

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export interface NavEquipmentLifespanSectionProps {
  /** Sub-step indicator (e.g. '5c'). See NavRealEstateAppraisalSection. */
  step: string | number
  value?: {
    original_cost?: number
    acquisition_year?: number
    tax_book_value?: number
    economic_useful_life_years?: number
    economic_book_value?: number
  }
  reportingYear?: number
  onChange: (next: NonNullable<NavEquipmentLifespanSectionProps['value']>) => void
  disabled?: boolean
  className?: string
}

/**
 * Pure helper — computes the equipment meerwaarde the section would show
 * for the given input snapshot, so other components (live preview, audit
 * panel) can mirror the section's number without duplicating the logic.
 *
 * Round-1 fix B6: ManualInputPanel feeds the result into the live NAV
 * preview formula.
 */
export function computeEquipmentMeerwaarde(
  value: NavEquipmentLifespanSectionProps['value'] | undefined,
  reportingYear: number | undefined
): number | null {
  if (!value) return null
  const refYear = reportingYear ?? new Date().getFullYear()
  if (value.economic_book_value != null && value.tax_book_value != null) {
    return value.economic_book_value - value.tax_book_value
  }
  if (
    value.original_cost == null ||
    value.acquisition_year == null ||
    value.tax_book_value == null ||
    value.economic_useful_life_years == null ||
    value.economic_useful_life_years <= 0
  ) {
    return null
  }
  const age = Math.max(0, refYear - value.acquisition_year)
  const ratio = Math.min(1, age / value.economic_useful_life_years)
  const econ = Math.max(0, value.original_cost * (1 - ratio))
  return econ - value.tax_book_value
}

export function NavEquipmentLifespanSection({
  step,
  value,
  reportingYear,
  onChange,
  disabled,
  className,
}: NavEquipmentLifespanSectionProps) {
  const t = useTranslations('manualInput.methodSelector.navEquipment')
  const { currency } = useManualPreviewFormatters()
  const v = value ?? {}

  const computed = useMemo(() => {
    const refYear = reportingYear ?? new Date().getFullYear()
    if (v.economic_book_value != null && v.tax_book_value != null) {
      return {
        economic_book: v.economic_book_value,
        meerwaarde: v.economic_book_value - v.tax_book_value,
        method: 'override' as const,
      }
    }
    if (
      v.original_cost == null ||
      v.acquisition_year == null ||
      v.tax_book_value == null ||
      v.economic_useful_life_years == null ||
      v.economic_useful_life_years <= 0
    ) {
      return null
    }
    const age = Math.max(0, refYear - v.acquisition_year)
    const ratio = Math.min(1, age / v.economic_useful_life_years)
    const econ = Math.max(0, v.original_cost * (1 - ratio))
    return {
      economic_book: econ,
      meerwaarde: econ - v.tax_book_value,
      method: 'straight_line' as const,
      age,
    }
  }, [
    v.economic_book_value,
    v.tax_book_value,
    v.original_cost,
    v.acquisition_year,
    v.economic_useful_life_years,
    reportingYear,
  ])

  const update = (patch: Partial<NonNullable<NavEquipmentLifespanSectionProps['value']>>) => {
    onChange({ ...v, ...patch })
  }

  // Section "complete" once the four base inputs (or the override pair)
  // are present — drives the section header's filled state.
  const sectionComplete =
    (v.economic_book_value != null && v.tax_book_value != null) ||
    (v.original_cost != null &&
      v.acquisition_year != null &&
      v.tax_book_value != null &&
      v.economic_useful_life_years != null)

  return (
    <section className={`mt-6 space-y-4 pt-2 ${className ?? ''}`} aria-label={t('ariaLabel')}>
      <ValuationSectionHeader step={step} complete={sectionComplete} title={t('title')} />

      <div className="rounded-xl border border-foreground/[0.08] bg-background">
        <p className="border-b border-foreground/[0.06] px-4 py-3 text-[11px] leading-snug text-foreground/55">
          {t('description')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3">
          <CurrencyInput
            label={t('originalCostLabel')}
            value={v.original_cost}
            onChange={(n) => update({ original_cost: n })}
            size="sm"
            placeholder="0"
            disabled={disabled}
            truncateLabel={false}
          />
          <CurrencyInput
            label={t('taxBookValueLabel')}
            value={v.tax_book_value}
            onChange={(n) => update({ tax_book_value: n })}
            size="sm"
            placeholder="0"
            disabled={disabled}
            truncateLabel={false}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
              {t('acquisitionYearLabel')}
            </span>
            <input
              type="number"
              min={1980}
              max={(reportingYear ?? new Date().getFullYear()) + 0}
              value={v.acquisition_year ?? ''}
              onChange={(e) =>
                update({
                  acquisition_year: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="2018"
              disabled={disabled}
              className="rounded-lg border border-foreground/[0.12] bg-background px-2.5 py-1.5 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
              {t('usefulLifeLabel')}
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={v.economic_useful_life_years ?? ''}
              onChange={(e) =>
                update({
                  economic_useful_life_years:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="10"
              disabled={disabled}
              className="rounded-lg border border-foreground/[0.12] bg-background px-2.5 py-1.5 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none"
            />
          </label>
          <CurrencyInput
            label={t('economicBookOverrideLabel')}
            value={v.economic_book_value}
            onChange={(n) => update({ economic_book_value: n })}
            size="sm"
            placeholder={t('economicBookOverridePlaceholder')}
            disabled={disabled}
            truncateLabel={false}
          />
        </div>

        <dl className="grid grid-cols-3 gap-3 border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 text-[12px]">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground/45">
              {t('economicBookLabel')}
            </dt>
            <dd className="mt-0.5 tabular-nums text-foreground/75">
              {computed ? currency.format(computed.economic_book) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground/45">
              {t('taxBookSummaryLabel')}
            </dt>
            <dd className="mt-0.5 tabular-nums text-foreground/75">
              {v.tax_book_value != null ? currency.format(v.tax_book_value) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground/45">
              {t('meerwaardeLabel')}
            </dt>
            <dd
              className={`mt-0.5 tabular-nums font-semibold ${
                computed == null
                  ? 'text-foreground/45'
                  : computed.meerwaarde >= 0
                    ? 'text-emerald-600'
                    : 'text-rose-500'
              }`}
            >
              {computed ? currency.format(computed.meerwaarde) : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
