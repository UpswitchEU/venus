'use client'

import { Grid3X3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'

interface DcfSensitivityMatrixProps {
  sensitivityData?: {
    wacc_values: number[]
    growth_values?: number[]
    secondary_values?: number[]
    secondary_axis_key?: 'terminal_growth' | 'exit_multiple' | string
    secondary_axis_format?: 'percent' | 'multiple' | string
    ev_matrix: number[][]
  } | null
}

function normalizeNumberArray(values: unknown): number[] {
  return Array.isArray(values)
    ? values
        .map((value) => parseFlexibleNumber(value))
        .filter((value): value is number => value !== undefined)
    : []
}

function normalizeMatrixRows(values: unknown, rowCount: number, columnCount: number): number[][] {
  if (!Array.isArray(values)) return []
  return values.slice(0, rowCount).map((row) => {
    const cells = Array.isArray(row) ? row : []
    return Array.from({ length: columnCount }, (_, index) => parseFlexibleNumber(cells[index]) ?? 0)
  })
}

export function DcfSensitivityMatrix({ sensitivityData }: DcfSensitivityMatrixProps) {
  const t = useTranslations('methodBreakdown')
  const { formatEurCompact, ratio: ratioFormatter } = useManualPreviewFormatters()

  if (!sensitivityData) {
    return null
  }

  const waccValues = normalizeNumberArray(sensitivityData.wacc_values)
  const secondaryValues = normalizeNumberArray(
    sensitivityData.secondary_values ?? sensitivityData.growth_values
  )
  if (waccValues.length === 0 || secondaryValues.length === 0) {
    return null
  }
  const evMatrix = normalizeMatrixRows(sensitivityData.ev_matrix, waccValues.length, secondaryValues.length)
  if (evMatrix.length === 0) return null

  const secondaryAxisKey = sensitivityData.secondary_axis_key ?? 'terminal_growth'
  const secondaryAxisFormat =
    sensitivityData.secondary_axis_format ??
    (secondaryAxisKey === 'exit_multiple' ? 'multiple' : 'percent')

  const formatPercent = (value: number) => `${ratioFormatter.format(value * 100)}%`
  const formatSecondaryValue = (value: number) =>
    secondaryAxisFormat === 'multiple' ? `${ratioFormatter.format(value)}×` : formatPercent(value)

  const centerRowIndex = Math.floor(waccValues.length / 2)
  const centerColumnIndex = Math.floor(secondaryValues.length / 2)

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary/75">
        <Grid3X3 className="w-3.5 h-3.5" />
        {t('sensitivityTitle')}
      </div>
      <p className="text-[11px] leading-snug text-foreground/55">
        {t(
          secondaryAxisKey === 'exit_multiple'
            ? 'sensitivityDescriptionExitMultiple'
            : 'sensitivityDescription'
        )}
      </p>

      <div className="overflow-x-auto rounded-lg border border-primary/10 bg-background/70">
        <TableRoot size="sm" className="min-w-[420px] w-full">
          <TableCaption className="sr-only">{t('sensitivityTitle')}</TableCaption>
          <TableHeader className="border-b border-primary/10 bg-primary/[0.04]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto px-3 py-2 text-left text-[11px] font-semibold text-foreground/60">
                {t(
                  secondaryAxisKey === 'exit_multiple'
                    ? 'sensitivityWaccExitHeader'
                    : 'sensitivityWaccHeader'
                )}
              </TableHead>
              {secondaryValues.map((value, index) => (
                <TableHead
                  key={`secondary-${index}`}
                  className={cn(
                    'h-auto px-3 py-2 text-right text-[11px] font-semibold text-foreground/60',
                    index === centerColumnIndex && 'text-primary'
                  )}
                >
                  {formatSecondaryValue(value)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {waccValues.map((waccValue, rowIndex) => (
              <TableRow key={`wacc-${rowIndex}`} className="last:border-b-0">
                <TableCell
                  className={cn(
                    'px-3 py-2 text-[11px] font-semibold text-foreground/65',
                    rowIndex === centerRowIndex && 'text-primary'
                  )}
                >
                  {formatPercent(waccValue)}
                </TableCell>
                {secondaryValues.map((_, columnIndex) => (
                  <TableCell
                    key={`cell-${rowIndex}-${columnIndex}`}
                    className={cn(
                      'px-3 py-2 text-right text-[11px] font-medium text-foreground/70',
                      rowIndex === centerRowIndex &&
                        columnIndex === centerColumnIndex &&
                        'bg-primary/10 text-primary'
                    )}
                  >
                    {formatEurCompact(
                      evMatrix[rowIndex]?.[columnIndex] ?? 0
                    )}
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
