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
 */

import { useMemo } from 'react'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'

export interface NavEquipmentLifespanSectionProps {
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

export function NavEquipmentLifespanSection({
  value,
  reportingYear,
  onChange,
  disabled,
  className,
}: NavEquipmentLifespanSectionProps) {
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
  }, [v.economic_book_value, v.tax_book_value, v.original_cost, v.acquisition_year, v.economic_useful_life_years, reportingYear])

  const update = (patch: Partial<NonNullable<NavEquipmentLifespanSectionProps['value']>>) => {
    onChange({ ...v, ...patch })
  }

  return (
    <section
      className={`rounded-xl border border-foreground/[0.08] bg-background ${className ?? ''}`}
      aria-label="Equipment economic-lifespan revaluation"
    >
      <header className="border-b border-foreground/[0.06] px-4 py-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
          Equipment / PP&E (Materieel) revaluation
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
          Reconstruct economic book value from original cost, age and useful life. Captures the gap
          left by accelerated tax depreciation.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3">
        <CurrencyInput
          label="Original cost (acquisition)"
          value={v.original_cost}
          onChange={(n) => update({ original_cost: n })}
          size="sm"
          placeholder="0"
          disabled={disabled}
          truncateLabel={false}
        />
        <CurrencyInput
          label="Tax book value (current)"
          value={v.tax_book_value}
          onChange={(n) => update({ tax_book_value: n })}
          size="sm"
          placeholder="0"
          disabled={disabled}
          truncateLabel={false}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
            Acquisition year
          </span>
          <input
            type="number"
            min={1980}
            max={(reportingYear ?? new Date().getFullYear()) + 0}
            value={v.acquisition_year ?? ''}
            onChange={(e) =>
              update({
                acquisition_year:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder="2018"
            disabled={disabled}
            className="rounded-lg border border-foreground/[0.12] bg-background px-2.5 py-1.5 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">
            Economic useful life (years)
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
          label="Economic book value (override, optional)"
          value={v.economic_book_value}
          onChange={(n) => update({ economic_book_value: n })}
          size="sm"
          placeholder="Auto from formula"
          disabled={disabled}
          truncateLabel={false}
        />
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 text-[12px]">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Economic book</dt>
          <dd className="mt-0.5 tabular-nums text-foreground/75">
            {computed ? currency.format(computed.economic_book) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Tax book</dt>
          <dd className="mt-0.5 tabular-nums text-foreground/75">
            {v.tax_book_value != null ? currency.format(v.tax_book_value) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Meerwaarde</dt>
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
    </section>
  )
}
