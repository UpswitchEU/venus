'use client'

import { motion } from 'framer-motion'
import { Plus, Table2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { cn } from '@/design-system/utils'
import { DcfFcffOnlyTable } from './DcfFcffOnlyTable'
import type { DcfForecastRow } from './DcfForecastTypes'
import { DcfProjectionTable } from './DcfProjectionTable'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
} from './dcfEngineDefaults'
import {
  buildProjectionRowFromForecastRow,
  type DcfProjectionPreviewRow,
} from './dcfProjectionPreview'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export type DcfInputMode = 'ebitda' | 'fcff_only'

interface DcfForecastWorkspaceProps {
  /** Step index after financial history (default 4). */
  step?: number
  /** When false, forecast input mode toggle is rendered by the parent (defaults-first layout). */
  showModeToggle?: boolean
  forecastRows: DcfForecastRow[]
  latestHistoricalRevenue?: number
  /** Last actual historical EBITDA (same base year as latestHistoricalRevenue). */
  latestHistoricalEbitda?: number
  fieldValidation?: {
    warnings: Record<string, string>
    errors: Record<string, string>
  }
  globalCapexPct?: number
  globalDaPct?: number
  globalNwcPct?: number
  globalTaxRatePct?: number
  disabled?: boolean
  canAddYear: boolean
  nextForecastYear: number
  dcfInputMode: DcfInputMode
  onDcfInputModeChange: (mode: DcfInputMode) => void
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change' | 'free_cash_flow',
    value: number | undefined
  ) => void
  onAddYear: () => void
  /** Opens parent confirmation to remove all forecast years (DCF list no longer shows per-year remove). */
  onRequestRemoveForecastYears?: () => void
}

export function DcfForecastWorkspace({
  step = 4,
  showModeToggle = true,
  forecastRows,
  latestHistoricalRevenue,
  latestHistoricalEbitda: latestHistoricalEbitdaProp,
  fieldValidation,
  globalCapexPct,
  globalDaPct,
  globalNwcPct,
  globalTaxRatePct,
  disabled,
  canAddYear,
  nextForecastYear,
  dcfInputMode,
  onDcfInputModeChange,
  onChange,
  onAddYear,
  onRequestRemoveForecastYears,
}: DcfForecastWorkspaceProps) {
  const t = useTranslations('manualInput')
  const locale = useLocale()
  const [tableOpen, setTableOpen] = useState(false)

  const sortedRows = useMemo(
    () => [...forecastRows].sort((a, b) => Number(a.year) - Number(b.year)),
    [forecastRows]
  )

  const forecastSectionComplete = useMemo(() => {
    if (sortedRows.length === 0) return false
    if (dcfInputMode === 'fcff_only') {
      return sortedRows.every(
        (r) => typeof r.free_cash_flow === 'number' && Number.isFinite(r.free_cash_flow)
      )
    }
    return sortedRows.every((r) => !(r.revenue <= 0 && r.ebitda === 0))
  }, [sortedRows, dcfInputMode])

  const baseYear = useMemo(() => {
    if (sortedRows.length === 0) return undefined
    return String(Number(sortedRows[0].year) - 1)
  }, [sortedRows])

  const projectionRows: DcfProjectionPreviewRow[] = useMemo(() => {
    if (sortedRows.length === 0) return []
    const globals = {
      daPct: globalDaPct ?? DCF_DEFAULT_DA_PCT,
      capexPct: globalCapexPct ?? DCF_DEFAULT_CAPEX_PCT,
      nwcPct: globalNwcPct ?? DCF_DEFAULT_NWC_PCT,
      taxRatePct: globalTaxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT,
    }
    return sortedRows.map((row) => buildProjectionRowFromForecastRow(row, globals))
  }, [sortedRows, globalCapexPct, globalDaPct, globalNwcPct, globalTaxRatePct])

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

  const fmtPct = useCallback((value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${value.toFixed(1)}%`
  }, [])

  const modeSegmentOptions = useMemo(
    () => [
      { value: 'ebitda' as const, label: t('dcfInputMode.ebitda') },
      { value: 'fcff_only' as const, label: t('dcfInputMode.fcffOnly') },
    ],
    [t]
  )
  const inlineGridDerived = useMemo(() => {
    if (projectionRows.length === 0) return []
    return projectionRows.map((row, i) => {
      const prevRev = i === 0 ? (latestHistoricalRevenue ?? 0) : projectionRows[i - 1].revenue
      const yoyPct = prevRev > 0 ? ((row.revenue - prevRev) / prevRev) * 100 : null
      const marginPct = row.revenue > 0 ? (row.ebitda / row.revenue) * 100 : 0
      const capexPctOfRev = row.revenue > 0 ? (row.capex / row.revenue) * 100 : 0
      const daPctOfRev = row.revenue > 0 ? (row.da / row.revenue) * 100 : 0
      const nwcPctOfRev = row.revenue > 0 ? (row.nwcChange / row.revenue) * 100 : 0
      return { yoyPct, marginPct, capexPctOfRev, daPctOfRev, nwcPctOfRev }
    })
  }, [projectionRows, latestHistoricalRevenue])

  if (sortedRows.length === 0) return null

  const hasWarnings =
    dcfInputMode === 'fcff_only'
      ? sortedRows.some(
          (row) =>
            fieldValidation?.errors[`fcff-${row.year}`] ||
            fieldValidation?.warnings[`fcff-${row.year}`]
        )
      : sortedRows.some(
          (row) =>
            fieldValidation?.errors[`revenue-${row.year}`] ||
            fieldValidation?.warnings[`revenue-${row.year}`] ||
            fieldValidation?.errors[`ebitda-${row.year}`] ||
            fieldValidation?.warnings[`ebitda-${row.year}`]
        )

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className={cn(showModeToggle ? 'mt-6' : 'mt-4', 'space-y-3 pt-2')}
        aria-label={
          dcfInputMode === 'fcff_only'
            ? t('dcfForecastWorkspace.sectionLabelFcffOnly')
            : t('dcfForecastWorkspace.sectionLabel')
        }
      >
        <ValuationSectionHeader
          complete={forecastSectionComplete}
          step={step}
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                {dcfInputMode === 'fcff_only'
                  ? t('dcfForecastWorkspace.titleFcffOnly')
                  : t('dcfForecastWorkspace.title')}
              </span>
              <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
                {t('dcfForecastWorkspace.yearCount', { count: sortedRows.length })}
              </span>
            </span>
          }
        />
        {dcfInputMode === 'ebitda' && (
          <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
            {t('dcfForecastWorkspace.ebitdaLiveSubtitle')}
          </p>
        )}

        {showModeToggle && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-medium text-foreground/70">
              {t('dcfInputMode.label')}
            </span>
            <SegmentedControl
              value={dcfInputMode}
              onChange={(v) => onDcfInputModeChange(v as DcfInputMode)}
              options={modeSegmentOptions}
              disabled={disabled}
              size="sm"
              className="max-w-md"
            />
          </div>
        )}

        {dcfInputMode === 'fcff_only' ? (
          <div className="space-y-3">
            <DcfFcffOnlyTable
              forecastRows={sortedRows}
              disabled={disabled}
              fieldValidation={fieldValidation}
              onChange={(year, value) => onChange(year, 'free_cash_flow', value)}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('dcfForecastWorkspace.fcffOnlyAfterTableHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projectionRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {t('dcfForecastWorkspace.inlineGridFormulaShort')}
                </p>
                <button
                  type="button"
                  onClick={() => setTableOpen(true)}
                  disabled={disabled}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-foreground/10 bg-background px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/25 hover:bg-primary/[0.04]',
                    hasWarnings && 'border-warning/30 text-warning',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <Table2 className="h-3.5 w-3.5" aria-hidden />
                  {t('dcfProjectionTable.triggerAction')}
                </button>
              </div>
            )}
            {projectionRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-foreground/[0.08] bg-foreground/[0.02]">
                <table className="w-full min-w-[880px] border-collapse text-sm tabular-nums">
                  <caption className="sr-only">
                    {t('dcfForecastWorkspace.inlinePreviewAria')}
                  </caption>
                  <thead>
                    <tr className="border-b border-foreground/[0.08] text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfFcffOnlyTable.year')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfProjectionTable.rows.revenue')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfForecastWorkspace.colYoY')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfProjectionTable.rows.ebitda')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfForecastWorkspace.colMarginPct')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfForecastWorkspace.colCapexPct')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfForecastWorkspace.colDaPct')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfForecastWorkspace.colNwcPct')}
                      </th>
                      <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                        {t('dcfProjectionTable.rows.fcff')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectionRows.map((row, idx) => {
                      const d = inlineGridDerived[idx]
                      return (
                        <tr
                          key={row.year}
                          className="border-b border-foreground/[0.05] last:border-0"
                        >
                          <th
                            scope="row"
                            className="whitespace-nowrap px-2 py-2 font-medium text-foreground/90 sm:px-3"
                          >
                            {row.year}
                          </th>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmt(row.revenue)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmtPct(d?.yoyPct)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmt(row.ebitda)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmtPct(d?.marginPct)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmtPct(d?.capexPctOfRev)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmtPct(d?.daPctOfRev)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-foreground/80 sm:px-3">
                            {fmtPct(d?.nwcPctOfRev)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-medium text-foreground sm:px-3">
                            {fmt(row.fcff)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {canAddYear && (
          <motion.button
            type="button"
            onClick={onAddYear}
            disabled={disabled}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/20 p-3 text-sm text-primary/50 transition-colors hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary/70 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${t('addForecastYear')} ${nextForecastYear}`}
          >
            <Plus className="h-4 w-4" />
            <span>
              {t('addForecastYear')} ({nextForecastYear})
            </span>
          </motion.button>
        )}

        {onRequestRemoveForecastYears && (
          <button
            type="button"
            onClick={onRequestRemoveForecastYears}
            disabled={disabled}
            className="w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('dcfForecastWorkspace.removeAllForecastYears')}
          </button>
        )}
      </motion.section>

      {dcfInputMode === 'ebitda' && (
        <DcfProjectionTable
          open={tableOpen}
          onOpenChange={setTableOpen}
          forecastRows={sortedRows}
          projectionRows={projectionRows}
          latestHistoricalRevenue={latestHistoricalRevenue}
          latestHistoricalEbitda={latestHistoricalEbitdaProp}
          baseYear={baseYear}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </>
  )
}
