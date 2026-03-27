'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { TrendingUp, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { DcfForecastYearCard, type DcfForecastYearCardRow } from './DcfForecastYearCard'
import { DcfForecastYearDetailModal, type DcfYearDetail } from './DcfForecastYearDetailModal'

interface DcfForecastWorkspaceProps {
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
        className="space-y-3"
        aria-label={t('dcfForecastWorkspace.sectionLabel')}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-3 w-3 text-primary" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            {t('dcfForecastWorkspace.title')}
          </h3>
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('dcfForecastWorkspace.yearCount', { count: sortedRows.length })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('dcfForecastWorkspace.description')}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {sortedRows.map((row, index) => {
              const prevRevenue =
                index === 0
                  ? latestHistoricalRevenue
                  : sortedRows[index - 1]?.revenue

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
              className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/20 p-4 text-sm text-primary/50 transition-colors hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary/70 disabled:cursor-not-allowed disabled:opacity-50"
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
