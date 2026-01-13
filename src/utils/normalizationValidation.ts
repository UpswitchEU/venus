/**
 * Professional Validation Utilities for EBITDA Normalization
 *
 * Provides threshold warnings, reasonableness checks, and professional guidance
 * for normalization adjustments without mentioning specific consulting firms
 */

import { getCategoryDefinition } from '../config/normalizationCategories'
import {
  CustomAdjustment,
  NormalizationAdjustment,
  NormalizationCategory,
} from '../types/ebitdaNormalization'

export interface ValidationResult {
  isValid: boolean
  severity: 'error' | 'warning' | 'info'
  message: string
  category?: NormalizationCategory
  suggestedAction?: string
}

export interface NormalizationValidation {
  hasErrors: boolean
  hasWarnings: boolean
  results: ValidationResult[]
  overallScore: 'poor' | 'acceptable' | 'good' | 'excellent'
}

/**
 * Validate a single adjustment against category rules
 */
export function validateAdjustment(
  category: NormalizationCategory,
  amount: number,
  note?: string
): ValidationResult[] {
  const results: ValidationResult[] = []
  const definition = getCategoryDefinition(category)

  if (!definition) {
    return [
      {
        isValid: false,
        severity: 'error',
        message: 'Unknown adjustment category',
        category,
      },
    ]
  }

  const { validationRules, label } = definition

  // Check min/max bounds
  if (amount < validationRules.min || amount > validationRules.max) {
    results.push({
      isValid: false,
      severity: 'error',
      message: `${label}: Amount must be between €${validationRules.min.toLocaleString()} and €${validationRules.max.toLocaleString()}`,
      category,
      suggestedAction: 'Reduce the adjustment amount or split across multiple categories',
    })
  }

  // Check warning threshold
  if (validationRules.warningThreshold && Math.abs(amount) > validationRules.warningThreshold) {
    results.push({
      isValid: true,
      severity: 'warning',
      message: `${label}: ${validationRules.warningMessage || 'Large adjustment detected'}`,
      category,
      suggestedAction: 'Ensure strong documentation and justification for this adjustment',
    })
  }

  // Check if note is provided for significant adjustments
  if (Math.abs(amount) > 10000 && (!note || note.trim().length < 10)) {
    results.push({
      isValid: true,
      severity: 'warning',
      message: `${label}: Adjustment of €${Math.abs(amount).toLocaleString()} requires detailed documentation`,
      category,
      suggestedAction: 'Add a comprehensive note explaining the rationale and supporting evidence',
    })
  }

  return results
}

/**
 * Validate all adjustments for a normalization
 */
export function validateNormalization(
  adjustments: NormalizationAdjustment[],
  customAdjustments: CustomAdjustment[],
  reportedEbitda: number
): NormalizationValidation {
  const results: ValidationResult[] = []

  // Validate each standard adjustment
  adjustments.forEach((adj) => {
    if (adj.amount !== 0) {
      const adjResults = validateAdjustment(adj.category, adj.amount, adj.note)
      results.push(...adjResults)
    }
  })

  // Validate custom adjustments
  customAdjustments.forEach((custom, index) => {
    if (!custom.description || custom.description.trim().length < 5) {
      results.push({
        isValid: false,
        severity: 'error',
        message: `Custom adjustment #${index + 1}: Description must be at least 5 characters`,
        suggestedAction: 'Provide a clear, specific description of the adjustment',
      })
    }

    if (Math.abs(custom.amount) > 30000 && (!custom.note || custom.note.trim().length < 20)) {
      results.push({
        isValid: true,
        severity: 'warning',
        message: `Custom adjustment "${custom.description}": Large adjustments require extensive documentation`,
        suggestedAction: 'Add detailed notes explaining the rationale and justification',
      })
    }
  })

  // Calculate total adjustments
  const totalStandard = adjustments.reduce((sum, adj) => sum + adj.amount, 0)
  const totalCustom = customAdjustments.reduce((sum, adj) => sum + adj.amount, 0)
  const totalAdjustments = totalStandard + totalCustom

  // Check overall adjustment magnitude
  if (reportedEbitda !== 0) {
    const adjustmentPercentage = Math.abs((totalAdjustments / reportedEbitda) * 100)

    if (adjustmentPercentage > 50) {
      results.push({
        isValid: true,
        severity: 'warning',
        message: `Total adjustments (${adjustmentPercentage.toFixed(1)}%) exceed 50% of reported EBITDA`,
        suggestedAction:
          'Large adjustments may raise buyer concerns. Ensure comprehensive documentation and consider independent verification',
      })
    } else if (adjustmentPercentage > 30) {
      results.push({
        isValid: true,
        severity: 'info',
        message: `Total adjustments represent ${adjustmentPercentage.toFixed(1)}% of reported EBITDA`,
        suggestedAction: 'Ensure all adjustments are well-documented with clear rationales',
      })
    }
  }

  // Check for conflicting adjustments
  const positiveCount = [
    ...adjustments,
    ...customAdjustments.map((c) => ({ amount: c.amount })),
  ].filter((a) => a.amount > 0).length
  const negativeCount = [
    ...adjustments,
    ...customAdjustments.map((c) => ({ amount: c.amount })),
  ].filter((a) => a.amount < 0).length

  if (positiveCount > 0 && negativeCount > 0 && totalAdjustments === 0) {
    results.push({
      isValid: true,
      severity: 'info',
      message: 'Adjustments offset each other (net zero)',
      suggestedAction: 'Review if all offsetting adjustments are necessary',
    })
  }

  // Check for excessive custom adjustments
  if (customAdjustments.length > 5) {
    results.push({
      isValid: true,
      severity: 'warning',
      message: `${customAdjustments.length} custom adjustments may be excessive`,
      suggestedAction: 'Consider consolidating similar adjustments or using standard categories',
    })
  }

  // Determine overall score
  const hasErrors = results.some((r) => r.severity === 'error')
  const hasWarnings = results.some((r) => r.severity === 'warning')
  const warningCount = results.filter((r) => r.severity === 'warning').length

  let overallScore: 'poor' | 'acceptable' | 'good' | 'excellent'
  if (hasErrors) {
    overallScore = 'poor'
  } else if (warningCount > 3) {
    overallScore = 'acceptable'
  } else if (warningCount > 0) {
    overallScore = 'good'
  } else {
    overallScore = 'excellent'
  }

  return {
    hasErrors,
    hasWarnings,
    results,
    overallScore,
  }
}

/**
 * Get professional guidance for a specific adjustment amount
 */
export function getAdjustmentGuidance(
  category: NormalizationCategory,
  amount: number,
  reportedEbitda: number
): string | null {
  const definition = getCategoryDefinition(category)
  if (!definition) return null

  const percentage = reportedEbitda !== 0 ? Math.abs((amount / reportedEbitda) * 100) : 0

  if (percentage < 2) {
    return 'This adjustment is relatively small and unlikely to raise concerns.'
  } else if (percentage < 10) {
    return 'This is a moderate adjustment. Ensure you have clear documentation.'
  } else if (percentage < 25) {
    return 'This is a significant adjustment. Buyers will scrutinize this carefully. Provide detailed evidence and rationale.'
  } else {
    return 'This is a major adjustment that will receive intensive scrutiny. Consider independent verification and comprehensive documentation.'
  }
}

/**
 * Check if normalization is ready for buyer review
 */
export function isReadyForBuyerReview(
  adjustments: NormalizationAdjustment[],
  customAdjustments: CustomAdjustment[],
  reportedEbitda: number
): { ready: boolean; issues: string[] } {
  const issues: string[] = []

  // Check for any adjustments without notes above threshold
  adjustments.forEach((adj) => {
    if (Math.abs(adj.amount) > 20000 && (!adj.note || adj.note.trim().length < 20)) {
      const definition = getCategoryDefinition(adj.category)
      issues.push(
        `${definition?.label || adj.category}: Missing detailed documentation for ${Math.abs(adj.amount).toLocaleString()}€ adjustment`
      )
    }
  })

  customAdjustments.forEach((custom) => {
    if (Math.abs(custom.amount) > 15000 && (!custom.note || custom.note.trim().length < 20)) {
      issues.push(
        `Custom: "${custom.description}" needs detailed justification for ${Math.abs(custom.amount).toLocaleString()}€`
      )
    }
  })

  // Check total magnitude
  const total =
    adjustments.reduce((sum, adj) => sum + adj.amount, 0) +
    customAdjustments.reduce((sum, adj) => sum + adj.amount, 0)

  if (reportedEbitda !== 0) {
    const percentage = Math.abs((total / reportedEbitda) * 100)
    if (percentage > 40 && adjustments.filter((a) => a.note && a.note.length > 30).length < 3) {
      issues.push(
        'Large overall adjustment (>40%) requires extensive documentation across multiple categories'
      )
    }
  }

  return {
    ready: issues.length === 0,
    issues,
  }
}

/**
 * Get color coding for adjustment severity
 */
export function getAdjustmentSeverityColor(
  amount: number,
  reportedEbitda: number
): 'green' | 'yellow' | 'orange' | 'red' {
  const percentage = reportedEbitda !== 0 ? Math.abs((amount / reportedEbitda) * 100) : 0

  if (percentage < 5) return 'green'
  if (percentage < 15) return 'yellow'
  if (percentage < 30) return 'orange'
  return 'red'
}
