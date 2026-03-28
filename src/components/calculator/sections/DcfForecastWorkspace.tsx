'use client'

import { motion } from 'framer-motion'
import { Plus, Table2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { cn } from '@/design-system/utils'
import { DcfFcffOnlyTable } from './DcfFcffOnlyTable'
import type { DcfForecastRow } from './DcfForecastTypes'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import { DcfProjectionTable } from './DcfProjectionTable'
import {
  buildProjectionRowFromForecastRow,
  type DcfProjectionPreviewRow,
} from './dcfProjectionPreview'
import { ValuationSectionHeader } from './ValuationSectionHeader'

export type DcfInputMode = 'ebitda' | 'fcff_only'

interface DcfForecastWorkspaceProps {
  /** Step index after financial history (default 4). */
  step?: number
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
  /** Shown on the forecast CTA for quick accountant context */
  dcfWaccPct?: number
  terminalValueMethod?: TerminalValueMethod
  dcfTerminalGrowthPct?: number
  dcfExitMultiple?: number
  disabled?: boolean
  canAddYear: boolean
  nextForecastYear: number
  dcfInputMode: DcfInputMode
  onDcfInputModeChange: (mode: DcfInputMode) => void
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change' | 'free_cash_flow',
    value: number
  ) => void
  onAddYear: () => void
  /** Opens parent confirmation to remove all forecast years (DCF list no longer shows per-year remove). */
  onRequestRemoveForecastYears?: () => void
}

export function DcfForecastWorkspace({
  step = 4,
  forecastRows,
  latestHistoricalRevenue,
  latestHistoricalEbitda: latestHistoricalEbitdaProp,
  fieldValidation,
  globalCapexPct,
  globalDaPct,
  globalNwcPct,
  globalTaxRatePct,
  dcfWaccPct,
  terminalValueMethod,
  dcfTerminalGrowthPct,
  dcfExitMultiple,
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
      daPct: globalDaPct ?? 3,
      capexPct: globalCapexPct ?? 4,
      nwcPct: globalNwcPct ?? 1.5,
      taxRatePct: globalTaxRatePct ?? 25,
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

  const modeSegmentOptions = useMemo(
    () => [
      { value: 'ebitda' as const, label: t('dcfInputMode.ebitda') },
      { value: 'fcff_only' as const, label: t('dcfInputMode.fcffOnly') },
    ],
    [t]
  )
  const firstProjection = projectionRows[0]
  const lastProjection = projectionRows[projectionRows.length - 1]

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
        className="mt-6 space-y-3 pt-2"
        aria-label={t('dcfForecastWorkspace.sectionLabel')}
      >
        <ValuationSectionHeader
          complete={forecastSectionComplete}
          step={step}
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{t('dcfForecastWorkspace.title')}</span>
              <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
                {t('dcfForecastWorkspace.yearCount', { count: sortedRows.length })}
              </span>
            </span>
          }
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-medium text-foreground/70">{t('dcfInputMode.label')}</span>
          <SegmentedControl
            value={dcfInputMode}
            onChange={(v) => onDcfInputModeChange(v as DcfInputMode)}
            options={modeSegmentOptions}
            disabled={disabled}
            size="sm"
            className="max-w-md"
          />
        </div>

        <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3">
          <p className="text-xs font-medium text-foreground/80">
            {dcfInputMode === 'fcff_only'
              ? t('dcfForecastWorkspace.modeTitleFcffOnly')
              : t('dcfForecastWorkspace.modeTitleEbitda')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {dcfInputMode === 'fcff_only'
              ? t('dcfForecastWorkspace.descriptionFcffOnly')
              : t('dcfForecastWorkspace.description')}
          </p>
        </div>

        {dcfInputMode === 'fcff_only' ? (
          <div className="space-y-3">
            <DcfFcffOnlyTable
              forecastRows={sortedRows}
              disabled={disabled}
              fieldValidation={fieldValidation}
              onChange={(year, value) => onChange(year, 'free_cash_flow', value)}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('dcfForecastWorkspace.fcffOnlyYearlyHint')}
            </p>
            {(dcfWaccPct != null && dcfWaccPct > 0) || terminalValueMethod ? (
              <p className="text-[11px] leading-relaxed text-foreground/45">
                {dcfWaccPct != null && dcfWaccPct > 0 && (
                  <span>{t('dcfProjectionTable.triggerWacc', { pct: dcfWaccPct.toFixed(1) })}</span>
                )}
                {terminalValueMethod === 'perpetual_growth' &&
                  dcfTerminalGrowthPct != null &&
                  Number.isFinite(dcfTerminalGrowthPct) && (
                    <span className="ml-2">
                      {t('dcfProjectionTable.triggerTerminalGrowth', {
                        pct: dcfTerminalGrowthPct.toFixed(1),
                      })}
                    </span>
                  )}
                {terminalValueMethod === 'exit_multiple' &&
                  dcfExitMultiple != null &&
                  Number.isFinite(dcfExitMultiple) && (
                    <span className="ml-2">
                      {t('dcfProjectionTable.triggerExitMultiple', {
                        x: dcfExitMultiple.toFixed(1),
                      })}
                    </span>
                  )}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setTableOpen(true)}
              disabled={disabled}
              className={cn(
                'group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
                hasWarnings
                  ? 'border-warning/30 bg-warning/[0.04]'
                  : forecastSectionComplete
                    ? 'border-primary/20 bg-primary/[0.03] hover:border-primary/35 hover:bg-primary/[0.06]'
                    : 'border-dashed border-primary/20 bg-primary/[0.02] hover:border-primary/30 hover:bg-primary/[0.04]',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary/70 transition-colors group-hover:bg-primary/15">
                <Table2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {t('dcfProjectionTable.triggerTitle')}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/60">
                  <span>
                    {sortedRows[0]?.year}\u2013{sortedRows[sortedRows.length - 1]?.year}
                  </span>
                  <span className="text-foreground/20">|</span>
                  <span>{t('dcfForecastWorkspace.projectionReady')}</span>
                  {projectionRows.length > 0 && (
                    <>
                      <span className="text-foreground/20">|</span>
                      <span>
                        {t('dcfProjectionTable.triggerFcfRange', {
                          first: fmt(projectionRows[0].fcff),
                          last: fmt(projectionRows[projectionRows.length - 1].fcff),
                        })}
                      </span>
                    </>
                  )}
                </div>
                {projectionRows.length > 0 && firstProjection && lastProjection && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/60">
                    <span>
                      {t('dcfProjectionTable.triggerFirstFcff', {
                        value: fmt(firstProjection.fcff),
                      })}
                    </span>
                    <span className="text-foreground/20">|</span>
                    <span>
                      {t('dcfProjectionTable.triggerLastFcff', {
                        value: fmt(lastProjection.fcff),
                      })}
                    </span>
                  </div>
                )}
                {(dcfWaccPct != null && dcfWaccPct > 0) || terminalValueMethod ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-foreground/45">
                    {dcfWaccPct != null && dcfWaccPct > 0 && (
                      <span>
                        {t('dcfProjectionTable.triggerWacc', { pct: dcfWaccPct.toFixed(1) })}
                      </span>
                    )}
                    {terminalValueMethod === 'perpetual_growth' &&
                      dcfTerminalGrowthPct != null &&
                      Number.isFinite(dcfTerminalGrowthPct) && (
                        <span className="ml-2">
                          {t('dcfProjectionTable.triggerTerminalGrowth', {
                            pct: dcfTerminalGrowthPct.toFixed(1),
                          })}
                        </span>
                      )}
                    {terminalValueMethod === 'exit_multiple' &&
                      dcfExitMultiple != null &&
                      Number.isFinite(dcfExitMultiple) && (
                        <span className="ml-2">
                          {t('dcfProjectionTable.triggerExitMultiple', {
                            x: dcfExitMultiple.toFixed(1),
                          })}
                        </span>
                      )}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs font-medium text-primary/60 transition-colors group-hover:text-primary">
                {t('dcfProjectionTable.triggerAction')}
              </span>
            </button>
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
