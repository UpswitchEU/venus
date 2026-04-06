'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import { cn } from '@/design-system/utils'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import type { DcfForecastRow } from './DcfForecastTypes'
import type { DcfProjectionPreviewRow } from './dcfProjectionPreview'

interface DcfProjectionTableProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  forecastRows: DcfForecastRow[]
  projectionRows: DcfProjectionPreviewRow[]
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
  baseYear?: string
  onChange: (
    year: string,
    field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change',
    value: number
  ) => void
  disabled?: boolean
}

interface WaterfallRow {
  key: string
  labelKey: string
  prefix?: string
  isBold?: boolean
  isHighlight?: boolean
  editable?: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change'
  getValue: (proj: DcfProjectionPreviewRow, forecast: DcfForecastRow) => number
}

const WATERFALL_ROWS: WaterfallRow[] = [
  {
    key: 'revenue',
    labelKey: 'revenue',
    editable: 'revenue',
    getValue: (p) => p.revenue,
  },
  {
    key: 'ebitda',
    labelKey: 'ebitda',
    editable: 'ebitda',
    getValue: (p) => p.ebitda,
  },
  {
    key: 'da',
    labelKey: 'da',
    prefix: '\u2212',
    editable: 'depreciation',
    getValue: (p) => p.da,
  },
  {
    key: 'ebit',
    labelKey: 'ebit',
    prefix: '=',
    isBold: true,
    getValue: (p) => p.ebit,
  },
  {
    key: 'taxes',
    labelKey: 'taxes',
    prefix: '\u2212',
    getValue: (p) => p.taxes,
  },
  {
    key: 'nopat',
    labelKey: 'nopat',
    prefix: '=',
    isBold: true,
    getValue: (p) => p.nopat,
  },
  {
    key: 'addBackDa',
    labelKey: 'addBackDa',
    prefix: '+',
    getValue: (p) => p.da,
  },
  {
    key: 'capex',
    labelKey: 'capex',
    prefix: '\u2212',
    editable: 'capex',
    getValue: (p) => p.capex,
  },
  {
    key: 'nwcChange',
    labelKey: 'nwcChange',
    prefix: '\u2212',
    editable: 'nwc_change',
    getValue: (p) => p.nwcChange,
  },
  {
    key: 'fcff',
    labelKey: 'fcff',
    prefix: '=',
    isBold: true,
    isHighlight: true,
    getValue: (p) => p.fcff,
  },
]

const SUMMARY_ROW_KEYS = new Set(['revenue', 'ebitda', 'fcff'])

export function DcfProjectionTable({
  open,
  onOpenChange,
  forecastRows,
  projectionRows,
  latestHistoricalRevenue,
  latestHistoricalEbitda,
  baseYear,
  onChange,
  disabled,
}: DcfProjectionTableProps) {
  const t = useTranslations('manualInput')
  const { currency } = useManualPreviewFormatters()
  const [editingCell, setEditingCell] = useState<{ year: string; field: string } | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const visibleWaterfallRows = useMemo(
    () =>
      showBreakdown
        ? WATERFALL_ROWS
        : WATERFALL_ROWS.filter((row) => SUMMARY_ROW_KEYS.has(row.key)),
    [showBreakdown]
  )

  const fmt = useCallback((value: number) => currency.format(value), [currency])

  const sortedForecastRows = useMemo(
    () => [...forecastRows].sort((a, b) => Number(a.year) - Number(b.year)),
    [forecastRows]
  )

  const forecastYearCount = sortedForecastRows.length

  const projectionByYear = useMemo(
    () => new Map(projectionRows.map((r) => [String(r.year), r])),
    [projectionRows]
  )

  const handleCellClick = useCallback(
    (year: string, field: string) => {
      if (disabled) return
      setEditingCell({ year, field })
    },
    [disabled]
  )

  const handleCellChange = useCallback(
    (
      year: string,
      field: 'revenue' | 'ebitda' | 'capex' | 'depreciation' | 'nwc_change',
      value: number | undefined
    ) => {
      onChange(year, field, value ?? 0)
    },
    [onChange]
  )

  const handleCellBlur = useCallback(() => {
    setEditingCell(null)
  }, [])

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="full"
        description={t('dcfProjectionTable.description', { count: forecastYearCount })}
        className={cn('flex max-h-[90vh] flex-col overflow-hidden')}
      >
        <ModalHeader className="mb-4 shrink-0">
          <ModalTitle>{t('dcfProjectionTable.title', { count: forecastYearCount })}</ModalTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t('dcfProjectionTable.subtitle')}</p>
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="mt-3 inline-flex w-fit items-center rounded-lg border border-foreground/10 bg-background px-2.5 py-1.5 text-left text-xs font-medium text-foreground/65 transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {showBreakdown
              ? t('dcfProjectionTable.hideBreakdown')
              : t('dcfProjectionTable.showBreakdown')}
          </button>
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-auto [-webkit-overflow-scrolling:touch]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 bg-primary/[0.03]">
                <th className="sticky left-0 z-10 bg-primary/[0.03] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                  {t('dcfProjectionTable.metric')}
                </th>
                {baseYear && (
                  <th className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                    {baseYear}{' '}
                    <span className="text-foreground/30">({t('dcfProjectionTable.base')})</span>
                  </th>
                )}
                {sortedForecastRows.map((row) => (
                  <th
                    key={row.year}
                    className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-foreground/50"
                  >
                    {row.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleWaterfallRows.map((wRow) => (
                <tr
                  key={wRow.key}
                  className={cn(
                    'border-b border-foreground/[0.06] transition-colors',
                    wRow.isHighlight && 'bg-primary/[0.06] border-primary/15',
                    wRow.key === 'ebit' && 'border-foreground/10',
                    wRow.key === 'nopat' && 'border-foreground/10'
                  )}
                >
                  <td
                    className={cn(
                      'sticky left-0 z-10 whitespace-nowrap bg-background px-4 py-2.5',
                      wRow.isHighlight && 'bg-primary/[0.06]',
                      wRow.isBold ? 'font-semibold text-foreground' : 'text-foreground/70'
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {wRow.prefix && (
                        <span className="w-3 text-center text-foreground/40">{wRow.prefix}</span>
                      )}
                      {t(`dcfProjectionTable.rows.${wRow.labelKey}`)}
                    </span>
                  </td>

                  {baseYear && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground/50">
                      {wRow.key === 'revenue' && latestHistoricalRevenue != null
                        ? fmt(latestHistoricalRevenue)
                        : wRow.key === 'ebitda' && latestHistoricalEbitda != null
                          ? fmt(latestHistoricalEbitda)
                          : '\u2014'}
                    </td>
                  )}

                  {sortedForecastRows.map((fRow) => {
                    const proj = projectionByYear.get(fRow.year)
                    if (!proj) {
                      return (
                        <td key={fRow.year} className="px-4 py-2.5 text-right text-foreground/30">
                          \u2014
                        </td>
                      )
                    }

                    const value = wRow.getValue(proj, fRow)
                    const isEditing =
                      editingCell?.year === fRow.year && editingCell?.field === wRow.key
                    const editableField = wRow.editable
                    const canEdit = editableField != null

                    if (isEditing && editableField) {
                      return (
                        <td key={fRow.year} className="px-2 py-1">
                          <CurrencyInput
                            value={value !== 0 ? value : undefined}
                            onChange={(v) => handleCellChange(fRow.year, editableField, v)}
                            size="sm"
                            className="min-w-[100px]"
                            allowNegative={wRow.key === 'nwcChange'}
                            ariaLabel={`${wRow.labelKey} ${fRow.year}`}
                          />
                          <button type="button" className="sr-only" onFocus={handleCellBlur} />
                        </td>
                      )
                    }

                    return (
                      <td
                        key={fRow.year}
                        className={cn(
                          'px-4 py-2.5 text-right tabular-nums',
                          wRow.isBold ? 'font-semibold text-foreground' : 'text-foreground/80',
                          wRow.isHighlight && 'font-bold text-primary',
                          canEdit &&
                            !disabled &&
                            'cursor-pointer hover:bg-primary/[0.06] rounded transition-colors'
                        )}
                        onClick={canEdit ? () => handleCellClick(fRow.year, wRow.key) : undefined}
                        title={canEdit ? t('dcfProjectionTable.clickToEdit') : undefined}
                      >
                        {fmt(value)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ModalFooter className="mt-0 shrink-0 border-t border-foreground/[0.06] pt-4">
          <p className="mr-auto text-xs text-muted-foreground">{t('dcfProjectionTable.formula')}</p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-w-[120px] items-center justify-center rounded-xl border border-primary/25 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {t('dcfProjectionTable.done')}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
