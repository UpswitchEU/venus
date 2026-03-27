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
import { Grid3X3 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

interface DcfSensitivityMatrixProps {
  sensitivityData?: {
    wacc_values: number[]
    growth_values: number[]
    ev_matrix: number[][]
  } | null
}

export function DcfSensitivityMatrix({ sensitivityData }: DcfSensitivityMatrixProps) {
  const t = useTranslations('methodBreakdown')
  const locale = useLocale()

  if (
    !sensitivityData ||
    sensitivityData.wacc_values.length === 0 ||
    sensitivityData.growth_values.length === 0 ||
    sensitivityData.ev_matrix.length === 0
  ) {
    return null
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    }).format(value)
  const formatPercent = (value: number) =>
    `${new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value * 100)}%`

  const centerRowIndex = Math.floor(sensitivityData.wacc_values.length / 2)
  const centerColumnIndex = Math.floor(sensitivityData.growth_values.length / 2)

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary/75">
        <Grid3X3 className="w-3.5 h-3.5" />
        {t('sensitivityTitle')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/55">{t('sensitivityDescription')}</p>

      <div className="overflow-hidden rounded-lg border border-primary/10 bg-background/70">
        <TableRoot size="sm" className="min-w-[420px] w-full">
          <TableCaption className="sr-only">{t('sensitivityTitle')}</TableCaption>
          <TableHeader className="border-b border-primary/10 bg-primary/[0.04]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto px-3 py-2 text-left text-[11px] font-semibold text-foreground/60">
                {t('sensitivityWaccHeader')}
              </TableHead>
              {sensitivityData.growth_values.map((value, index) => (
                <TableHead
                  key={`growth-${index}`}
                  className={cn(
                    'h-auto px-3 py-2 text-right text-[11px] font-semibold text-foreground/60',
                    index === centerColumnIndex && 'text-primary'
                  )}
                >
                  {formatPercent(value)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sensitivityData.wacc_values.map((waccValue, rowIndex) => (
              <TableRow key={`wacc-${rowIndex}`} className="last:border-b-0">
                <TableCell
                  className={cn(
                    'px-3 py-2 text-[11px] font-semibold text-foreground/65',
                    rowIndex === centerRowIndex && 'text-primary'
                  )}
                >
                  {formatPercent(waccValue)}
                </TableCell>
                {sensitivityData.growth_values.map((_, columnIndex) => (
                  <TableCell
                    key={`cell-${rowIndex}-${columnIndex}`}
                    className={cn(
                      'px-3 py-2 text-right text-[11px] font-medium text-foreground/70',
                      rowIndex === centerRowIndex &&
                        columnIndex === centerColumnIndex &&
                        'bg-primary/10 text-primary'
                    )}
                  >
                    {formatCurrency(Number(sensitivityData.ev_matrix[rowIndex]?.[columnIndex] ?? 0))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </TableRoot>
      </div>
    </div>
  )
}
