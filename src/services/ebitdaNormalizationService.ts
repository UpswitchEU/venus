/**
 * EBITDA Normalization API Service
 *
 * Handles all API interactions for EBITDA normalization feature
 * Supports the first primitive: the normalization bridge (economic truth)
 *
 * CRITICAL: Adds client context headers (X-Client-User-Id, X-Accountant-User-Id,
 * X-Relationship-Id) when in accountant-client flow. Without these, Titan cannot
 * resolve sessions and normalization save fails with "Normalisatie niet opgeslagen".
 *
 * Request validation (session id length, year range, payload shape) mirrors Titan’s
 * `VenusNormalizationController` so bad requests fail before the network. Call sites
 * that run before a durable report/session id exists (bootstrap, empty session) should
 * skip calls using `isValidSessionId` — same pattern as `normalizationPersist` and
 * `normalizationSnapshot` — so integration flows never depend on “fire invalid id”.
 */

import { useClientContext } from '../stores/clientContext'
import {
  CreateNormalizationRequest,
  GetNormalizationResponse,
  MarketRatesResponse,
} from '../types/ebitdaNormalization'
import { runTitanNormalizationMutationExclusive } from '../utils/normalizationTitanMutationGate'
import { isValidSessionId } from '../utils/sessionIdValidation'

// Use Next.js API proxy routes (same-origin) to avoid CORS issues.
// These proxy to Titan's `/api/normalization/*` endpoints.
const API_BASE_URL = ''

/**
 * API Error with structured response
 */
export class NormalizationAPIError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'NormalizationAPIError'
  }
}

export interface NormalizationDecisionProposal {
  ledgerCode: string
  ledgerName?: string | null
  fiscalYear: number
  amount?: number | null
  sourceRef?: string | null
}

export interface NormalizationDecisionReceiptV1 {
  schema_version: 'normalization_decision.v1'
  id: string
  proposal_fingerprint: string
  scope: 'client' | 'firm'
  decision: 'accept' | 'edit' | 'reject'
  idempotency_key: string
  created_at: string
  revoked_at: string | null
}

export interface NormalizationDecisionRevocationReceipt {
  revoked: boolean
  decision_id: string | null
  revoked_at: string | null
}

function normalizationIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `norm-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Matches Titan VenusNormalizationController.validateSessionId (+ shared `isValidSessionId`). */
function requireNormalizationSessionSegment(id: unknown, label: string): string {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  if (!trimmed) {
    throw new NormalizationAPIError(400, `${label} is required`)
  }
  if (!isValidSessionId(trimmed)) {
    throw new NormalizationAPIError(400, `${label} must be 8–128 characters`)
  }
  return trimmed
}

/** Matches Titan VenusNormalizationController.validateYear. */
function requireNormalizationYear(year: unknown): number {
  if (year == null || typeof year !== 'number' || !Number.isInteger(year)) {
    throw new NormalizationAPIError(400, 'year must be an integer')
  }
  if (year < 2000 || year > 2100) {
    throw new NormalizationAPIError(400, 'year must be between 2000 and 2100')
  }
  return year
}

/** Get headers for normalization requests, including client context when in accountant flow */
function getNormalizationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  try {
    const contextHeaders = useClientContext.getState().getContextHeaders()
    if (contextHeaders && Object.keys(contextHeaders).length > 0) {
      Object.assign(headers, contextHeaders)
    }
  } catch {
    // Non-fatal: client context may not be available (e.g. direct user flow)
  }
  return headers
}

/** Nest can return `message` as string or string[]; normalize for toasts and logs. */
function normalizeNestMessage(raw: unknown, depth = 0): string {
  if (depth > 4) return 'API request failed'
  if (raw == null) return 'API request failed'
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x))
      .filter(Boolean)
      .join('; ')
  }
  if (typeof raw === 'object' && raw !== null && 'message' in raw) {
    return normalizeNestMessage((raw as { message: unknown }).message, depth + 1)
  }
  return String(raw)
}

/**
 * Handle API response and errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = 'API request failed'
    let errorDetails: Record<string, unknown> | undefined

    try {
      const errorData = (await response.json()) as Record<string, unknown>
      errorDetails = errorData
      const raw =
        errorData.message ??
        (typeof errorData.error === 'string' ? errorData.error : undefined) ??
        errorData.error
      errorMessage = normalizeNestMessage(raw)
    } catch {
      // Response not JSON
      errorMessage = `HTTP ${response.status}: ${response.statusText}`
    }

    if (response.status === 404) {
      console.info('[Normalization] No data found for request', { status: 404, url: response.url })
    }

    throw new NormalizationAPIError(response.status, errorMessage, errorDetails)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null as T
  }

  return response.json()
}

/**
 * EBITDA Normalization Service
 */
export class EbitdaNormalizationService {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  /**
   * Get normalization for specific session and year.
   * Calls via Next.js proxy → Titan VenusNormalizationController.
   */
  async getNormalization(sessionId: string, year: number): Promise<GetNormalizationResponse> {
    try {
      const sid = requireNormalizationSessionSegment(sessionId, 'session_id')
      requireNormalizationYear(year)
      const response = await fetch(
        `${this.baseURL}/api/normalization/${encodeURIComponent(sid)}/${year}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: getNormalizationHeaders(),
        }
      )

      return handleResponse<GetNormalizationResponse>(response)
    } catch (error) {
      // Handle 404 gracefully - session may not have normalizations yet
      if (error instanceof NormalizationAPIError && error.status === 404) {
        throw error // Re-throw so the store can handle it
      }
      throw error
    }
  }

  /**
   * Get all normalizations for a session.
   * Calls via Next.js proxy → Titan VenusNormalizationController.
   */
  async getAllNormalizations(sessionId: string): Promise<GetNormalizationResponse[]> {
    try {
      const sid = requireNormalizationSessionSegment(sessionId, 'session_id')
      const response = await fetch(`${this.baseURL}/api/normalization/${encodeURIComponent(sid)}`, {
        method: 'GET',
        credentials: 'include',
        headers: getNormalizationHeaders(),
      })

      return handleResponse<GetNormalizationResponse[]>(response)
    } catch (error) {
      // Handle 404 gracefully - session may not have normalizations yet
      if (error instanceof NormalizationAPIError && error.status === 404) {
        return []
      }
      throw error
    }
  }

  /**
   * Create or update normalization
   * Serialized per session_id with DELETE so Venus never overlaps mutations (pool + lock pressure on Titan).
   */
  async saveNormalization(request: CreateNormalizationRequest): Promise<GetNormalizationResponse> {
    const sid = requireNormalizationSessionSegment(request.session_id, 'session_id')
    requireNormalizationYear(request.year)

    if (typeof request.reported_ebitda !== 'number' || !Number.isFinite(request.reported_ebitda)) {
      throw new NormalizationAPIError(400, 'reported_ebitda must be a finite number')
    }
    if (request.adjustments !== undefined && !Array.isArray(request.adjustments)) {
      throw new NormalizationAPIError(400, 'adjustments must be an array')
    }
    if (request.custom_adjustments !== undefined && !Array.isArray(request.custom_adjustments)) {
      throw new NormalizationAPIError(400, 'custom_adjustments must be an array')
    }
    for (const adj of request.adjustments || []) {
      if (typeof adj.amount !== 'number' || !Number.isFinite(adj.amount)) {
        throw new NormalizationAPIError(
          400,
          `Adjustment amount for category "${adj.category}" must be a finite number (received: ${adj.amount})`
        )
      }
    }
    for (const adj of request.custom_adjustments || []) {
      if (typeof adj.amount !== 'number' || !Number.isFinite(adj.amount)) {
        throw new NormalizationAPIError(
          400,
          `Custom adjustment amount for "${adj.description}" must be a finite number (received: ${adj.amount})`
        )
      }
    }

    const payload: CreateNormalizationRequest = { ...request, session_id: sid }
    return runTitanNormalizationMutationExclusive(sid, async () => {
      const response = await fetch(`${this.baseURL}/api/normalization`, {
        method: 'POST',
        credentials: 'include',
        headers: getNormalizationHeaders(),
        body: JSON.stringify(payload),
      })

      return handleResponse<GetNormalizationResponse>(response)
    })
  }

  /**
   * Delete normalization (revert to reported EBITDA)
   * Serialized per session with POST save.
   */
  /**
   * Tell Titan the advisor rejected a proposed (imported-ledger) normalization.
   *
   * `saveNormalization` only carries ACCEPTED items, so without this call a
   * rejection lived nowhere and the same proposal came back on the next load.
   * The response is the durable server acknowledgement. Callers must await it
   * before showing a saved/rejected state.
   */
  async rememberRejection(
    sessionId: string,
    proposal: NormalizationDecisionProposal,
    options: {
      scope?: 'client' | 'firm'
      applyToAllFirmClients?: boolean
      idempotencyKey?: string
    } = {}
  ): Promise<NormalizationDecisionReceiptV1> {
    const sid = requireNormalizationSessionSegment(sessionId, 'session_id')
    requireNormalizationYear(proposal.fiscalYear)
    const response = await fetch(
      `${this.baseURL}/api/normalization/${encodeURIComponent(sid)}/rejections`,
      {
        method: 'POST',
        credentials: 'include',
        headers: getNormalizationHeaders(),
        body: JSON.stringify({
          ledger_code: proposal.ledgerCode,
          ledger_name: proposal.ledgerName ?? null,
          fiscal_year: proposal.fiscalYear,
          amount: proposal.amount ?? null,
          source_ref: proposal.sourceRef ?? null,
          scope: options.scope ?? 'client',
          apply_to_all_firm_clients: options.applyToAllFirmClients === true,
          idempotency_key: options.idempotencyKey ?? normalizationIdempotencyKey(),
        }),
      }
    )
    return handleResponse<NormalizationDecisionReceiptV1>(response)
  }

  /** The advisor accepted something previously rejected — let it be proposed again. */
  async forgetRejection(
    sessionId: string,
    proposal: NormalizationDecisionProposal,
    scope: 'client' | 'firm' = 'client'
  ): Promise<NormalizationDecisionRevocationReceipt> {
    const sid = requireNormalizationSessionSegment(sessionId, 'session_id')
    requireNormalizationYear(proposal.fiscalYear)
    const response = await fetch(
      `${this.baseURL}/api/normalization/${encodeURIComponent(sid)}/rejections/${encodeURIComponent(proposal.ledgerCode)}`,
      {
        method: 'DELETE',
        credentials: 'include',
        headers: getNormalizationHeaders(),
        body: JSON.stringify({
          ledger_name: proposal.ledgerName ?? null,
          fiscal_year: proposal.fiscalYear,
          amount: proposal.amount ?? null,
          source_ref: proposal.sourceRef ?? null,
          scope,
        }),
      }
    )
    return handleResponse<NormalizationDecisionRevocationReceipt>(response)
  }

  async deleteNormalization(sessionId: string, year: number): Promise<void> {
    const sid = requireNormalizationSessionSegment(sessionId, 'session_id')
    requireNormalizationYear(year)
    return runTitanNormalizationMutationExclusive(sid, async () => {
      const response = await fetch(
        `${this.baseURL}/api/normalization/${encodeURIComponent(sid)}/${year}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: getNormalizationHeaders(),
        }
      )

      return handleResponse<void>(response)
    })
  }

  /**
   * Get market rate suggestions for normalization
   */
  async getMarketRates(
    industry: string,
    revenue?: number,
    location?: string,
    year?: number
  ): Promise<MarketRatesResponse> {
    const industryKey = typeof industry === 'string' ? industry.trim() : ''
    if (!industryKey) {
      throw new NormalizationAPIError(400, 'industry is required')
    }
    const params = new URLSearchParams()
    if (revenue !== undefined) params.append('revenue', revenue.toString())
    const locationKey = typeof location === 'string' ? location.trim() : ''
    if (locationKey) params.append('location', locationKey)
    if (year !== undefined) params.append('year', year.toString())

    const queryString = params.toString()
    const url = `${this.baseURL}/api/normalization/market-rates/${encodeURIComponent(industryKey)}${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: getNormalizationHeaders(),
    })

    return handleResponse<MarketRatesResponse>(response)
  }
}

// Export singleton instance
export const normalizationService = new EbitdaNormalizationService()
