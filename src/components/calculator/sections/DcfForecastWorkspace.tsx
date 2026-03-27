'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { DcfForecastYearCard, type DcfForecastYearCardRow } from './DcfForecastYearCard'
import { DcfForecastYearDetailModal, type DcfYearDetail } from './DcfForecastYearDetailModal'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface DcfForecastWorkspaceProps {
  /** Step index after financial history (default 4). */
  step?: number
  forecastRows: DcfForecastYearCardRow[]
  latestHistoricalRevenue?: number
  fieldValidation?: {
    warnings: Record<string, string>
    errors: Record<string, string>
  }
  globalCapexPct?: number
  globalNwcPct?: number
  disabled?: boolean
  canAddYear: boolean
  nextForecastYear: number
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change',
    value: number
  ) => void
  onRemoveYear: (year: string) => void
  onAddYear: () => void
}

export function DcfForecastWorkspace({
  step = 4,
  forecastRows,
  latestHistoricalRevenue,
  fieldValidation,
  globalCapexPct,
  globalNwcPct,
  disabled,
  canAddYear,
  nextForecastYear,
  onChange,
  onRemoveYear,
  onAddYear,
}: DcfForecastWorkspaceProps) {
  const t = useTranslations('manualInput')
  const [detailYear, setDetailYear] = useState<string | null>(null)

  const sortedRows = useMemo(
    () => [...forecastRows].sort((a, b) => Number(a.year) - Number(b.year)),
    [forecastRows]
  )

  const forecastSectionComplete = useMemo(
    () => sortedRows.length > 0 && sortedRows.every((r) => !(r.revenue <= 0 && r.ebitda === 0)),
    [sortedRows]
  )

  const detailYearData = useMemo<DcfYearDetail | null>(() => {
    if (!detailYear) return null
    const row = sortedRows.find((r) => r.year === detailYear)
    if (!row) return null
    return {
      year: row.year,
      revenue: row.revenue,
      ebitda: row.ebitda,
      capex: row.capex,
      depreciation: row.depreciation,
      nwc_change: row.nwc_change,
    }
  }, [detailYear, sortedRows])

  const handleEditDetails = useCallback((year: string) => {
    setDetailYear(year)
  }, [])

  const handleModalClose = useCallback((open: boolean) => {
    if (!open) setDetailYear(null)
  }, [])

  if (sortedRows.length === 0) return null

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
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('dcfForecastWorkspace.description')}
        </p>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sortedRows.map((row, index) => {
              const prevRevenue =
                index === 0 ? latestHistoricalRevenue : sortedRows[index - 1]?.revenue

              const yearWarning =
                fieldValidation?.errors[`revenue-${row.year}`] ||
                fieldValidation?.warnings[`revenue-${row.year}`] ||
                fieldValidation?.errors[`ebitda-${row.year}`] ||
                fieldValidation?.warnings[`ebitda-${row.year}`] ||
                fieldValidation?.warnings[`margin-${row.year}`]

              return (
                <DcfForecastYearCard
                  key={row.year}
                  row={row}
                  previousRevenue={prevRevenue}
                  disabled={disabled}
                  hasWarning={!!yearWarning}
                  warningMessage={yearWarning}
                  onEditDetails={handleEditDetails}
                  onRemoveYear={onRemoveYear}
                />
              )
            })}
          </AnimatePresence>

          {canAddYear && (
            <motion.button
              type="button"
              onClick={onAddYear}
              disabled={disabled}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/20 p-4 text-sm text-primary/50 transition-colors hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary/70 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`${t('addForecastYear')} ${nextForecastYear}`}
            >
              <Plus className="h-5 w-5" />
              <span>
                {t('addForecastYear')} ({nextForecastYear})
              </span>
            </motion.button>
          )}
        </div>
      </motion.section>

      {detailYearData && (
        <DcfForecastYearDetailModal
          open={!!detailYear}
          onOpenChange={handleModalClose}
          yearDetail={detailYearData}
          globalCapexPct={globalCapexPct}
          globalNwcPct={globalNwcPct}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </>
  )
}
