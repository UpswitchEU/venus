'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import { CurrencyInput } from '../CurrencyInput'

export interface DcfYearDetail {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  depreciation?: number
  nwc_change?: number
}

interface DcfForecastYearDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  yearDetail: DcfYearDetail
  globalCapexPct?: number
  globalNwcPct?: number
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change',
    value: number
  ) => void
  disabled?: boolean
}

export function DcfForecastYearDetailModal({
  open,
  onOpenChange,
  yearDetail,
  globalCapexPct,
  globalNwcPct,
  onChange,
  disabled,
}: DcfForecastYearDetailModalProps) {
  const t = useTranslations('manualInput')
  const locale = useLocale()

  const fmt = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value),
    [locale]
  )

  const fmtPct = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value),
    [locale]
  )

  const effectiveCapex =
    yearDetail.capex ??
    (globalCapexPct != null && yearDetail.revenue > 0
      ? Math.round(yearDetail.revenue * (globalCapexPct / 100))
      : 0)

  const effectiveNwcChange =
    yearDetail.nwc_change ??
    (globalNwcPct != null && yearDetail.revenue > 0
      ? Math.round(yearDetail.revenue * (globalNwcPct / 100))
      : 0)

  const ebitdaMarginPct =
    yearDetail.revenue > 0 && Number.isFinite(yearDetail.ebitda / yearDetail.revenue)
      ? (yearDetail.ebitda / yearDetail.revenue) * 100
      : null

  const fcff = yearDetail.ebitda - effectiveCapex - effectiveNwcChange

  const handleFieldChange = useCallback(
    (
      field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change',
      value: number | undefined
    ) => {
      onChange(yearDetail.year, field, value ?? 0)
    },
    [onChange, yearDetail.year]
  )

  const summaryRows = [
    { label: t('fields.revenue'), value: yearDetail.revenue > 0 ? fmt(yearDetail.revenue) : '—' },
    { label: t('fields.ebitda'), value: yearDetail.ebitda !== 0 ? fmt(yearDetail.ebitda) : '—' },
    {
      label: t('dcfForecastCard.ebitdaMargin'),
      value: ebitdaMarginPct != null ? `${fmtPct(ebitdaMarginPct)}%` : '—',
    },
    { label: t('dcfYearDetail.fcff'), value: fmt(fcff) },
  ]

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="lg"
        description={t('dcfYearDetail.modalDescription', { year: yearDetail.year })}
      >
        <ModalHeader>
          <ModalTitle>{t('dcfYearDetail.title', { year: yearDetail.year })}</ModalTitle>
        </ModalHeader>

        <div className="space-y-8">
          <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('dcfYearDetail.summaryStrip')}
            </p>
            <div className="space-y-4">
              {summaryRows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col gap-1 border-b border-foreground/[0.06] pb-4 last:border-0 last:pb-0"
                >
                  <p className="text-xs text-foreground/55">{row.label}</p>
                  <p className="text-base font-semibold tabular-nums text-foreground">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('dcfYearDetail.toplineSection')}
            </h4>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <CurrencyInput
                label={t('fields.revenue')}
                value={yearDetail.revenue}
                onChange={(v) => handleFieldChange('revenue', v)}
                size="md"
                placeholder="1.500.000"
                disabled={disabled}
              />
              <CurrencyInput
                label={t('fields.ebitda')}
                value={yearDetail.ebitda}
                onChange={(v) => handleFieldChange('ebitda', v)}
                size="md"
                placeholder="250.000"
                disabled={disabled}
                allowNegative
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('dcfYearDetail.cashFlowDrivers')}
            </h4>
            <div className="grid grid-cols-1 gap-5">
              <CurrencyInput
                label={t('dcfYearDetail.capex')}
                value={yearDetail.capex}
                onChange={(v) => handleFieldChange('capex', v)}
                size="md"
                placeholder={effectiveCapex > 0 ? String(effectiveCapex) : undefined}
                disabled={disabled}
              />
              <CurrencyInput
                label={t('dcfYearDetail.depreciation')}
                value={yearDetail.depreciation}
                onChange={(v) => handleFieldChange('depreciation', v)}
                size="md"
                placeholder="15.000"
                disabled={disabled}
              />
              <CurrencyInput
                label={t('dcfYearDetail.nwcChange')}
                value={yearDetail.nwc_change}
                onChange={(v) => handleFieldChange('nwc_change', v)}
                size="md"
                placeholder={
                  effectiveNwcChange !== 0 ? String(Math.abs(effectiveNwcChange)) : undefined
                }
                disabled={disabled}
                allowNegative
              />
            </div>
            {(globalCapexPct != null || globalNwcPct != null) && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('dcfYearDetail.prefillHint')}
              </p>
            )}
          </div>
        </div>

        <ModalFooter className="mt-8 border-t border-foreground/[0.06] pt-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-w-[160px] items-center justify-center rounded-xl border border-primary/25 bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {t('dcfYearDetail.done')}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
