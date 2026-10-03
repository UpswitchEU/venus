/**
 * Accountant-only Zero Draft: CSV export of Omni-Calc method table (Excel-ready).
 */

import type { ValuationMethodResult } from '@/types/valuation'
import { getOmniMethodRange } from '@/utils/omniCalcRange'
import { parseFinancialTransportNumber } from './financialTransport'
import { resolveMethodCurrency, resolveMethodValueBasis } from './methodComparisonFinancials'

export type ZeroDraftMethodRow = ValuationMethodResult

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export function buildZeroDraftCsv(params: {
  reportId: string
  currency?: string | null
  businessName?: string | null
  createdAt?: string | null
  fiscalAnchor?: number | null
  selectedMethod?: string | null
  methods: Record<string, ZeroDraftMethodRow | ValuationMethodResult>
}): string {
  const rows: string[][] = []
  rows.push(['Zero Draft Package', 'UpSwitch'])
  rows.push(['Report ID', params.reportId])
  if (params.businessName) rows.push(['Business', params.businessName])
  if (params.createdAt) rows.push(['Created', params.createdAt])
  if (params.selectedMethod) rows.push(['Selected method key', params.selectedMethod])
  const currency = resolveMethodCurrency(
    { available: false, value: null, label: '' },
    params.currency
  )
  rows.push(['Currency', currency ?? 'unknown'])
  const anchor = parseFinancialTransportNumber(params.fiscalAnchor)
  if (anchor !== undefined) rows.push(['Forfait 4x EBITDA component', String(anchor)])
  rows.push([])
  rows.push([
    'method_key',
    'label',
    'available',
    'currency',
    'value_basis',
    'value',
    'range_low',
    'range_high',
    'range_type',
    'multiple_used',
    'wacc',
    'unavailable_reason',
  ])

  const entries = Object.entries(params.methods).sort(([a], [b]) => a.localeCompare(b))
  for (const [key, m] of entries) {
    const point = parseFinancialTransportNumber(m.value)
    const available = m.available && !m.plan_teaser && point !== undefined
    const mid = available ? point : undefined
    const basis = resolveMethodValueBasis(m)
    const band = available && basis ? getOmniMethodRange({ ...m, value_basis: basis }) : null
    const multiple = available ? parseFinancialTransportNumber(m.multiple_used) : undefined
    const wacc = available ? parseFinancialTransportNumber(m.wacc) : undefined
    rows.push([
      key,
      m.label,
      available ? 'yes' : 'no',
      resolveMethodCurrency(m, params.currency) ?? '',
      basis ?? '',
      mid === undefined ? '' : String(mid),
      band ? String(band.low) : '',
      band ? String(band.high) : '',
      band ? band.source : '',
      multiple === undefined ? '' : String(multiple),
      wacc === undefined ? '' : String(wacc),
      m.unavailable_reason ?? '',
    ])
  }

  const body = rows.map((r) => r.map((c) => csvEscape(String(c))).join(',')).join('\r\n') + '\r\n'
  return `\uFEFF${body}`
}

export function downloadZeroDraftCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
