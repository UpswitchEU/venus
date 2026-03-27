'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
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
  const tMethod = useTranslations('manualInput.methodSelector')
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

  const effectiveCapex = yearDetail.capex ?? (
    globalCapexPct != null && yearDetail.revenue > 0
      ? Math.round(yearDetail.revenue * (globalCapexPct / 100))
      : 0
  )

  const effectiveNwcChange = yearDetail.nwc_change ?? (
    globalNwcPct != null && yearDetail.revenue > 0
      ? Math.round(yearDetail.revenue * (globalNwcPct / 100))
      : 0
  )

  const ebitdaMarginPct =
    yearDetail.revenue > 0 && Number.isFinite(yearDetail.ebitda / yearDetail.revenue)
      ? (yearDetail.ebitda / yearDetail.revenue) * 100
      : null

  const fcff = yearDetail.ebitda - effectiveCapex - effectiveNwcChange

  const handleFieldChange = useCallback(
    (field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change', value: number | undefined) => {
      onChange(yearDetail.year, field, value ?? 0)
    },
    [onChange, yearDetail.year]
  )

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg" description={t('dcfYearDetail.modalDescription', { year: yearDetail.year })}>
        <ModalHeader>
          <ModalTitle>
            {t('dcfYearDetail.title', { year: yearDetail.year })}
          </ModalTitle>
        </ModalHeader>

        <div className="space-y-5">
          {/* Topline summary */}
          <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                  {t('fields.revenue')}
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {yearDetail.revenue > 0 ? fmt(yearDetail.revenue) : '--'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                  {t('fields.ebitda')}
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {yearDetail.ebitda !== 0 ? fmt(yearDetail.ebitda) : '--'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                  {t('dcfForecastCard.ebitdaMargin')}
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {ebitdaMarginPct != null ? `${fmtPct(ebitdaMarginPct)}%` : '--'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                  {t('dcfYearDetail.fcff')}
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {fmt(fcff)}
                </p>
              </div>
            </div>
          </div>

          {/* Editable revenue & EBITDA */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
              {t('dcfYearDetail.toplineSection')}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CurrencyInput
                label={t('fields.revenue')}
                value={yearDetail.revenue}
                onChange={(v) => handleFieldChange('revenue', v)}
                size="sm"
                placeholder="1.500.000"
                disabled={disabled}
              />
              <CurrencyInput
                label={t('fields.ebitda')}
                value={yearDetail.ebitda}
                onChange={(v) => handleFieldChange('ebitda', v)}
                size="sm"
                placeholder="250.000"
                disabled={disabled}
                allowNegative
              />
            </div>
          </div>

          {/* Cash flow drivers */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
              {t('dcfYearDetail.cashFlowDrivers')}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CurrencyInput
                label={tMethod('fields.dcfCapexPct').replace(/ \(.*\)/, '') || 'CapEx'}
                value={yearDetail.capex}
                onChange={(v) => handleFieldChange('capex', v)}
                size="sm"
                placeholder={effectiveCapex > 0 ? String(effectiveCapex) : '45.000'}
                disabled={disabled}
              />
              <CurrencyInput
                label={t('dcfYearDetail.depreciation')}
                value={yearDetail.depreciation}
                onChange={(v) => handleFieldChange('depreciation', v)}
                size="sm"
                placeholder="15.000"
                disabled={disabled}
              />
              <CurrencyInput
                label={t('dcfYearDetail.nwcChange')}
                value={yearDetail.nwc_change}
                onChange={(v) => handleFieldChange('nwc_change', v)}
                size="sm"
                placeholder={effectiveNwcChange !== 0 ? String(Math.abs(effectiveNwcChange)) : '20.000'}
                disabled={disabled}
                allowNegative
              />
            </div>
            {(globalCapexPct != null || globalNwcPct != null) && (
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t('dcfYearDetail.prefillHint')}
              </p>
            )}
          </div>
        </div>

        <ModalFooter className="mt-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/35 hover:bg-primary/5"
          >
            {t('dcfYearDetail.done')}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
