/**
 * Data Collector Base - Unified Data Collection Logic
 *
 * Single Responsibility: Provide shared data collection, validation, and normalization
 * SOLID Principles: SRP, OCP (open for extension via subclasses)
 *
 * This abstraction extracts the ~60% of logic that's duplicated between
 * ManualFormFieldRenderer and ConversationalFieldRenderer.
 *
 * UI rendering remains in the specific renderers (different UX patterns).
 *
 * @module features/shared/dataCollection/DataCollectorBase
 */

import type {
  DataCollectionMethod,
  DataField,
  ParsedFieldValue,
  ValidationRule,
  ValidationSeverity,
} from '../../../types/data-collection'

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string
  message: string
  severity: ValidationSeverity
}

/**
 * Base class for all data collection methods
 *
 * Subclasses: FormDataCollector, ChatDataCollector, FileDataCollector, etc.
 */
export abstract class DataCollectorBase {
  /**
   * Validate a field value against its validation rules
   *
   * SHARED LOGIC: Same validation rules apply regardless of UI
   *
   * @param field - The field definition with validation rules
   * @param value - The value to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateField(field: DataField, value: ParsedFieldValue): ValidationError[] {
    const errors: ValidationError[] = []

    // Required field validation
    if (field.required && (value === null || value === undefined || value === '')) {
      errors.push({
        field: field.id,
        message: `${field.label} is required`,
        severity: 'error',
      })
      return errors // Early return for required fields
    }

    // Skip other validations if field is empty and not required
    if (value === null || value === undefined || value === '') {
      return errors
    }

    // Type-specific validation
    if (field.validation && Array.isArray(field.validation)) {
      for (const rule of field.validation) {
        const error = this.validateRule(field, value, rule)
        if (error) {
          errors.push(error)
        }
      }
    }

    // Field-type specific validation
    const typeError = this.validateFieldType(field, value)
    if (typeError) {
      errors.push(typeError)
    }

    return errors
  }

  /**
   * Validate a single validation rule
   */
  private validateRule(
    field: DataField,
    value: ParsedFieldValue,
    rule: ValidationRule
  ): ValidationError | null {
    switch (rule.type) {
      case 'required':
        if (value === null || value === undefined || value === '') {
          return {
            field: field.id,
            message: rule.message,
            severity: rule.severity,
          }
        }
        break

      case 'min':
        if (typeof value === 'number' && typeof rule.value === 'number') {
          if (value < rule.value) {
            return {
              field: field.id,
              message: rule.message,
              severity: rule.severity,
            }
          }
        }
        break

      case 'max':
        if (typeof value === 'number' && typeof rule.value === 'number') {
          if (value > rule.value) {
            return {
              field: field.id,
              message: rule.message,
              severity: rule.severity,
            }
          }
        }
        break

      case 'pattern':
        if (typeof value === 'string' && rule.value instanceof RegExp) {
          if (!rule.value.test(value)) {
            return {
              field: field.id,
              message: rule.message,
              severity: rule.severity,
            }
          }
        }
        break

      case 'custom':
        if (typeof rule.value === 'function') {
          if (!rule.value(value)) {
            return {
              field: field.id,
              message: rule.message,
              severity: rule.severity,
            }
          }
        }
        break
    }

    return null
  }

  /**
   * Validate field type constraints
   */
  private validateFieldType(field: DataField, value: ParsedFieldValue): ValidationError | null {
    switch (field.type) {
      case 'number':
      case 'currency':
      case 'percentage':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: field.id,
            message: `${field.label} must be a valid number`,
            severity: 'error',
          }
        }
        break

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: field.id,
            message: `${field.label} must be yes or no`,
            severity: 'error',
          }
        }
        break
    }

    return null
  }

  /**
   * Normalize a field value to its proper type
   *
   * SHARED LOGIC: Same normalization regardless of input method
   *
   * @param field - The field definition
   * @param value - The raw value (string, number, etc.)
   * @returns Normalized and typed value
   */
  normalizeValue(field: DataField, value: unknown): ParsedFieldValue {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return this.getDefaultValue(field)
    }

    // Type-specific normalization
    switch (field.type) {
      case 'text':
      case 'textarea':
        return String(value).trim()

      case 'number':
        return this.normalizeNumber(value)

      case 'currency':
        return this.normalizeCurrency(value)

      case 'percentage':
        return this.normalizePercentage(value)

      case 'boolean':
        return this.normalizeBoolean(value)

      case 'select':
      case 'multiselect':
        return this.normalizeSelect(value, field)

      case 'date':
        return this.normalizeDate(value)

      default:
        return String(value)
    }
  }

  /**
   * Get default value for a field type
   */
  private getDefaultValue(field: DataField): ParsedFieldValue {
    // Check if field has a default value property (future enhancement)
    const fieldWithDefault = field as DataField & { defaultValue?: ParsedFieldValue }
    if (fieldWithDefault.defaultValue !== undefined) {
      return fieldWithDefault.defaultValue
    }

    switch (field.type) {
      case 'boolean':
        return false
      case 'number':
      case 'currency':
      case 'percentage':
        return 0
      default:
        return ''
    }
  }

  /**
   * Normalize number values
   */
  private normalizeNumber(value: unknown): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      // Remove thousand separators, spaces
      const cleaned = value.replace(/[,\s]/g, '')
      const parsed = parseFloat(cleaned)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  /**
   * Normalize currency values (removes symbols, handles formatting)
   */
  private normalizeCurrency(value: unknown): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      // Remove currency symbols, thousand separators, spaces
      const cleaned = value.replace(/[$€£¥,\s]/g, '')
      const parsed = parseFloat(cleaned)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  /**
   * Normalize percentage values (converts 0-100 to 0-1 if needed)
   */
  private normalizePercentage(value: unknown): number {
    const num = this.normalizeNumber(value)
    // If value is > 1, assume it's in 0-100 format, convert to 0-1
    return num > 1 ? num / 100 : num
  }

  /**
   * Normalize boolean values
   */
  private normalizeBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim()
      return lower === 'yes' || lower === 'true' || lower === '1' || lower === 'y'
    }
    if (typeof value === 'number') return value !== 0
    return false
  }

  /**
   * Normalize select values
   */
  private normalizeSelect(value: unknown, field: DataField): string {
    if (typeof value === 'string') return value.trim()
    if (Array.isArray(value) && field.type === 'multiselect') {
      return value.join(',')
    }
    return String(value)
  }

  /**
   * Normalize date values
   */
  private normalizeDate(value: unknown): string {
    if (typeof value === 'string') return value.trim()
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  /**
   * Format a value for display (opposite of normalize)
   *
   * SHARED LOGIC: Same formatting rules for display
   */
  formatValue(field: DataField, value: ParsedFieldValue): string {
    if (value === null || value === undefined) return ''

    switch (field.type) {
      case 'currency':
        return this.formatCurrency(value as number)

      case 'percentage':
        return this.formatPercentage(field, value as number)

      case 'number':
        return this.formatNumber(value as number)

      case 'boolean':
        return value ? 'Yes' : 'No'

      default:
        return String(value)
    }
  }

  /**
   * Format currency for display
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  /**
   * Format percentage for display
   */
  private formatPercentage(field: DataField, value: number): string {
    // Convert 0-1 to 0-100 for display
    const percentage = value < 1 ? value * 100 : value
    const decimals = this.isShareholdingField(field) ? 2 : 1
    return `${percentage.toFixed(decimals)}%`
  }

  private isShareholdingField(field: DataField): boolean {
    const fieldId = field.id.toLowerCase()
    return ['shares_for_sale', 'sharesforsale', 'equitystake', 'equity_stake'].includes(fieldId)
  }

  /**
   * Format number for display (with thousand separators)
   */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(value)
  }

  /**
   * Get collection method identifier
   *
   * ABSTRACT: Each collector implements its own method
   */
  abstract getCollectionMethod(): DataCollectionMethod

  /**
   * Get user-friendly name for this collection method
   */
  abstract getDisplayName(): string
}

/**
 * Form-based data collector (for manual flow)
 */
export class FormDataCollector extends DataCollectorBase {
  getCollectionMethod(): DataCollectionMethod {
    return 'manual_form'
  }

  getDisplayName(): string {
    return 'Manual Form'
  }
}

/**
 * Conversational data collector (for chat flow)
 */
export class ChatDataCollector extends DataCollectorBase {
  getCollectionMethod(): DataCollectionMethod {
    return 'conversational'
  }

  getDisplayName(): string {
    return 'AI Assistant'
  }
}

/**
 * Suggestion-based data collector (for quick selection)
 */
export class SuggestionDataCollector extends DataCollectorBase {
  getCollectionMethod(): DataCollectionMethod {
    return 'suggestion'
  }

  getDisplayName(): string {
    return 'Quick Select'
  }
}

/**
 * File upload data collector (future)
 */
export class FileDataCollector extends DataCollectorBase {
  getCollectionMethod(): DataCollectionMethod {
    return 'file_upload'
  }

  getDisplayName(): string {
    return 'File Upload'
  }
}

// Export singleton instances for convenience
export const formCollector = new FormDataCollector()
export const chatCollector = new ChatDataCollector()
export const suggestionCollector = new SuggestionDataCollector()
export const fileCollector = new FileDataCollector()
