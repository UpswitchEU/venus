'use client'

import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/design-system/components/Table'
import { cn } from '@/design-system/utils'
import { motion } from 'framer-motion'
import { Table2, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { CurrencyInput } from '../CurrencyInput'
import { ProvenanceDot } from '../ProvenanceDot'
import { SpotlightFieldWrapper } from '../SpotlightFieldWrapper'

export interface DcfForecastProjectionRow {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  nwc_change?: number
  isForecast?: boolean
}

interface DcfForecastProjectionTableProps {
  rows: DcfForecastProjectionRow[]
  disabled?: boolean
  fieldValidation?: {
    warnings: Record<string, string>
    errors: Record<string, string>
  }
  onRemoveYear?: (year: string) => void
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'nwc_change',
    value: number
  ) => void
}

const headingId = 'dcf-projection-table-heading'

export function DcfForecastProjectionTable({
  rows,
  disabled,
  fieldValidation,
  onRemoveYear,
  onChange,
}: DcfForecastProjectionTableProps) {
  const t = useTranslations('manualInput')
  const tMethod = useTranslations('manualInput.methodSelector')
  const commonT = useTranslations('common')
  const locale = useLocale()

  if (rows.length === 0) {
    return null
  }

  const sortedRows = [...rows].sort((a, b) => Number(a.year) - Number(b.year))
  const captionText = `${t('dcfProjectionTable.title')}. ${t('dcfProjectionTable.description')}`
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  const formatPercent = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      aria-labelledby={headingId}
      className="space-y-3"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10"
            aria-hidden
          >
            <Table2 className="h-3 w-3 text-primary" />
          </div>
          <h3 id={headingId} className="text-sm font-medium text-foreground">
            {t('dcfProjectionTable.title')}
          </h3>
          <span className="rounded-full bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {tMethod('recommendedForMethod', { method: 'DCF' })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{t('dcfProjectionTable.description')}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-primary/15 bg-primary/[0.02]">
        <TableRoot size="sm" className="min-w-[820px] w-full border-collapse">
          <TableCaption className="sr-only">{captionText}</TableCaption>
          <TableHeader className="border-b border-primary/10 bg-primary/[0.03] [&_th]:border-primary/10">
            <TableRow className="border-foreground/10 hover:bg-transparent">
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('dcfProjectionTable.columns.year')}
              </TableHead>
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('fields.revenue')}
              </TableHead>
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('fields.ebitda')}
              </TableHead>
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('fields.capex')}
              </TableHead>
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('fields.nwcChange')}
              </TableHead>
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('dcfProjectionTable.columns.ebitdaMarginPct')}
              </TableHead>
              <TableHead
                scope="col"
                className={cn(
                  'h-auto px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55'
                )}
              >
                {t('dcfProjectionTable.columns.fcff')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const hasPartialCoreFields =
                ((Number(row.revenue) || 0) > 0 && (Number(row.ebitda) || 0) === 0) ||
                ((Number(row.ebitda) || 0) !== 0 && (Number(row.revenue) || 0) <= 0)
              const ebitdaMarginPct =
                row.revenue > 0 && Number.isFinite(row.ebitda / row.revenue)
                  ? (row.ebitda / row.revenue) * 100
                  : null
              const fcff = row.ebitda - (row.capex ?? 0) - (row.nwc_change ?? 0)

              return (
                <TableRow key={row.year} className="align-top last:border-b-0">
                  <TableCell className="px-3 py-3 align-top">
                    <div className="text-sm font-semibold text-foreground">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 whitespace-nowrap">
                          <span>{row.year}</span>
                          {row.isForecast && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/70">
                              {t('forecastLabel')}
                            </span>
                          )}
                        </div>
                        {onRemoveYear && (
                          <button
                            type="button"
                            onClick={() => onRemoveYear(row.year)}
                            disabled={disabled}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/15 text-primary/60 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`${commonT('actions.delete')} ${t('forecastLabel').toLowerCase()} ${row.year}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {hasPartialCoreFields && (
                        <p className="mt-1 text-[10px] font-normal text-warning whitespace-normal">
                          {t('fillBothFields')}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <SpotlightFieldWrapper fieldName="revenue" fiscalYear={row.year}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <ProvenanceDot fieldName="revenue" fiscalYear={row.year} />
                          <CurrencyInput
                            value={row.revenue}
                            onChange={(value) => onChange(row.year, 'revenue', value ?? 0)}
                            size="sm"
                            placeholder="1.500.000"
                            disabled={disabled}
                            ariaLabel={`${t('fields.revenue')} ${row.year}`}
                          />
                        </div>
                        {(fieldValidation?.errors[`revenue-${row.year}`] ||
                          fieldValidation?.warnings[`revenue-${row.year}`]) && (
                          <p
                            className={`mt-1 text-[10px] ${
                              fieldValidation?.errors[`revenue-${row.year}`]
                                ? 'text-destructive'
                                : 'text-warning'
                            }`}
                          >
                            {fieldValidation?.errors[`revenue-${row.year}`] ||
                              fieldValidation?.warnings[`revenue-${row.year}`]}
                          </p>
                        )}
                      </div>
                    </SpotlightFieldWrapper>
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <SpotlightFieldWrapper fieldName="ebitda" fiscalYear={row.year}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <ProvenanceDot fieldName="ebitda" fiscalYear={row.year} />
                          <CurrencyInput
                            value={row.ebitda}
                            onChange={(value) => onChange(row.year, 'ebitda', value ?? 0)}
                            size="sm"
                            placeholder="250.000"
                            disabled={disabled}
                            ariaLabel={`${t('fields.ebitda')} ${row.year}`}
                          />
                        </div>
                        {(fieldValidation?.errors[`ebitda-${row.year}`] ||
                          fieldValidation?.warnings[`ebitda-${row.year}`] ||
                          fieldValidation?.warnings[`margin-${row.year}`]) && (
                          <p
                            className={`mt-1 text-[10px] ${
                              fieldValidation?.errors[`ebitda-${row.year}`]
                                ? 'text-destructive'
                                : 'text-warning'
                            }`}
                          >
                            {fieldValidation?.errors[`ebitda-${row.year}`] ||
                              fieldValidation?.warnings[`ebitda-${row.year}`] ||
                              fieldValidation?.warnings[`margin-${row.year}`]}
                          </p>
                        )}
                      </div>
                    </SpotlightFieldWrapper>
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <SpotlightFieldWrapper fieldName="capex" fiscalYear={row.year}>
                      <div className="flex items-center gap-1.5">
                        <ProvenanceDot fieldName="capex" fiscalYear={row.year} />
                        <CurrencyInput
                          value={row.capex}
                          onChange={(value) => onChange(row.year, 'capex', value ?? 0)}
                          size="sm"
                          placeholder="45.000"
                          disabled={disabled}
                          ariaLabel={`${t('fields.capex')} ${row.year}`}
                        />
                      </div>
                    </SpotlightFieldWrapper>
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <SpotlightFieldWrapper fieldName="nwc_change" fiscalYear={row.year}>
                      <div className="flex items-center gap-1.5">
                        <ProvenanceDot fieldName="nwc_change" fiscalYear={row.year} />
                        <CurrencyInput
                          value={row.nwc_change}
                          onChange={(value) => onChange(row.year, 'nwc_change', value ?? 0)}
                          size="sm"
                          placeholder="20.000"
                          disabled={disabled}
                          allowNegative
                          ariaLabel={`${t('fields.nwcChange')} ${row.year}`}
                        />
                      </div>
                    </SpotlightFieldWrapper>
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top text-sm font-medium text-foreground/65">
                    {ebitdaMarginPct == null ? '--' : `${formatPercent(ebitdaMarginPct)}%`}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top text-sm font-medium text-foreground/65">
                    {formatCurrency(fcff)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </TableRoot>
      </div>
    </motion.section>
  )
}
