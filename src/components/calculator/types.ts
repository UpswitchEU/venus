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
  /**
   * Current render fingerprint of the economic snapshot (from `valuation_result`).
   * Compared against `pdfRenderFingerprint` for economics-aware PDF staleness so a
   * no-op open (which only bumps `updated_at` via the read-path HTML self-heal)
   * does not falsely mark the PDF stale.
   */
  renderFingerprint?: string | null
  /** Render fingerprint the persisted PDF was built from (`metadata.pdf_render_fingerprint`). */
  pdfRenderFingerprint?: string | null
  /**
   * Authoritative PDF coherence from Titan (`getCoherentPersistedPdfUrl` — raw-vs-raw
   * fingerprint + timestamp parity). `true` means the persisted PDF provably matches
   * current economics; staleness logic treats it as the definitive "fresh" signal.
   */
  pdfCoherent?: boolean | null
  dcfHistoricalFcfReadiness?: {
    status: 'imported_ready' | 'partial' | 'manual_fallback'
    historical_years_count: number
    actual_capex_years: number
    actual_tax_years: number
    actual_nwc_years: number
  } | null
}
