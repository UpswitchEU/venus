/**
 * Pure-function parser for Titan's `toolResults` array, converting the
 * envelope shape into the Venus AIChatResponse fields used by the chat
 * drawer + ManualLayout host.
 *
 * Extracted from `AIChatService.sendMessage` so it can be tested in
 * isolation. The drawer's 5 proposal-card kinds (normalization,
 * field_update, valuation_run, report_generation, sellability_run) each
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
	status: 'pending_approval';
	reportId?: string;
	methods?: string[] | null;
	estimatedCredits?: number;
	inputsSummary?: {
		business_name: string | null;
		business_type: string | null;
		industry: string | null;
		revenue: string | null;
		ebitda: string | null;
		ebitda_normalized: string | null;
		pending_normalizations: number;
		applied_normalizations: number;
	};
	note?: string | null;
	message?: string;
}

export interface ValuationRunRequestBlocked {
	status: 'blocked';
	reason?: string;
	missing?: string[];
	message?: string;
}

export type ValuationRunRequest =
	| ValuationRunRequestPending
	| ValuationRunRequestBlocked;

export interface ReportGenerationRequestPending {
	status: 'pending_approval';
	reportId?: string;
	estimatedCredits?: number;
	resultSummary?: {
		business_name: string | null;
		business_type: string | null;
		valuation_method: string | null;
		currency: string;
		midpoint: number | null;
		min: number | null;
		max: number | null;
		confidence_score: number | null;
		calculated_at: string | null;
	};
	note?: string | null;
	message?: string;
}

export interface ReportGenerationRequestBlocked {
	status: 'blocked';
	reason?: string;
	message?: string;
}

export type ReportGenerationRequest =
	| ReportGenerationRequestPending
	| ReportGenerationRequestBlocked;

export interface SellabilityRunRequestPending {
	status: 'pending_approval';
	estimatedCredits?: number;
	answers?: {
		q1_top3_concentration_pct: number | null;
		q2_contracted_share: string | null;
		q3_books_cleanliness: string | null;
	};
	currentScore?: {
		score: number;
		band: string;
		computed_at: string | Date;
	} | null;
	note?: string | null;
	message?: string;
}

export interface SellabilityRunRequestBlocked {
	status: 'blocked';
	reason?: string;
	missing?: string[];
	message?: string;
}

export type SellabilityRunRequest =
	| SellabilityRunRequestPending
	| SellabilityRunRequestBlocked;

export interface FieldUpdateParsed {
	field: string;
	value: number | string | boolean;
	label: string;
	source: 'ai';
	confidence?: 'high' | 'medium' | 'low';
}

export interface ParsedToolResults {
	normalisationSuggestions: unknown[];
	fieldUpdates: FieldUpdateParsed[];
	valuationRunRequests: ValuationRunRequest[];
	reportGenerationRequests: ReportGenerationRequest[];
	sellabilityRunRequests: SellabilityRunRequest[];
}

function emptyResult(): ParsedToolResults {
	return {
		normalisationSuggestions: [],
		fieldUpdates: [],
		valuationRunRequests: [],
		reportGenerationRequests: [],
		sellabilityRunRequests: [],
	};
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
 * The parser returns ALL five arrays as `[]` rather than `undefined` so
 * the caller can `for-of` without null-checks. Callers that conditionally
 * surface UI based on array length should check `.length > 0`.
 */
export function parseAIChatToolResults(toolResults: unknown): ParsedToolResults {
	if (!Array.isArray(toolResults)) return emptyResult();
	const out = emptyResult();

	for (const tr of toolResults) {
		if (!tr || typeof tr !== 'object') continue;
		const entry = tr as { type?: unknown; data?: unknown };
		const type = entry.type;
		const data = entry.data;
		if (typeof type !== 'string') continue;

		switch (type) {
			case 'normalization_suggestion':
				if (data && typeof data === 'object') {
					out.normalisationSuggestions.push(data);
				}
				break;

			case 'field_update': {
				const update = (data as { update?: unknown })?.update as
					| Record<string, unknown>
					| undefined;
				if (!update || typeof update !== 'object') break;
				const field = update.field;
				const value = update.value;
				const label = update.label;
				if (typeof field !== 'string' || field.length === 0) break;
				if (
					typeof value !== 'number' &&
					typeof value !== 'string' &&
					typeof value !== 'boolean'
				)
					break;
				if (typeof label !== 'string') break;
				const confidence = update.confidence;
				out.fieldUpdates.push({
					field,
					value,
					label,
					source: 'ai',
					...(confidence === 'high' || confidence === 'medium' || confidence === 'low'
						? { confidence }
						: {}),
				});
				break;
			}

			case 'valuation_run_request':
				out.valuationRunRequests.push(...parseValuationRunRequest(data));
				break;

			case 'report_generation_request':
				out.reportGenerationRequests.push(...parseReportGenerationRequest(data));
				break;

			case 'sellability_run_request':
				out.sellabilityRunRequests.push(...parseSellabilityRunRequest(data));
				break;

			default:
				// Unknown type — silently skip (forward-compat).
				break;
		}
	}

	return out;
}

function parseValuationRunRequest(data: unknown): ValuationRunRequest[] {
	if (!data || typeof data !== 'object') return [];
	const d = data as Record<string, unknown>;
	const status = d.status;
	if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
		const req = d.request as Record<string, unknown>;
		return [
			{
				status: 'pending_approval',
				reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
				methods: Array.isArray(req.methods) ? (req.methods as string[]) : null,
				estimatedCredits:
					typeof req.estimated_credits === 'number'
						? req.estimated_credits
						: undefined,
				inputsSummary: req.inputs_summary as ValuationRunRequestPending['inputsSummary'],
				note: (req.note as string | null | undefined) ?? null,
				message: typeof d.message === 'string' ? d.message : undefined,
			},
		];
	}
	if (status === 'blocked') {
		return [
			{
				status: 'blocked',
				reason: typeof d.reason === 'string' ? d.reason : undefined,
				missing: Array.isArray(d.missing) ? (d.missing as string[]) : undefined,
				message: typeof d.message === 'string' ? d.message : undefined,
			},
		];
	}
	return [];
}

function parseReportGenerationRequest(data: unknown): ReportGenerationRequest[] {
	if (!data || typeof data !== 'object') return [];
	const d = data as Record<string, unknown>;
	const status = d.status;
	if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
		const req = d.request as Record<string, unknown>;
		return [
			{
				status: 'pending_approval',
				reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
				estimatedCredits:
					typeof req.estimated_credits === 'number'
						? req.estimated_credits
						: undefined,
				resultSummary:
					req.result_summary as ReportGenerationRequestPending['resultSummary'],
				note: (req.note as string | null | undefined) ?? null,
				message: typeof d.message === 'string' ? d.message : undefined,
			},
		];
	}
	if (status === 'blocked') {
		return [
			{
				status: 'blocked',
				reason: typeof d.reason === 'string' ? d.reason : undefined,
				message: typeof d.message === 'string' ? d.message : undefined,
			},
		];
	}
	return [];
}

/**
 * State the `dispatchAIChatChunk` dispatcher reads + writes across calls
 * within a single stream consumption. The caller owns the state object
 * and threads it through each chunk so the dispatcher stays pure.
 */
export interface ChunkDispatchState {
	resolvedConversationId: string;
	doneReceived: boolean;
}

export function makeChunkDispatchState(): ChunkDispatchState {
	return { resolvedConversationId: '', doneReceived: false };
}

/**
 * Callback bag the dispatcher fires for each meaningful chunk type.
 * Mirrors `AIChatService.StreamCallbacks` exactly so the service can
 * pass its callback object straight through.
 */
export interface ChunkDispatchCallbacks {
	onText?: (text: string) => void;
	onToolStart?: (toolName: string) => void;
	onToolResult?: (toolName: string, result: unknown) => void;
	onDone?: (conversationId?: string) => void;
	onError?: (error: string) => void;
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
	callbacks: ChunkDispatchCallbacks,
): ChunkDispatchState {
	if (!chunk || typeof chunk !== 'object') return state;
	const c = chunk as Record<string, unknown>;
	const type = c.type;
	if (typeof type !== 'string') return state;

	switch (type) {
		case 'text':
			if (typeof c.conversationId === 'string' && c.conversationId.length > 0) {
				state.resolvedConversationId = c.conversationId;
			}
			if (typeof c.content === 'string' && c.content.length > 0) {
				callbacks.onText?.(c.content);
			}
			break;
		case 'tool_start':
			if (typeof c.toolName === 'string') {
				callbacks.onToolStart?.(c.toolName);
			}
			break;
		case 'tool_result':
			if (typeof c.toolName === 'string') {
				callbacks.onToolResult?.(c.toolName, c.toolResult);
			}
			break;
		case 'done':
			state.doneReceived = true;
			callbacks.onDone?.(
				typeof c.conversationId === 'string' && c.conversationId.length > 0
					? c.conversationId
					: state.resolvedConversationId || undefined,
			);
			break;
		case 'error':
			state.doneReceived = true;
			callbacks.onError?.(typeof c.error === 'string' && c.error.length > 0
				? c.error
				: 'Unknown error');
			break;
		default:
			// Unknown type — silently skip for forward-compat.
			break;
	}

	return state;
}

function parseSellabilityRunRequest(data: unknown): SellabilityRunRequest[] {
	if (!data || typeof data !== 'object') return [];
	const d = data as Record<string, unknown>;
	const status = d.status;
	if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
		const req = d.request as Record<string, unknown>;
		return [
			{
				status: 'pending_approval',
				estimatedCredits:
					typeof req.estimated_credits === 'number'
						? req.estimated_credits
						: undefined,
				answers: req.answers as SellabilityRunRequestPending['answers'],
				currentScore:
					(req.current_score as SellabilityRunRequestPending['currentScore']) ?? null,
				note: (req.note as string | null | undefined) ?? null,
				message: typeof d.message === 'string' ? d.message : undefined,
			},
		];
	}
	if (status === 'blocked') {
		return [
			{
				status: 'blocked',
				reason: typeof d.reason === 'string' ? d.reason : undefined,
				missing: Array.isArray(d.missing) ? (d.missing as string[]) : undefined,
				message: typeof d.message === 'string' ? d.message : undefined,
			},
		];
	}
	return [];
}
