/**
 * Session Validation Utilities
 *
 * Single Responsibility: Validate session data integrity
 * Prevents crashes from corrupted or incomplete session data
 *
 * @module utils/sessionValidation
 */

import type { ValuationSession } from '../types/valuation'
import { dateLikeToUnixMs } from './date-like'
import { ValidationError } from './errors/ApplicationErrors'
import { createContextLogger } from './logger'
import { getRenderableReportHtml } from './safetyNetReportHtml'

const validationLogger = createContextLogger('SessionValidation')

/**
 * Validate session data structure and required fields
 *
 * Ensures loaded session has:
 * - Required ID (reportId)
 * - Valid currentView
 * - Initialized data objects
 * - Valid timestamps
 *
 * @param session - Session to validate
 * @throws ValidationError if session data is invalid
 *
 * @example
 * ```typescript
 * const session = await backendAPI.getValuationSession(reportId)
 * validateSessionData(session) // Throws if invalid
 * // Safe to use session
 * ```
 */
export function validateSessionData(session: any): asserts session is ValuationSession {
  // Critical IDs
  if (!session) {
    throw new ValidationError('Session is null or undefined')
  }

  if (!session.reportId || typeof session.reportId !== 'string') {
    throw new ValidationError('Session missing or invalid reportId')
  }

  // Validate currentView
  if (!session.currentView) {
    // Auto-fix: default to manual
    validationLogger.warn('Session missing currentView, defaulting to manual', {
      reportId: session.reportId,
    })
    session.currentView = 'manual'
  }

  if (session.currentView !== 'manual' && session.currentView !== 'conversational') {
    throw new ValidationError(`Invalid currentView: ${session.currentView}`)
  }

  // Initialize missing data objects (auto-fix instead of throwing)
  if (!session.partialData) {
    validationLogger.debug('Session missing partialData, initializing from session_data', {
      reportId: session.reportId,
    })
    // ✅ FIX: Initialize partialData from session_data if available
    session.partialData = session.sessionData ? { ...session.sessionData } : {}
  }

  if (!session.sessionData) {
    validationLogger.debug('Session missing sessionData, initializing empty', {
      reportId: session.reportId,
    })
    session.sessionData = {}
  }

  // Validate timestamps (auto-fix corrupted dates)
  // ✅ CRITICAL FIX: Ensure dates are always valid Date objects (JSON may yield strings).
  if (session.createdAt) {
    const createdMs = dateLikeToUnixMs(session.createdAt)
    if (createdMs === null) {
      validationLogger.warn('Invalid createdAt timestamp, resetting', {
        reportId: session.reportId,
        createdAt: session.createdAt,
        createdAtType: typeof session.createdAt,
      })
      session.createdAt = new Date()
    } else {
      session.createdAt = new Date(createdMs)
    }
  } else {
    session.createdAt = new Date()
  }

  // ✅ FIX: Also validate updatedAt
  if (session.updatedAt) {
    const updatedMs = dateLikeToUnixMs(session.updatedAt)
    if (updatedMs === null) {
      validationLogger.warn('Invalid updatedAt timestamp, resetting', {
        reportId: session.reportId,
        updatedAt: session.updatedAt,
      })
      session.updatedAt = new Date()
    } else {
      session.updatedAt = new Date(updatedMs)
    }
  } else {
    session.updatedAt = new Date()
  }

  validationLogger.info('Session validation passed', {
    reportId: session.reportId,
    currentView: session.currentView,
  })
}

/**
 * Validate version data structure
 *
 * @param version - Version to validate
 * @throws ValidationError if version data is invalid
 */
export function validateVersionData(version: any): void {
  if (!version) {
    throw new ValidationError('Version is null or undefined')
  }

  if (!version.id || typeof version.id !== 'string') {
    throw new ValidationError('Version missing or invalid id')
  }

  if (!version.reportId || typeof version.reportId !== 'string') {
    throw new ValidationError('Version missing or invalid reportId')
  }

  if (typeof version.versionNumber !== 'number' || version.versionNumber < 1) {
    throw new ValidationError('Version missing or invalid versionNumber')
  }

  if (!version.formData) {
    throw new ValidationError('Version missing formData')
  }

  validationLogger.info('Version validation passed', {
    versionId: version.id,
    reportId: version.reportId,
    versionNumber: version.versionNumber,
  })
}

/**
 * Check if session is restorable (has minimum required data)
 *
 * @param session - Session to check
 * @returns true if session can be restored
 */
export function isSessionRestorable(session: ValuationSession): boolean {
  try {
    validateSessionData(session)
    return true
  } catch {
    return false
  }
}

/**
 * Sanitize session data (remove invalid fields, normalize structure)
 *
 * @param session - Session to sanitize
 * @returns Sanitized session
 */
export function sanitizeSessionData(session: any): ValuationSession {
  const createdMs = session.createdAt ? dateLikeToUnixMs(session.createdAt) : null
  const updatedMs = session.updatedAt ? dateLikeToUnixMs(session.updatedAt) : null
  const completedMs = session.completedAt ? dateLikeToUnixMs(session.completedAt) : null

  const sanitized = {
    reportId: String(session.reportId || ''),
    currentView: session.currentView === 'conversational' ? 'conversational' : 'manual',
    partialData: session.partialData || {},
    sessionData: session.sessionData || {},
    dataSource: session.dataSource || 'manual_entry',
    createdAt: createdMs !== null ? new Date(createdMs) : new Date(),
    updatedAt: updatedMs !== null ? new Date(updatedMs) : new Date(),
    completedAt: completedMs !== null ? new Date(completedMs) : undefined,
    // ✅ BANK-GRADE FIX: Preserve top-level valuation fields for restoration detection
    // These fields are used by cache completeness checks and restoration logic
    valuationResult: session.valuationResult || undefined,
    htmlReport: getRenderableReportHtml(session.htmlReport) || undefined,
  }

  // Validate sanitized data
  validateSessionData(sanitized)

  return sanitized as ValuationSession
}
