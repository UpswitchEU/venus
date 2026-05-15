/**
 * Pure-function parser for Titan's `toolResults` array, converting the
 * envelope shape into the Venus AIChatResponse fields used by the chat
 * drawer + ManualLayout host.
 *
 * Extracted from `AIChatService.sendMessage` so it can be tested in
 * isolation. The drawer's proposal-card kinds (normalization,
 * field_update, valuation_run, report_generation, sellability_run,
 * listing_create) each
 * have a pending_approval branch with a typed `request` payload AND a
 * `blocked` branch with `reason` + `missing` + `message`. Both branches
 * MUST be handled or the AI's "blocked" hints disappear from the UI.
 *
 * Mirrors Mercury's `parseToolResultsToCards` in
 * `apps/mercury/shared/components/ai-dock/tool-card-parser.ts` but produces
 * the legacy Venus response shape (separate arrays per kind instead of a
 * single ToolCard discriminated union). The two parsers are intentionally
 * kept in sync — if Titan adds a sixth tool type or renames a field, both
 * need updating in lockstep. The new type's test in this file + the
 * Mercury parser test will both fail, surfacing the drift at code review.
 */

export interface ValuationRunRequestPending {
  status: 'pending_approval'
  reportId?: string
  methods?: string[] | null
  estimatedCredits?: number
  inputsSummary?: {
    business_name: string | null
    business_type: string | null
    industry: string | null
    revenue: string | null
    ebitda: string | null
    ebitda_normalized: string | null
    pending_normalizations: number
    applied_normalizations: number
  }
  note?: string | null
  message?: string
}

export interface ValuationRunRequestBlocked {
  status: 'blocked'
  reason?: string
  missing?: string[]
  message?: string
}

export type ValuationRunRequest = ValuationRunRequestPending | ValuationRunRequestBlocked

export interface ReportGenerationRequestPending {
  status: 'pending_approval'
  reportId?: string
  estimatedCredits?: number
  resultSummary?: {
    business_name: string | null
    business_type: string | null
    valuation_method: string | null
    currency: string
    midpoint: number | null
    min: number | null
    max: number | null
    confidence_score: number | null
    calculated_at: string | null
  }
  note?: string | null
  message?: string
}

export interface ReportGenerationRequestBlocked {
  status: 'blocked'
  reason?: string
  message?: string
}

export type ReportGenerationRequest =
  | ReportGenerationRequestPending
  | ReportGenerationRequestBlocked

export interface SellabilityRunRequestPending {
  status: 'pending_approval'
  estimatedCredits?: number
  answers?: {
    q1_top3_concentration_pct: number | null
    q2_contracted_share: string | null
    q3_books_cleanliness: string | null
  }
  currentScore?: {
    score: number
    band: string
    computed_at: string | Date
  } | null
  note?: string | null
  message?: string
}

export interface SellabilityRunRequestBlocked {
  status: 'blocked'
  reason?: string
  missing?: string[]
  message?: string
}

export type SellabilityRunRequest = SellabilityRunRequestPending | SellabilityRunRequestBlocked

export interface ListingPreview {
  status: 'ok' | 'blocked'
  reportId?: string
  sourceBusinessName?: string | null
  reason?: string
  message?: string
  missingFields?: string[]
  nextActionHint?: string | null
  preview?: {
    title?: string | null
    businessType?: string | null
    sector?: string | null
    industry?: string | null
    region?: string | null
    province?: string | null
    yearCommenced?: number | null
    employeeRange?: string | null
    revenueRange?: string | null
    equityStake?: string | null
    ownershipStructure?: string | null
    ownerManagersCount?: number | null
    status?: string | null
    featured?: boolean | null
    ndaRequired?: boolean | null
    viewCount?: number | null
    hasVerifiedValuation?: boolean | null
  } | null
}

export interface ListingCreateRequestPending {
  status: 'pending_approval' | 'auto_approved'
  reportId?: string
  accountantCustomerId?: string | null
  visibility?: 'public' | 'private'
  valuationSummary?: {
    business_name?: string | null
    business_type?: string | null
    industry?: string | null
    currency?: string
    midpoint?: string | null
    min?: string | null
    max?: string | null
  }
  note?: string | null
  message?: string
}

export interface ListingCreateRequestBlocked {
  status: 'blocked'
  reason?: string
  message?: string
}

export type ListingCreateRequest = ListingCreateRequestPending | ListingCreateRequestBlocked

export interface MethodReadinessPreview {
  status: 'ok' | 'blocked'
  reportId?: string
  businessName?: string | null
  readinessSource?: string | null
  readyMethods: string[]
  blockedMethods: string[]
  reason?: string
  message?: string
}

export interface BuyerProfilePreview {
  status: 'ok' | 'blocked'
  reportId?: string
  sourceBusinessName?: string | null
  reason?: string
  message?: string
  listingReadiness?: {
    status?: string | null
    missingFields: string[]
  } | null
  buyerSegments?: Array<{
    id?: string
    label: string
    fitScore?: number | null
    recommendedAngle?: string | null
  }>
}

export interface BelgianCompanyBootstrap {
  status: 'ok' | 'partial' | 'blocked' | 'failed'
  reason?: string
  message?: string
  identity?: {
    legalName?: string | null
    legalForm?: string | null
    kboNumber?: string | null
    address?: string | null
    city?: string | null
    postalCode?: string | null
    naceCode?: string | null
    naceDescription?: string | null
    foundationDate?: string | null
    isActive?: boolean | null
  } | null
  benchmark?: {
    status?: string | null
    businessTypeTitle?: string | null
    evEbitdaMedian?: number | null
    confidence?: string | null
  } | null
  filingSummary?: {
    status?: string | null
    source?: string | null
    filingYear?: number | null
    yearsAvailable?: number | null
    revenue?: number | null
    ebitda?: number | null
    dataHealthMessage?: string | null
  } | null
  valuationPreview?: {
    status?: string | null
    method?: string | null
    ebitdaUsed?: number | null
    ebitdaYear?: number | null
    evMid?: number | null
    equityMid?: number | null
  } | null
}

export interface FieldUpdateParsed {
  field: string
  value: number | string | boolean
  label: string
  source: 'ai'
  confidence?: 'high' | 'medium' | 'low'
}

export interface ParsedToolResults {
  normalisationSuggestions: unknown[]
  fieldUpdates: FieldUpdateParsed[]
  valuationRunRequests: ValuationRunRequest[]
  reportGenerationRequests: ReportGenerationRequest[]
  sellabilityRunRequests: SellabilityRunRequest[]
  belgianCompanyBootstraps: BelgianCompanyBootstrap[]
  methodReadinessPreviews: MethodReadinessPreview[]
  listingPreviews: ListingPreview[]
  listingCreateRequests: ListingCreateRequest[]
  buyerProfilePreviews: BuyerProfilePreview[]
}

function emptyResult(): ParsedToolResults {
  return {
    normalisationSuggestions: [],
    fieldUpdates: [],
    valuationRunRequests: [],
    reportGenerationRequests: [],
    sellabilityRunRequests: [],
    belgianCompanyBootstraps: [],
    methodReadinessPreviews: [],
    listingPreviews: [],
    listingCreateRequests: [],
    buyerProfilePreviews: [],
  }
}

/**
 * Parse Titan's `toolResults` array into the Venus drawer-facing response
 * shape. Defensive against:
 *   - Non-array input (returns empty result, not throw)
 *   - Individual entries missing `type` / `data`
 *   - Unknown `type` strings (silently skipped — forward compat for new
 *     Titan tool kinds the FE hasn't taught itself to render yet)
 *   - Pending-approval payloads missing the nested `request` object
 *   - Blocked payloads with missing optional fields
 *
 * The parser returns ALL arrays as `[]` rather than `undefined` so
 * the caller can `for-of` without null-checks. Callers that conditionally
 * surface UI based on array length should check `.length > 0`.
 */
export function parseAIChatToolResults(toolResults: unknown): ParsedToolResults {
  if (!Array.isArray(toolResults)) return emptyResult()
  const out = emptyResult()

  for (const tr of toolResults) {
    if (!tr || typeof tr !== 'object') continue
    const entry = tr as { type?: unknown; data?: unknown }
    const type = entry.type
    const data = entry.data
    if (typeof type !== 'string') continue

    switch (type) {
      case 'normalization_suggestion':
        if (data && typeof data === 'object') {
          out.normalisationSuggestions.push(data)
        }
        break

      case 'field_update': {
        const update = (data as { update?: unknown })?.update as Record<string, unknown> | undefined
        if (!update || typeof update !== 'object') break
        const field = update.field
        const value = update.value
        const label = update.label
        if (typeof field !== 'string' || field.length === 0) break
        if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean')
          break
        if (typeof label !== 'string') break
        const confidence = update.confidence
        out.fieldUpdates.push({
          field,
          value,
          label,
          source: 'ai',
          ...(confidence === 'high' || confidence === 'medium' || confidence === 'low'
            ? { confidence }
            : {}),
        })
        break
      }

      case 'valuation_run_request':
        out.valuationRunRequests.push(...parseValuationRunRequest(data))
        break

      case 'report_generation_request':
        out.reportGenerationRequests.push(...parseReportGenerationRequest(data))
        break

      case 'sellability_run_request':
        out.sellabilityRunRequests.push(...parseSellabilityRunRequest(data))
        break

      case 'belgian_company_bootstrap':
        out.belgianCompanyBootstraps.push(...parseBelgianCompanyBootstrap(data))
        break

      case 'method_readiness':
        out.methodReadinessPreviews.push(...parseMethodReadiness(data))
        break

      case 'listing_preview':
        out.listingPreviews.push(...parseListingPreview(data))
        break

      case 'listing_create_request':
        out.listingCreateRequests.push(...parseListingCreateRequest(data))
        break

      case 'buyer_profile_preview':
        out.buyerProfilePreviews.push(...parseBuyerProfilePreview(data))
        break

      default:
        // Unknown type — silently skip (forward-compat).
        break
    }
  }

  return out
}

function parseMethodReadiness(data: unknown): MethodReadinessPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (typeof d.status !== 'string') return []
  const readyMethods = Array.isArray(d.ready_methods)
    ? d.ready_methods.filter((method): method is string => typeof method === 'string')
    : []
  const blockedMethods = Array.isArray(d.blocked_methods)
    ? d.blocked_methods.filter((method): method is string => typeof method === 'string')
    : []

  return [
    {
      status: d.status === 'ok' ? 'ok' : 'blocked',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      businessName: typeof d.business_name === 'string' ? d.business_name : null,
      readinessSource: typeof d.readiness_source === 'string' ? d.readiness_source : null,
      readyMethods,
      blockedMethods,
      reason: typeof d.reason === 'string' ? d.reason : d.status === 'ok' ? undefined : d.status,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

function parseBelgianCompanyBootstrap(data: unknown): BelgianCompanyBootstrap[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (
    d.status !== 'ok' &&
    d.status !== 'partial' &&
    d.status !== 'blocked' &&
    d.status !== 'failed'
  ) {
    return []
  }

  const identity =
    d.identity && typeof d.identity === 'object' ? (d.identity as Record<string, unknown>) : null
  const benchmark =
    d.benchmark && typeof d.benchmark === 'object' ? (d.benchmark as Record<string, unknown>) : null
  const filing =
    d.filing_summary && typeof d.filing_summary === 'object'
      ? (d.filing_summary as Record<string, unknown>)
      : null
  const preview =
    d.valuation_preview && typeof d.valuation_preview === 'object'
      ? (d.valuation_preview as Record<string, unknown>)
      : null

  return [
    {
      status: d.status,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
      message: typeof d.message === 'string' ? d.message : undefined,
      identity: identity
        ? {
            legalName: typeof identity.legal_name === 'string' ? identity.legal_name : null,
            legalForm: typeof identity.legal_form === 'string' ? identity.legal_form : null,
            kboNumber: typeof identity.kbo_number === 'string' ? identity.kbo_number : null,
            address: typeof identity.address === 'string' ? identity.address : null,
            city: typeof identity.city === 'string' ? identity.city : null,
            postalCode: typeof identity.postal_code === 'string' ? identity.postal_code : null,
            naceCode: typeof identity.nace_code === 'string' ? identity.nace_code : null,
            naceDescription:
              typeof identity.nace_description === 'string' ? identity.nace_description : null,
            foundationDate:
              typeof identity.foundation_date === 'string' ? identity.foundation_date : null,
            isActive: typeof identity.is_active === 'boolean' ? identity.is_active : null,
          }
        : null,
      benchmark: benchmark
        ? {
            status: typeof benchmark.status === 'string' ? benchmark.status : null,
            businessTypeTitle:
              typeof benchmark.business_type_title === 'string'
                ? benchmark.business_type_title
                : null,
            evEbitdaMedian:
              typeof benchmark.ev_ebitda_median === 'number' ? benchmark.ev_ebitda_median : null,
            confidence: typeof benchmark.confidence === 'string' ? benchmark.confidence : null,
          }
        : null,
      filingSummary: filing
        ? {
            status: typeof filing.status === 'string' ? filing.status : null,
            source: typeof filing.source === 'string' ? filing.source : null,
            filingYear: typeof filing.filing_year === 'number' ? filing.filing_year : null,
            yearsAvailable:
              typeof filing.years_available === 'number' ? filing.years_available : null,
            revenue: typeof filing.revenue === 'number' ? filing.revenue : null,
            ebitda: typeof filing.ebitda === 'number' ? filing.ebitda : null,
            dataHealthMessage:
              typeof filing.data_health_message === 'string' ? filing.data_health_message : null,
          }
        : null,
      valuationPreview: preview
        ? {
            status: typeof preview.status === 'string' ? preview.status : null,
            method: typeof preview.method === 'string' ? preview.method : null,
            ebitdaUsed: typeof preview.ebitda_used === 'number' ? preview.ebitda_used : null,
            ebitdaYear: typeof preview.ebitda_year === 'number' ? preview.ebitda_year : null,
            evMid: typeof preview.ev_mid === 'number' ? preview.ev_mid : null,
            equityMid: typeof preview.equity_mid === 'number' ? preview.equity_mid : null,
          }
        : null,
    },
  ]
}

function parseListingPreview(data: unknown): ListingPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'ok') {
    const preview =
      d.preview && typeof d.preview === 'object' ? (d.preview as Record<string, unknown>) : null
    const missingFields = Array.isArray(d.missing_fields)
      ? d.missing_fields.filter((field): field is string => typeof field === 'string')
      : []

    return [
      {
        status: 'ok',
        reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
        sourceBusinessName:
          typeof d.source_business_name === 'string' ? d.source_business_name : null,
        missingFields,
        nextActionHint: typeof d.next_action_hint === 'string' ? d.next_action_hint : null,
        preview: preview
          ? {
              title: typeof preview.anonymized_title === 'string' ? preview.anonymized_title : null,
              businessType:
                typeof preview.business_type === 'string' ? preview.business_type : null,
              sector: typeof preview.sector === 'string' ? preview.sector : null,
              industry: typeof preview.industry === 'string' ? preview.industry : null,
              region: typeof preview.region === 'string' ? preview.region : null,
              province: typeof preview.province === 'string' ? preview.province : null,
              yearCommenced:
                typeof preview.year_commenced === 'number' ? preview.year_commenced : null,
              employeeRange:
                typeof preview.employee_range === 'string' ? preview.employee_range : null,
              revenueRange:
                typeof preview.revenue_range === 'string' ? preview.revenue_range : null,
              equityStake: typeof preview.equity_stake === 'string' ? preview.equity_stake : null,
              ownershipStructure:
                typeof preview.ownership_structure === 'string'
                  ? preview.ownership_structure
                  : null,
              ownerManagersCount:
                typeof preview.owner_managers_count === 'number'
                  ? preview.owner_managers_count
                  : null,
              status: typeof preview.status === 'string' ? preview.status : null,
              featured: typeof preview.featured === 'boolean' ? preview.featured : null,
              ndaRequired: typeof preview.nda_required === 'boolean' ? preview.nda_required : null,
              viewCount: typeof preview.view_count === 'number' ? preview.view_count : null,
              hasVerifiedValuation:
                typeof preview.has_verified_valuation === 'boolean'
                  ? preview.has_verified_valuation
                  : null,
            }
          : null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }

  if (typeof d.status !== 'string') return []
  return [
    {
      status: 'blocked',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      reason: typeof d.reason === 'string' ? d.reason : d.status,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

function parseBuyerProfilePreview(data: unknown): BuyerProfilePreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'blocked') {
    return [
      {
        status: 'blocked',
        reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }

  if (d.status !== 'ok') return []

  const readiness =
    d.listing_readiness && typeof d.listing_readiness === 'object'
      ? (d.listing_readiness as Record<string, unknown>)
      : null
  const missingFields = Array.isArray(readiness?.missing_fields)
    ? readiness.missing_fields.filter((field): field is string => typeof field === 'string')
    : []
  const buyerSegments = Array.isArray(d.buyer_segments)
    ? d.buyer_segments
        .filter(
          (segment): segment is Record<string, unknown> =>
            typeof segment === 'object' && segment !== null
        )
        .map((segment) => ({
          id: typeof segment.id === 'string' ? segment.id : undefined,
          label: typeof segment.label === 'string' ? segment.label : '',
          fitScore: typeof segment.fit_score === 'number' ? segment.fit_score : null,
          recommendedAngle:
            typeof segment.recommended_angle === 'string' ? segment.recommended_angle : null,
        }))
        .filter((segment) => segment.label.length > 0)
    : []

  return [
    {
      status: 'ok',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      sourceBusinessName:
        typeof d.source_business_name === 'string' ? d.source_business_name : null,
      listingReadiness: {
        status: typeof readiness?.status === 'string' ? readiness.status : null,
        missingFields,
      },
      buyerSegments,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

function parseValuationRunRequest(data: unknown): ValuationRunRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>
    return [
      {
        status: 'pending_approval',
        reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
        methods: Array.isArray(req.methods) ? (req.methods as string[]) : null,
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        inputsSummary: req.inputs_summary as ValuationRunRequestPending['inputsSummary'],
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        missing: Array.isArray(d.missing) ? (d.missing as string[]) : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

function parseReportGenerationRequest(data: unknown): ReportGenerationRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>
    return [
      {
        status: 'pending_approval',
        reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        resultSummary: req.result_summary as ReportGenerationRequestPending['resultSummary'],
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

/**
 * State the `dispatchAIChatChunk` dispatcher reads + writes across calls
 * within a single stream consumption. The caller owns the state object
 * and threads it through each chunk so the dispatcher stays pure.
 */
export interface ChunkDispatchState {
  resolvedConversationId: string
  doneReceived: boolean
}

export function makeChunkDispatchState(): ChunkDispatchState {
  return { resolvedConversationId: '', doneReceived: false }
}

/**
 * Callback bag the dispatcher fires for each meaningful chunk type.
 * Mirrors `AIChatService.StreamCallbacks` exactly so the service can
 * pass its callback object straight through.
 */
export interface ChunkDispatchCallbacks {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onDone?: (conversationId?: string) => void
  onError?: (error: string) => void
}

/**
 * Dispatch a single SSE chunk (already JSON-parsed) to the appropriate
 * callback. Extracted from `AIChatService.streamMessage` so the routing
 * logic — which had 5 cases × subtle behaviours like `conversationId`
 * capture on text chunks and `doneReceived` flag flips — is no longer
 * inline-untested code.
 *
 * Behaviour pinned by tests:
 *   - `text` chunks: capture `conversationId` into state (used as the
 *     final `done` fallback) and fire `onText` ONLY when `content` is
 *     non-empty (avoid empty-string callback noise).
 *   - `tool_start`: fire onToolStart with the toolName (caller decides
 *     what to do with missing/undefined toolName — it's not our job to
 *     validate the upstream Titan envelope).
 *   - `tool_result`: fire onToolResult with toolName + toolResult.
 *   - `done`: flip `doneReceived` to true and fire onDone with the
 *     chunk's own conversationId, falling back to the captured one.
 *   - `error`: flip `doneReceived` to true (so the outer "if no done,
 *     fire onDone" guard doesn't double-fire) and surface the error
 *     message with a fallback to `"Unknown error"`.
 *   - Unknown types: silently skip (forward-compat for new Titan
 *     chunk types).
 *
 * Returns the state object (mutated in place) for chainable use.
 */
export function dispatchAIChatChunk(
  chunk: unknown,
  state: ChunkDispatchState,
  callbacks: ChunkDispatchCallbacks
): ChunkDispatchState {
  if (!chunk || typeof chunk !== 'object') return state
  const c = chunk as Record<string, unknown>
  const type = c.type
  if (typeof type !== 'string') return state

  switch (type) {
    case 'text':
      if (typeof c.conversationId === 'string' && c.conversationId.length > 0) {
        state.resolvedConversationId = c.conversationId
      }
      if (typeof c.content === 'string' && c.content.length > 0) {
        callbacks.onText?.(c.content)
      }
      break
    case 'tool_start':
      if (typeof c.toolName === 'string') {
        callbacks.onToolStart?.(c.toolName)
      }
      break
    case 'tool_result':
      if (typeof c.toolName === 'string') {
        callbacks.onToolResult?.(c.toolName, c.toolResult)
      }
      break
    case 'done':
      state.doneReceived = true
      callbacks.onDone?.(
        typeof c.conversationId === 'string' && c.conversationId.length > 0
          ? c.conversationId
          : state.resolvedConversationId || undefined
      )
      break
    case 'error':
      state.doneReceived = true
      callbacks.onError?.(
        typeof c.error === 'string' && c.error.length > 0 ? c.error : 'Unknown error'
      )
      break
    default:
      // Unknown type — silently skip for forward-compat.
      break
  }

  return state
}

function parseSellabilityRunRequest(data: unknown): SellabilityRunRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>
    return [
      {
        status: 'pending_approval',
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        answers: req.answers as SellabilityRunRequestPending['answers'],
        currentScore: (req.current_score as SellabilityRunRequestPending['currentScore']) ?? null,
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        missing: Array.isArray(d.missing) ? (d.missing as string[]) : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

function parseListingCreateRequest(data: unknown): ListingCreateRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (
    (status === 'pending_approval' || status === 'auto_approved') &&
    d.request &&
    typeof d.request === 'object'
  ) {
    const req = d.request as Record<string, unknown>
    const visibility = req.visibility
    return [
      {
        status,
        reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
        accountantCustomerId:
          typeof req.accountant_customer_id === 'string' ? req.accountant_customer_id : null,
        visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
        valuationSummary: req.valuation_summary as ListingCreateRequestPending['valuationSummary'],
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}
