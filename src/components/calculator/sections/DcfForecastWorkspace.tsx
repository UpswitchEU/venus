'use client'

import { motion } from 'framer-motion'
import { Percent, Plus, Table2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { cn } from '@/design-system/utils'
import { coalesceFiniteNumber, useManualPreviewFormatters } from '@/lib/omniPreview'
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
  dcfTaxShieldProjections?: number[]
  onDcfInputModeChange: (mode: DcfInputMode) => void
  onDcfTaxShieldProjectionChange?: (index: number, value: number | undefined) => void
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change' | 'free_cash_flow',
    value: number | undefined
  ) => void
  onAddYear: () => void
  /** Opens parent confirmation to remove all forecast years (DCF list no longer shows per-year remove). */
  onRequestRemoveForecastYears?: () => void
  /**
   * Live projection from forecast defaults (growth, margin, bridge %) via deriveDcfProjectionPreview.
   * Inline grid uses these until a forecast row has user input (revenue, EBITDA, bridge lines, or FCFF).
   */
  derivedProjectionPreview?: DcfProjectionPreviewRow[]
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
  dcfTaxShieldProjections,
  onDcfInputModeChange,
  onDcfTaxShieldProjectionChange,
  onChange,
  onAddYear,
  onRequestRemoveForecastYears,
  derivedProjectionPreview,
}: DcfForecastWorkspaceProps) {
  const t = useTranslations('manualInput')
  const { currency } = useManualPreviewFormatters()
  const [tableOpen, setTableOpen] = useState(false)
  // Inline grid focuses on the 4 primary columns by default (Year | Revenue |
  // EBITDA | FCFF) — that's the punchline. Percent details (YoY, margin, CapEx%,
  // D&A%, ΔNWC%) are collapsed behind a toggle so the FCFF column never clips
  // on a 14" laptop with the right panel open.
  const [showPercentColumns, setShowPercentColumns] = useState(false)

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
    return sortedRows.every((r) => {
      const rev = Number(r.revenue)
      const ebit = Number(r.ebitda)
      return Number.isFinite(rev) && Number.isFinite(ebit) && (rev !== 0 || ebit !== 0)
    })
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
    const build = (row: DcfForecastRow) => buildProjectionRowFromForecastRow(row, globals)

    if (dcfInputMode !== 'ebitda' || !derivedProjectionPreview?.length) {
      return sortedRows.map((row) => build(row))
    }

    const derivedByYear = new Map(derivedProjectionPreview.map((r) => [r.year, r]))
    return sortedRows.map((row) => {
      const derivedRow = derivedByYear.get(Number(row.year))
      // Prefer stored row whenever the user has entered any forecast line (not only revenue).
      const hasStoredForecastInput =
        coalesceFiniteNumber(row.revenue) !== 0 ||
        coalesceFiniteNumber(row.ebitda) !== 0 ||
        (typeof row.free_cash_flow === 'number' && Number.isFinite(row.free_cash_flow)) ||
        (row.capex != null && Number.isFinite(row.capex)) ||
        (row.depreciation != null && Number.isFinite(row.depreciation)) ||
        (row.nwc_change != null && Number.isFinite(row.nwc_change))
      if (derivedRow && !hasStoredForecastInput) {
        return derivedRow
      }
      return build(row)
    })
  }, [
    sortedRows,
    globalCapexPct,
    globalDaPct,
    globalNwcPct,
    globalTaxRatePct,
    dcfInputMode,
    derivedProjectionPreview,
  ])

  const fmt = useCallback((value: number) => currency.format(value), [currency])

  const fmtPct = useCallback((value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${value.toFixed(1)}%`
  }, [])

  const modeSegmentOptions = useMemo(
    () => [
      { value: 'ebitda' as const, label: t('dcfInputMode.ebitdaShort') },
      { value: 'fcff_only' as const, label: t('dcfInputMode.fcffOnlyShort') },
    ],
    [t]
  )
  const inlineGridDerived = useMemo(() => {
    if (projectionRows.length === 0) return []
    return projectionRows.map((row, i) => {
      const prevRev = i === 0 ? (latestHistoricalRevenue ?? 0) : projectionRows[i - 1].revenue
      const yoyPct =
        prevRev !== 0 && Number.isFinite(prevRev) ? ((row.revenue - prevRev) / prevRev) * 100 : null
      const revDenom = Number.isFinite(row.revenue) && row.revenue !== 0 ? row.revenue : null
      const marginPct = revDenom != null ? (row.ebitda / revDenom) * 100 : 0
      const capexPctOfRev = revDenom != null ? (row.capex / revDenom) * 100 : 0
      const daPctOfRev = revDenom != null ? (row.da / revDenom) * 100 : 0
      const nwcPctOfRev = revDenom != null ? (row.nwcChange / revDenom) * 100 : 0
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
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
              {t('dcfInputMode.label')}
            </span>
            <SegmentedControl
              value={dcfInputMode}
              onChange={(v) => onDcfInputModeChange(v as DcfInputMode)}
              options={modeSegmentOptions}
              disabled={disabled}
              size="sm"
              fullWidth
              aria-label={t('dcfInputMode.label')}
            />
          </div>
        )}

        {dcfInputMode === 'fcff_only' ? (
          <div className="space-y-3">
            <DcfFcffOnlyTable
              forecastRows={sortedRows}
              disabled={disabled}
              fieldValidation={fieldValidation}
              taxShieldProjections={dcfTaxShieldProjections}
              onChange={(year, value) => onChange(year, 'free_cash_flow', value)}
              onTaxShieldChange={onDcfTaxShieldProjectionChange}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('dcfForecastWorkspace.fcffOnlyAfterTableHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projectionRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t('dcfForecastWorkspace.inlineGridFormulaShort')}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPercentColumns((v) => !v)}
                    disabled={disabled}
                    aria-pressed={showPercentColumns}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium transition-colors',
                      showPercentColumns
                        ? 'border-primary/35 text-primary hover:border-primary/45 hover:bg-primary/[0.04]'
                        : 'border-foreground/10 text-foreground/65 hover:border-foreground/20 hover:text-foreground',
                      disabled && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <Percent className="h-3.5 w-3.5" aria-hidden />
                    {showPercentColumns
                      ? t('dcfForecastWorkspace.hidePercentColumns')
                      : t('dcfForecastWorkspace.showPercentColumns')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableOpen(true)}
                    disabled={disabled}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-foreground/10 bg-background px-2.5 text-xs font-medium text-primary transition-colors hover:border-primary/25 hover:bg-primary/[0.04]',
                      hasWarnings && 'border-warning/30 text-warning',
                      disabled && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <Table2 className="h-3.5 w-3.5" aria-hidden />
                    {t('dcfProjectionTable.triggerAction')}
                  </button>
                </div>
              </div>
            )}
            {projectionRows.length > 0 && (
              <div
                className={cn(
                  'overflow-x-auto rounded-xl border border-foreground/[0.08] bg-foreground/[0.02]'
                )}
              >
                <table
                  className={cn(
                    'w-full border-collapse text-sm tabular-nums',
                    showPercentColumns ? 'min-w-[880px]' : 'min-w-[420px]'
                  )}
                >
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
                        {t('dcfProjectionTable.rows.ebitda')}
                      </th>
                      <th
                        scope="col"
                        className="whitespace-nowrap px-2 py-2.5 sm:px-3 font-semibold text-foreground/85"
                      >
                        {t('dcfProjectionTable.rows.fcff')}
                      </th>
                      {showPercentColumns && (
                        <>
                          <th scope="col" className="whitespace-nowrap px-2 py-2.5 sm:px-3">
                            {t('dcfForecastWorkspace.colYoY')}
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
                        </>
                      )}
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
                            {fmt(row.ebitda)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-semibold text-foreground sm:px-3">
                            {fmt(row.fcff)}
                          </td>
                          {showPercentColumns && (
                            <>
                              <td className="whitespace-nowrap px-2 py-2 text-foreground/65 sm:px-3">
                                {fmtPct(d?.yoyPct)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-foreground/65 sm:px-3">
                                {fmtPct(d?.marginPct)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-foreground/65 sm:px-3">
                                {fmtPct(d?.capexPctOfRev)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-foreground/65 sm:px-3">
                                {fmtPct(d?.daPctOfRev)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-foreground/65 sm:px-3">
                                {fmtPct(d?.nwcPctOfRev)}
                              </td>
                            </>
                          )}
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
