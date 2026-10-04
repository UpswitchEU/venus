/**
 * Accountant-only Zero Draft: CSV export of Omni-Calc method table (Excel-ready).
 */

import type { ValuationMethodResult } from '@/types/valuation'
import { getOmniMethodRange } from '@/utils/omniCalcRange'
import { parseFinancialTransportNumber } from './financialTransport'
import { resolveMethodCurrency, resolveMethodValueBasis } from './methodComparisonFinancials'

export type ZeroDraftMethodRow = ValuationMethodResult

function csvEscape(cell: string | number): string {
  // Validated financial numbers stay numeric, including zero and negative values.
  if (typeof cell === 'number') return String(cell)
  // The quoted tab keeps formula-like external text inert on Excel CSV import.
  // Do not rely on CSV quoting alone: spreadsheets evaluate quoted formulas too.
  const start = cell.trimStart()
  if (/^[=+\-@＝＋－＠]/u.test(start) || start.charCodeAt(0) < 32 || /^[\t\r\n]/.test(cell)) {
    return `"\t${cell.replace(/"/g, '""')}"`
  }
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
  const rows: (string | number)[][] = []
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
  if (anchor !== undefined) rows.push(['Forfait 4x EBITDA component', anchor])
  rows.push([])
  rows.push([
    'method_key',
    'label',
    'available',
    'equity_mid_eur',
    'range_low_eur',
    'range_high_eur',
    'range_type',
    'multiple_used',
    'wacc',
    'unavailable_reason',
    'currency',
    'value_basis',
    'value',
    'range_low',
    'range_high',
    'range_type',
    'multiple_used',
    'wacc',
    'unavailable_reason',
    'currency',
    'value_basis',
    'value',
    'range_low',
    'range_high',
  ])

  const entries = Object.entries(params.methods).sort(([a], [b]) => a.localeCompare(b))
  for (const [key, m] of entries) {
    const point = parseFinancialTransportNumber(m.value)
    const available = m.available && !m.plan_teaser && point !== undefined
    const mid = available ? point : undefined
    const basis = resolveMethodValueBasis(m)
    const methodCurrency = resolveMethodCurrency(m, params.currency)
    const band = available && basis ? getOmniMethodRange({ ...m, value_basis: basis }) : null
    // Retain the legacy column positions without mislabelling EV or other currencies.
    const legacyEquity = available && methodCurrency === 'EUR' && basis === 'equity_value'
    const multiple = available ? parseFinancialTransportNumber(m.multiple_used) : undefined
    const wacc = available ? parseFinancialTransportNumber(m.wacc) : undefined
    rows.push([
      key,
      m.label,
      available ? 'yes' : 'no',
      legacyEquity ? (mid ?? '') : '',
      legacyEquity && band ? band.low : '',
      legacyEquity && band ? band.high : '',
      band ? band.source : '',
      multiple ?? '',
      wacc ?? '',
      m.unavailable_reason ?? '',
      methodCurrency ?? '',
      basis ?? '',
      mid ?? '',
      band ? band.low : '',
      band ? band.high : '',
    ])
  }

  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n'
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
