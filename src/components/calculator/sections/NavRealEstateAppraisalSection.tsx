'use client'

/**
 * Real Estate Book → Appraisal Swap
 * ---------------------------------
 * Replaces the single `nav_real_estate_adjustment` delta input with an
 * explicit two-input swap (book value + appraisal value). The component
 * computes the meerwaarde live and writes both raw fields to form state
 * so the engine can render the audit trail (`details.real_estate_revaluation`).
 */

import { useMemo } from 'react'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'

export interface NavRealEstateAppraisalSectionProps {
  bookValue?: number
  appraisalValue?: number
  /**
   * Per-asset deferred tax rate (% of meerwaarde) for real estate.
   * Optional — defaults to the engine's resolved CIT rate.
   */
  deferredTaxRatePct?: number
  onChange: (field: string, value: number | undefined) => void
  disabled?: boolean
  className?: string
}

export function NavRealEstateAppraisalSection({
  bookValue,
  appraisalValue,
  deferredTaxRatePct,
  onChange,
  disabled,
  className,
}: NavRealEstateAppraisalSectionProps) {
  const { currency } = useManualPreviewFormatters()
  const meerwaarde = useMemo(() => {
    if (bookValue == null || appraisalValue == null) return null
    if (!Number.isFinite(bookValue) || !Number.isFinite(appraisalValue)) return null
    return appraisalValue - bookValue
  }, [bookValue, appraisalValue])

  const deferredTax = useMemo(() => {
    if (meerwaarde == null || meerwaarde <= 0) return 0
    if (deferredTaxRatePct == null || !Number.isFinite(deferredTaxRatePct)) return null
    return meerwaarde * (deferredTaxRatePct / 100)
  }, [meerwaarde, deferredTaxRatePct])

  return (
    <section
      className={`rounded-xl border border-foreground/[0.08] bg-background ${className ?? ''}`}
      aria-label="Real estate book to appraisal swap"
    >
      <header className="border-b border-foreground/[0.06] px-4 py-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-foreground/65">
          Real estate (Onroerend goed) revaluation
        </h4>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">
          Enter book value and an independent appraisal — the engine derives the meerwaarde and the
          latente belasting.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3">
        <CurrencyInput
          label="Book value"
          value={bookValue}
          onChange={(v) => onChange('nav_real_estate_book_value', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
          truncateLabel={false}
        />
        <CurrencyInput
          label="Independent appraisal value"
          value={appraisalValue}
          onChange={(v) => onChange('nav_real_estate_appraisal_value', v)}
          size="sm"
          placeholder="0"
          disabled={disabled}
          truncateLabel={false}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 text-[12px]">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-foreground/45">Meerwaarde</dt>
          <dd
            className={`mt-0.5 tabular-nums font-semibold ${
              meerwaarde == null
                ? 'text-foreground/45'
                : meerwaarde >= 0
                  ? 'text-emerald-600'
                  : 'text-rose-500'
            }`}
          >
            {meerwaarde == null ? '—' : currency.format(meerwaarde)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-foreground/45">
            Deferred tax {deferredTaxRatePct != null ? `@ ${deferredTaxRatePct.toFixed(1)}%` : ''}
          </dt>
          <dd className="mt-0.5 tabular-nums text-rose-500">
            {deferredTax == null
              ? '—'
              : deferredTax === 0
                ? currency.format(0)
                : `−${currency.format(deferredTax)}`}
          </dd>
        </div>
      </dl>
    </section>
  )
}
