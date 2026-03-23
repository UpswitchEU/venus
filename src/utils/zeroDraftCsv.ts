/**
 * Accountant-only Zero Draft: CSV export of Omni-Calc method table (Excel-ready).
 */
import { getOmniMethodEquityRange } from '@/utils/omniCalcRange'
import type { ValuationMethodResult } from '@/types/valuation'

export interface ZeroDraftMethodRow {
  label: string
  available: boolean
  value: number | null
  unavailable_reason?: string | null
  multiple_used?: number | null
  wacc?: number | null
  details?: Record<string, unknown> | null
}

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export function buildZeroDraftCsv(params: {
  reportId: string
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
  if (params.fiscalAnchor != null && Number.isFinite(Number(params.fiscalAnchor))) {
    rows.push(['Forfait 4x EBITDA component (EUR)', String(Math.round(Number(params.fiscalAnchor)))])
  }
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
  ])

  const entries = Object.entries(params.methods).sort(([a], [b]) => a.localeCompare(b))
  for (const [key, m] of entries) {
    const mid =
      m.available && m.value != null && Number.isFinite(Number(m.value))
        ? Math.round(Number(m.value))
        : ''
    const band = m.available
      ? getOmniMethodEquityRange({
          value: m.value,
          available: m.available,
          details: m.details ?? undefined,
        })
      : null
    rows.push([
      key,
      m.label,
      m.available ? 'yes' : 'no',
      mid === '' ? '' : String(mid),
      band ? String(band.low) : '',
      band ? String(band.high) : '',
      band ? band.source : '',
      m.multiple_used != null ? String(Number(m.multiple_used)) : '',
      m.wacc != null ? String(Number(m.wacc)) : '',
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
