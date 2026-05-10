'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { CurrencyInput } from '../CurrencyInput'
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
  const sorted = [...forecastRows].sort((a, b) => Number(a.year) - Number(b.year))

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
            const numericValue = typeof v === 'number' && Number.isFinite(v) ? v : undefined
            const hasErr = !!fieldValidation?.errors[`fcff-${row.year}`]
            const hasWarn = !!fieldValidation?.warnings[`fcff-${row.year}`]
            return (
              <tr key={row.year} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-foreground/80">{row.year}</td>
                <td className="px-3 py-2 text-right">
                  <div
                    className={cn(
                      'mx-auto w-full max-w-[160px]',
                      hasErr && '[&_input]:border-destructive/50',
                      hasWarn && !hasErr && '[&_input]:border-warning/40',
                    )}
                  >
                    <CurrencyInput
                      value={numericValue}
                      onChange={(next) => onChange(row.year, next)}
                      ariaLabel={t('dcfFcffOnlyTable.inputAria', { year: row.year })}
                      size="sm"
                      // FCFF can be negative in early forecast years (turnaround,
                      // heavy CapEx) — allow it explicitly.
                      allowNegative
                      disabled={disabled}
                    />
                  </div>
                  {(hasErr || hasWarn) && (
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        hasErr ? 'text-destructive' : 'text-warning',
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
