/**
 * Calculator Report Types
 *
 * Shared types for valuation report display.
 * Report content comes from backend (htmlReport); these types describe the report metadata.
 */

import type { ReactNode } from 'react'

export interface ReportMetric {
  label: string
  value: string
  change?: number
  icon?: ReactNode
}

export interface ValuationReportData {
  id: string
  companyName: string
  valuation: number
  valuationLow?: number
  valuationHigh?: number
  ebitda: number
  normalizedEbitda?: number
  multiple: number
  multipleRange?: { low: number; high: number }
  generatedAt: Date
  confidenceLevel?: 'high' | 'medium' | 'low'
  confidenceScore?: number
  metrics?: ReportMetric[]
  /** Full HTML report from ValuationIQ - single source of truth for report content */
  htmlReport?: string
  /** Recommended asking price */
  recommendedAskingPrice?: number
  /** Titan `updated_at` on the report row — compared to PDF generation time */
  reportUpdatedAt?: Date
  pdfGeneratedAt?: Date | null
  pdfUrl?: string | null
  dcfHistoricalFcfReadiness?: {
    status: 'imported_ready' | 'partial' | 'manual_fallback'
    historical_years_count: number
    actual_capex_years: number
    actual_tax_years: number
    actual_nwc_years: number
  } | null
}
