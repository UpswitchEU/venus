'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import type { DcfForecastRow } from './DcfForecastTypes'

interface DcfFcffOnlyTableProps {
  forecastRows: DcfForecastRow[]
  disabled?: boolean
  fieldValidation?: {
    warnings: Record<string, string>
    errors: Record<string, string>
  }
  onChange: (year: string, value: number | undefined) => void
}

export function DcfFcffOnlyTable({
  forecastRows,
  disabled,
  fieldValidation,
  onChange,
}: DcfFcffOnlyTableProps) {
  const t = useTranslations('manualInput')
  const { currency } = useManualPreviewFormatters()
  const sorted = [...forecastRows].sort((a, b) => Number(a.year) - Number(b.year))

  const fmt = (value: number) => currency.format(value)

  return (
    <div className="overflow-x-auto rounded-xl border border-foreground/[0.08]">
      <table className="w-full min-w-[280px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-foreground/[0.08] bg-foreground/[0.02]">
            <th className="px-3 py-2 text-left text-xs font-medium text-foreground/60">
              {t('dcfFcffOnlyTable.year')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-foreground/60">
              {t('dcfFcffOnlyTable.freeCashFlow')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const v = row.free_cash_flow
            const hasErr = !!fieldValidation?.errors[`fcff-${row.year}`]
            const hasWarn = !!fieldValidation?.warnings[`fcff-${row.year}`]
            return (
              <tr key={row.year} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-foreground/80">{row.year}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    disabled={disabled}
                    value={typeof v === 'number' && Number.isFinite(v) ? v : ''}
                    onChange={(e) => {
                      if (e.target.value === '') {
                        onChange(row.year, undefined)
                        return
                      }
                      const n = Number(e.target.value)
                      onChange(row.year, Number.isFinite(n) ? n : undefined)
                    }}
                    className={cn(
                      'w-full max-w-[140px] rounded-md border bg-background px-2 py-1.5 text-right font-mono text-sm tabular-nums outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/30',
                      hasErr
                        ? 'border-destructive/50'
                        : hasWarn
                          ? 'border-warning/40'
                          : 'border-foreground/10'
                    )}
                    aria-label={t('dcfFcffOnlyTable.inputAria', { year: row.year })}
                  />
                  {typeof v === 'number' && Number.isFinite(v) && v !== 0 && (
                    <p className="mt-0.5 text-[10px] text-foreground/40">{fmt(v)}</p>
                  )}
                  {(hasErr || hasWarn) && (
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        hasErr ? 'text-destructive' : 'text-warning'
                      )}
                    >
                      {fieldValidation?.errors[`fcff-${row.year}`] ||
                        fieldValidation?.warnings[`fcff-${row.year}`]}
                    </p>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
