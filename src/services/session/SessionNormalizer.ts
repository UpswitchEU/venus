/**
 * Session Data Normalizer
 *
 * World-class data normalization layer that converts backend session data
 * to a consistent frontend format. This is the SINGLE source of truth for
 * all naming conversions between backend (snake_case) and frontend (camelCase).
 *
 * Key Principles:
 * - Normalize ONCE at the API boundary
 * - Handle both camelCase and snake_case inputs gracefully
 * - Provide type-safe output structure
 * - No scattered conversion logic elsewhere
 *
 * @module services/session/SessionNormalizer
 */

import type { MethodWeightsDataPlan } from '../../types/methodDataPlan'
import type { ValuationRequest, ValuationResponse } from '../../types/valuation'
import { isSessionKey, isUuid } from '../../utils/identifiers'
import { generalLogger } from '../../utils/logger'
import { sessionEnvelopeHasIdentitySignals } from '../../utils/mergeOptionalSessionPrefillFields'
import {
  extractStableSessionKeyFromMergedSession,
  mergeSessionDataEnvelopesFromRoot,
} from '../../utils/sessionReportIdentity'
import { extractFormData } from './SessionFormDataNormalizer'
import {
  extractMethodDataPlan,
  extractMethodSelectionHints,
  type SessionMethodSelectionHints,
} from './SessionMethodSelectionNormalizer'
import {
  extractHtmlReport,
  extractPricingRange,
  extractValuationResult,
  type PricingRange,
} from './SessionValuationOutputNormalizer'

type SessionRecord = Record<string, unknown>

function isRecord(value: unknown): value is SessionRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): SessionRecord | null {
  return isRecord(value) ? value : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeStatus(value: unknown): NormalizedSessionData['status'] {
  return value === 'completed' || value === 'expired' ? value : 'active'
}

/**
 * Normalized session data structure
 * All fields use consistent camelCase naming
 */
export interface NormalizedSessionData {
  // Session metadata
  reportId: string
  flowType: 'manual' | 'conversational'
  status: 'active' | 'completed' | 'expired'
  sessionKey?: string
  engineRunId?: string
  reportStatus: 'draft' | 'import_review' | 'calculating' | 'ready' | 'failed'
  origin: 'native' | 'migrated_legacy'

  // Timestamps
  createdAt: Date | null
  updatedAt: Date | null
  completedAt: Date | null

  // Form data (normalized to frontend format)
  formData: Partial<ValuationRequest>

  // Valuation result (normalized)
  valuationResult: ValuationResponse | null
  htmlReport: string | null
  pricingRange: PricingRange | null
  reportReady: boolean

  // Client context (for accountant flow)
  clientContext: {
    accountantUserId: string
    clientUserId: string | null
    relationshipId: string
  } | null

  // Metadata
  dataSource: 'manual' | 'conversational' | 'mixed'
  hasExistingData: boolean

  /**
   * Upfront valuation method preference (session JSONB `_pre_selected_valuation_method`).
   * Only used when no valuation result exists yet; otherwise `selected_valuation_method` on the result wins.
   * `undefined` = key absent (do not overwrite store); `null` = explicitly adaptive; string = method key.
   */
  preSelectedValuationMethod: SessionMethodSelectionHints['preSelectedValuationMethod']

  /** Multi-method selection for blended valuation. */
  preSelectedMethods: SessionMethodSelectionHints['preSelectedMethods']
  /** User-configured weights (method_key → 0-100). */
  userWeights: SessionMethodSelectionHints['userWeights']
  /** Accountant justification for chosen weighting. */
  userWeightJustification: SessionMethodSelectionHints['userWeightJustification']

  /**
   * BET-325 — the agent's per-method data-input plan (what to collect to unlock
   * each weighted method), lifted from the `_data_input_plan` session key Titan
   * read-enriches. `null` when absent (default) → the adaptive panel stays dormant.
   */
  methodDataPlan: MethodWeightsDataPlan | null

  /**
   * Raw session JSONB used at restore time — same blob passed to {@link extractFormData}.
   * Flat extract can miss Mercury `_businessInfo` / nested overlays; gap-fill merges this envelope.
   */
  sessionDataEnvelope: Record<string, unknown>
}

/**
 * Normalize flow type from various backend formats
 */
function normalizeFlowType(input: string | undefined | null): 'manual' | 'conversational' {
  if (!input) return 'manual'

  const normalized = input.toLowerCase().trim()

  switch (normalized) {
    case 'conversational':
    case 'ai-guided':
    case 'advanced':
      return 'conversational'
    case 'manual':
    case 'simple':
    default:
      return 'manual'
  }
}

/**
 * Extract client context from session data
 */
function extractClientContext(sessionData: SessionRecord): NormalizedSessionData['clientContext'] {
  const context = asRecord(sessionData._client_context) ?? asRecord(sessionData.clientContext)

  if (!context) return null

  // Normalize field names
  const accountantUserId =
    optionalString(context.accountant_user_id) ?? optionalString(context.accountantUserId)
  const clientUserIdSnake = optionalString(context.client_user_id)
  const clientUserIdCamel = optionalString(context.clientUserId)
  const clientUserId: string | null =
    clientUserIdSnake !== undefined
      ? clientUserIdSnake
      : clientUserIdCamel !== undefined
        ? clientUserIdCamel
        : null
  const relationshipId =
    optionalString(context.relationship_id) ?? optionalString(context.relationshipId)

  if (!accountantUserId || !relationshipId) return null

  return {
    accountantUserId,
    clientUserId,
    relationshipId,
  }
}

/**
 * Check if session has meaningful existing data
 * Includes form inputs, valuation result, and HTML output for complete restoration
 */
function hasExistingData(
  formData: Partial<ValuationRequest>,
  valuationResult: ValuationResponse | null,
  htmlReport?: string | null
): boolean {
  // Has form data if company_name or key financial data exists
  const hasFormData = !!(
    formData.company_name ||
    formData.revenue ||
    formData.current_year_data ||
    formData.historical_years_data ||
    formData.kbo_number ||
    formData.business_type_id
  )

  // Has valuation result
  const hasResult = !!valuationResult

  // Has output assets (HTML reports)
  const hasOutput = !!htmlReport?.trim()

  return hasFormData || hasResult || hasOutput
}

function deriveReportReady(params: {
  backendSession: SessionRecord
  valuationResult: ValuationResponse | null
  htmlReport: string | null
}): boolean {
  const explicitReady = params.backendSession.reportReady
  if (typeof explicitReady === 'boolean') {
    return explicitReady
  }

  const status = params.backendSession.status
  if (status === 'completed') {
    return !!(params.valuationResult || params.htmlReport?.trim())
  }

  return true
}

/**
 * Main normalization function
 *
 * Takes raw backend session data and converts it to a consistent
 * frontend format with all naming normalized to camelCase.
 *
 * @param backendSession - Raw session data from backend API
 * @returns Normalized session data ready for store hydration
 */
export function normalizeSessionData(backendSession: unknown): NormalizedSessionData {
  const backendRecord = asRecord(backendSession)
  if (!backendRecord) {
    generalLogger.warn('[SessionNormalizer] Received null/undefined session')
    return createEmptyNormalizedData('')
  }

  const sessionData = mergeSessionDataEnvelopesFromRoot(backendRecord)

  // A durable UUID owns routing. The val_* key remains an explicit draft/session
  // identity and is only used before Titan has promoted the report.
  const preferredSessionKey = extractStableSessionKeyFromMergedSession(backendRecord)

  const explicitReportId =
    typeof backendRecord.reportId === 'string' ? backendRecord.reportId.trim() : ''

  const reportId =
    (isUuid(explicitReportId) ? explicitReportId : '') ||
    preferredSessionKey ||
    explicitReportId ||
    (typeof backendRecord.id === 'string' && isSessionKey(backendRecord.id.trim())
      ? backendRecord.id.trim()
      : '')

  // Extract and normalize all data
  const formData = extractFormData(sessionData)
  const valuationResult = extractValuationResult(sessionData, backendRecord)
  const htmlReport = extractHtmlReport(sessionData, backendRecord)
  const pricingRange = extractPricingRange(sessionData, backendRecord)
  const clientContext = extractClientContext(sessionData)
  const reportReady = deriveReportReady({
    backendSession: backendRecord,
    valuationResult,
    htmlReport,
  })

  const hasMergedEnvelopeIdentity = sessionEnvelopeHasIdentitySignals(sessionData)

  const methodSelection = extractMethodSelectionHints(sessionData)

  const sessionDataEnvelope: Record<string, unknown> =
    sessionData && typeof sessionData === 'object' && !Array.isArray(sessionData)
      ? (sessionData as Record<string, unknown>)
      : {}

  const normalized: NormalizedSessionData = {
    // Metadata
    reportId,
    ...(preferredSessionKey ? { sessionKey: preferredSessionKey } : {}),
    ...(typeof backendRecord.engineRunId === 'string' &&
    /^val_[A-Za-z0-9_-]+$/.test(backendRecord.engineRunId)
      ? { engineRunId: backendRecord.engineRunId }
      : {}),
    reportStatus:
      backendRecord.reportStatus === 'import_review' ||
      backendRecord.reportStatus === 'calculating' ||
      backendRecord.reportStatus === 'ready' ||
      backendRecord.reportStatus === 'failed'
        ? backendRecord.reportStatus
        : 'draft',
    origin: backendRecord.origin === 'migrated_legacy' ? 'migrated_legacy' : 'native',
    flowType: normalizeFlowType(
      optionalString(backendRecord.currentView) ?? optionalString(sessionData.currentView)
    ),
    status: normalizeStatus(backendRecord.status),

    // Timestamps
    createdAt: optionalDate(backendRecord.createdAt),
    updatedAt: optionalDate(backendRecord.updatedAt),
    completedAt: optionalDate(backendRecord.completedAt),

    // Form data
    formData,

    // Valuation result and HTML
    valuationResult,
    htmlReport,
    pricingRange,
    reportReady,

    // Context
    clientContext,
    dataSource: normalizeFlowType(
      optionalString(backendRecord.dataSource) ?? optionalString(sessionData.dataSource)
    ),
    hasExistingData:
      hasExistingData(formData, valuationResult, htmlReport) || hasMergedEnvelopeIdentity,
    preSelectedValuationMethod: methodSelection.preSelectedValuationMethod,
    preSelectedMethods: methodSelection.preSelectedMethods,
    userWeights: methodSelection.userWeights,
    userWeightJustification: methodSelection.userWeightJustification,
    methodDataPlan: extractMethodDataPlan(sessionData) ?? null,

    sessionDataEnvelope,
  }

  generalLogger.debug('[SessionNormalizer] Normalized session data', {
    reportId: normalized.reportId,
    flowType: normalized.flowType,
    hasFormData: Object.keys(normalized.formData).length > 0,
    hasValuationResult: !!normalized.valuationResult,
    hasHtmlReport: !!normalized.htmlReport,
    hasPricingRange: !!normalized.pricingRange,
    reportReady: normalized.reportReady,
    hasClientContext: !!normalized.clientContext,
    formDataKeys: Object.keys(normalized.formData),
  })

  return normalized
}

/**
 * Create empty normalized data structure
 */
export function createEmptyNormalizedData(reportId: string): NormalizedSessionData {
  return {
    reportId,
    reportStatus: 'draft',
    origin: 'native',
    flowType: 'manual',
    status: 'active',
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    formData: {},
    valuationResult: null,
    htmlReport: null,
    pricingRange: null,
    reportReady: true,
    clientContext: null,
    dataSource: 'manual',
    hasExistingData: false,
    preSelectedValuationMethod: undefined,
    preSelectedMethods: undefined,
    userWeights: undefined,
    userWeightJustification: undefined,
    methodDataPlan: null,
    sessionDataEnvelope: {},
  }
}

/**
 * Validate normalized session data
 * Returns true if data is valid for restoration
 */
export function validateNormalizedData(data: NormalizedSessionData): boolean {
  // Must have a reportId
  if (!data.reportId) {
    generalLogger.warn('[SessionNormalizer] Validation failed: missing reportId')
    return false
  }

  // Flow type must be valid
  if (!['manual', 'conversational'].includes(data.flowType)) {
    generalLogger.warn('[SessionNormalizer] Validation failed: invalid flowType', {
      flowType: data.flowType,
    })
    return false
  }

  return true
}
