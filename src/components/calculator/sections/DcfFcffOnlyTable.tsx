'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { InlineCurrencyInput } from '../InlineCurrencyInput'
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
    <div className="overflow-x-auto rounded-xl border border-foreground/[0.08] bg-foreground/[0.02]">
      <table className="w-full min-w-[280px] border-collapse text-sm tabular-nums">
        <thead>
          <tr className="border-b border-foreground/[0.08]">
            <th
              scope="col"
              className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-foreground/55"
            >
              {t('dcfFcffOnlyTable.year')}
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-foreground/55"
            >
              {t('dcfFcffOnlyTable.freeCashFlow')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const v = row.free_cash_flow
            const numericValue = typeof v === 'number' && Number.isFinite(v) ? v : undefined
            const errMsg = fieldValidation?.errors[`fcff-${row.year}`]
            const warnMsg = fieldValidation?.warnings[`fcff-${row.year}`]
            const state: 'default' | 'warning' | 'error' = errMsg
              ? 'error'
              : warnMsg
                ? 'warning'
                : 'default'
            return (
              <tr key={row.year} className="border-b border-foreground/[0.06] last:border-0">
                <th
                  scope="row"
                  className="whitespace-nowrap px-3 py-2 text-left align-middle font-medium text-foreground/85"
                >
                  {row.year}
                </th>
                <td className="px-3 py-2 text-right align-middle">
                  <div className="ml-auto flex w-full max-w-[160px] flex-col items-end">
                    <InlineCurrencyInput
                      value={numericValue}
                      // FCFF can be negative in early forecast years
                      // (turnaround / heavy CapEx) — allow it explicitly.
                      allowNegative
                      disabled={disabled}
                      state={state}
                      ariaLabel={t('dcfFcffOnlyTable.inputAria', { year: row.year })}
                      onChange={(next) => onChange(row.year, next)}
                    />
                    {(errMsg || warnMsg) && (
                      <p
                        className={cn(
                          'mt-1 text-[10px] leading-tight',
                          state === 'error' ? 'text-destructive' : 'text-warning'
                        )}
                        role={state === 'error' ? 'alert' : undefined}
                      >
                        {errMsg || warnMsg}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
