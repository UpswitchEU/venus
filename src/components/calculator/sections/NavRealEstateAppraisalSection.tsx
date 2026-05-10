'use client'

/**
 * Real Estate Book → Appraisal Swap
 * ---------------------------------
 * Replaces the single `nav_real_estate_adjustment` delta input with an
 * explicit two-input swap (book value + appraisal value). The component
 * computes the meerwaarde live and writes both raw fields to form state
 * so the engine can render the audit trail (`details.real_estate_revaluation`).
 *
 * Round-1 fix B1: i18n + step badge — was previously rendered as a
 * stand-alone card with hardcoded EN+NL hybrid copy ("Onroerend goed",
 * "meerwaarde", "latente belasting") and no step indicator. Now it
 * inherits the same `ValuationSectionHeader` rhythm as the rest of the
 * left panel and pulls every label from the i18n bundle.
 */

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export interface NavRealEstateAppraisalSectionProps {
  /**
   * Sub-step indicator. NAV is one method that decomposes into multiple
   * defensible sub-cards — we letter them (5a / 5b / 5c) to keep the
   * top-level numbering sequence intact.
   */
  step: string | number
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
  step,
  bookValue,
  appraisalValue,
  deferredTaxRatePct,
  onChange,
  disabled,
  className,
}: NavRealEstateAppraisalSectionProps) {
  const t = useTranslations('manualInput.methodSelector.navRealEstate')
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

  const sectionComplete = bookValue != null && appraisalValue != null

  return (
    <section className={`mt-6 space-y-4 pt-2 ${className ?? ''}`} aria-label={t('ariaLabel')}>
      <ValuationSectionHeader step={step} complete={sectionComplete} title={t('title')} />

      <div className="rounded-xl border border-foreground/[0.08] bg-background">
        <p className="border-b border-foreground/[0.06] px-4 py-3 text-[11px] leading-snug text-foreground/55">
          {t('description')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3">
          <CurrencyInput
            label={t('bookValueLabel')}
            value={bookValue}
            onChange={(v) => onChange('nav_real_estate_book_value', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('bookValueDesc')}
            truncateLabel={false}
          />
          <CurrencyInput
            label={t('appraisalValueLabel')}
            value={appraisalValue}
            onChange={(v) => onChange('nav_real_estate_appraisal_value', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('appraisalValueDesc')}
            truncateLabel={false}
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 text-[12px]">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground/45">
              {t('meerwaardeLabel')}
            </dt>
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
              {t('deferredTaxLabel')}
              {deferredTaxRatePct != null ? ` @ ${deferredTaxRatePct.toFixed(1)}%` : ''}
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
      </div>
    </section>
  )
}
