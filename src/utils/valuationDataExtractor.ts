/**
 * Valuation Data Extractor
 *
 * Utility functions to extract summary data from backend response.
 *
 * NOTE: Calculation details are in the main report (html_report).
 * This file only extracts summary fields needed for basic display.
 */

import type { ModularSystem, ValuationResponse } from '../types/valuation'
import { dataExtractionLogger } from './logger'

/**
 * Get methodology statement with fallback
 */
export function getMethodologyStatement(result: ValuationResponse): string | null {
  // Priority 1: Direct field
  if (result.methodology_statement) {
    return result.methodology_statement
  }

  // Priority 2: From transparency report
  if (result.transparency?.methodology_statement) {
    return result.transparency.methodology_statement
  }

  // Priority 3: Generate from methodology field
  if (result.methodology) {
    return `Valuation methodology: ${result.methodology}`
  }

  return null
}

/**
 * Get academic sources with fallback
 */
export function getAcademicSources(result: ValuationResponse) {
  // Priority 1: Direct field
  if (result.academic_sources && result.academic_sources.length > 0) {
    return result.academic_sources
  }

  // Priority 2: From transparency report
  if (result.transparency?.academic_sources && result.transparency.academic_sources.length > 0) {
    return result.transparency.academic_sources
  }

  return []
}

/**
 * Get professional review readiness with fallback
 */
export function getProfessionalReviewReady(result: ValuationResponse) {
  // Priority 1: Direct field
  if (result.professional_review_ready) {
    return result.professional_review_ready
  }

  // Priority 2: From transparency report
  if (result.transparency?.professional_review_ready) {
    return result.transparency.professional_review_ready
  }

  return null
}

/**
 * Get modular system metadata
 */
export function getModularSystem(result: ValuationResponse): ModularSystem | null {
  return result.modular_system || null
}

/**
 * Check if modular system is enabled
 */
export function isModularSystemEnabled(result: ValuationResponse): boolean {
  return result.modular_system?.enabled === true
}

/**
 * Get total execution time
 */
export function getTotalExecutionTime(result: ValuationResponse): number {
  if (result.modular_system?.total_execution_time_ms) {
    return result.modular_system.total_execution_time_ms
  }
  return 0
}

/**
 * Get data sources from transparency
 */
export function getDataSources(result: ValuationResponse) {
  const sources = result.transparency?.data_sources || []
  dataExtractionLogger.debug('Getting data sources', { count: sources.length })
  return sources
}

/**
 * Get comparable companies from transparency
 */
export function getComparableCompanies(result: ValuationResponse) {
  const fromTransparency = result.transparency?.comparable_companies || []
  const fromLegacy = (result.multiples_valuation as any)?.comparables || []
  const companies = fromTransparency.length > 0 ? fromTransparency : fromLegacy

  dataExtractionLogger.debug('Getting comparable companies', {
    count: companies.length,
    dataSource: fromTransparency.length > 0 ? 'transparency' : 'legacy',
    fallbackUsed: fromTransparency.length === 0 && fromLegacy.length > 0,
  })
  return companies
}

/**
 * Get confidence breakdown
 */
export function getConfidenceBreakdown(result: ValuationResponse) {
  const breakdown = result.transparency?.confidence_breakdown || null
  dataExtractionLogger.debug('Getting confidence breakdown', {
    hasBreakdown: !!breakdown,
    overallScore: breakdown?.overall_score,
  })
  return breakdown
}

/**
 * Get range methodology details
 */
export function getRangeMethodology(result: ValuationResponse) {
  const methodology = result.transparency?.range_methodology || null
  dataExtractionLogger.debug('Getting range methodology', {
    hasMethodology: !!methodology,
    methodology: methodology?.confidence_level,
  })
  return methodology
}

/**
 * Get methodology selection details
 */
export function getMethodologySelection(result: ValuationResponse) {
  const selection = result.methodology_selection || null
  dataExtractionLogger.debug('Getting methodology selection', {
    hasSelection: !!selection,
  })
  return selection
}

/**
 * Get small firm adjustments
 */
export function getSmallFirmAdjustments(result: ValuationResponse) {
  const adjustments = result.small_firm_adjustments || null
  dataExtractionLogger.debug('Getting small firm adjustments', {
    hasAdjustments: !!adjustments,
    hasSizeDiscount: !!adjustments?.size_discount,
    hasLiquidityDiscount: !!adjustments?.liquidity_discount,
  })
  return adjustments
}

/**
 * Get adjustments applied from transparency
 */
export function getAdjustmentsApplied(result: ValuationResponse) {
  const adjustments = result.transparency?.adjustments_applied || []
  dataExtractionLogger.debug('Getting adjustments applied', {
    count: adjustments.length,
    adjustmentTypes: adjustments.map((a: any) => a.type || a.step),
  })
  return adjustments
}
