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
}
