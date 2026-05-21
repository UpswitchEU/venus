/**
 * InputValidator - Handles input validation for StreamingChat component
 *
 * Extracted from StreamingChat.tsx to reduce component complexity and improve maintainability.
 * Centralizes all validation logic including PII detection, profanity filtering, and business logic validation.
 */

import { chatLogger } from '../logger'

// Re-export types for convenience
export interface InputValidation {
  is_valid: boolean
  errors: string[]
  warnings: string[]
  sanitized_input: string
  detected_pii: boolean
  confidence: number
}

interface ValidationMessageContext {
  content?: string
}

/**
 * Input validation constants
 */
const MAX_MESSAGE_LENGTH = 1000
const MIN_MESSAGE_LENGTH = 1

/**
 * Centralized input validator for streaming chat
 *
 * Handles all input validation including:
 * - Length validation
 * - PII detection
 * - Profanity filtering
 * - Business logic validation
 * - Content safety checks
 */
export class InputValidator {
  private readonly maxMessageLength = MAX_MESSAGE_LENGTH
  private readonly minMessageLength = MIN_MESSAGE_LENGTH

  /**
   * Validate user input with comprehensive checks
   *
   * @param input - User input string to validate
   * @param messages - Array of previous messages for context
   * @param sessionId - Session identifier for logging
   * @returns Promise<InputValidation> - Validation result with errors and warnings
   */
  async validateInput(
    input: string,
    messages: ValidationMessageContext[] = [],
    sessionId?: string
  ): Promise<InputValidation> {
    const validation: InputValidation = {
      is_valid: true,
      errors: [],
      warnings: [],
      sanitized_input: input.trim(),
      detected_pii: false,
      confidence: 1.0,
    }

    // Length validation
    this.validateLength(input, validation)

    // PII detection
    this.detectPII(input, validation)

    // Content safety
    this.checkContentSafety(input, validation)

    // Business logic validation
    this.validateBusinessLogic(input, messages, validation)

    // Log validation results
    chatLogger.debug('Input validation completed', {
      sessionId,
      isValid: validation.is_valid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      detectedPII: validation.detected_pii,
      confidence: validation.confidence,
    })

    return validation
  }

  /**
   * Validate input length
   */
  private validateLength(input: string, validation: InputValidation): void {
    if (input.length > this.maxMessageLength) {
      validation.is_valid = false
      validation.errors.push(`Message too long (max ${this.maxMessageLength} characters)`)
    }

    if (input.length < this.minMessageLength) {
      validation.is_valid = false
      validation.errors.push('Message cannot be empty')
    }
  }

  /**
   * Detect potential PII in input
   */
  private detectPII(input: string, validation: InputValidation): void {
    if (this.containsPII(input)) {
      validation.detected_pii = true
      validation.warnings.push('Detected potential sensitive information')
      validation.confidence = 0.7 // Lower confidence due to PII
    }
  }

  /**
   * Check for profanity and inappropriate content
   */
  private checkContentSafety(input: string, validation: InputValidation): void {
    if (this.containsProfanity(input)) {
      validation.is_valid = false
      validation.errors.push('Please keep conversation professional')
    }
  }

  /**
   * Validate business logic based on conversation context
   */
  private validateBusinessLogic(
    input: string,
    messages: ValidationMessageContext[],
    validation: InputValidation
  ): void {
    // Check if we're expecting a numeric input based on previous message
    const isNumericField =
      messages.length > 0 &&
      (messages[messages.length - 1]?.content?.toLowerCase().includes('revenue') ||
        messages[messages.length - 1]?.content?.toLowerCase().includes('profit') ||
        messages[messages.length - 1]?.content?.toLowerCase().includes('ebitda'))

    if (isNumericField && !this.isValidNumber(input)) {
      validation.is_valid = false
      validation.errors.push('Please enter a valid number')
    }
  }

  /**
   * Check if input contains PII patterns
   */
  private containsPII(input: string): boolean {
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-\d{3}-\d{4}\b/, // Phone
    ]
    return piiPatterns.some((pattern) => pattern.test(input))
  }

  /**
   * Check if input contains profanity
   */
  private containsProfanity(input: string): boolean {
    // Simple profanity detection (in production, use a proper library)
    const profanityWords = ['damn', 'hell', 'shit', 'fuck', 'bitch', 'ass']
    const lowerInput = input.toLowerCase()
    return profanityWords.some((word) => lowerInput.includes(word))
  }

  /**
   * Check if input is a valid number
   */
  private isValidNumber(input: string): boolean {
    const num = parseFloat(input)
    return !isNaN(num) && isFinite(num) && num >= 0
  }

  /**
   * Get validation constants for external use
   */
  getConstants() {
    return {
      maxMessageLength: this.maxMessageLength,
      minMessageLength: this.minMessageLength,
    }
  }
}
