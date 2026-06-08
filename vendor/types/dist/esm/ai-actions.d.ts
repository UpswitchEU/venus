/**
 * Canonical cross-app AI action contract.
 *
 * Titan emits these tool-result envelope strings; Mercury and Venus render
 * them. Keep this file aligned with `tests/contracts/ai-tool-result-contract.json`.
 */
export declare const AI_ACTION_TOOL_NAME_TO_RESULT_TYPE: {
    readonly suggest_normalization: "normalization_suggestion";
    readonly update_field_value: "field_update";
    readonly propose_business_card_field: "field_update";
    readonly run_valuation: "valuation_run_request";
    readonly propose_bulk_valuation_run: "bulk_valuation_run_request";
    readonly generate_report: "report_generation_request";
    readonly run_sellability: "sellability_run_request";
    readonly update_owner_profile_answer: "owner_profile_answer_request";
    readonly propose_integration_connect: "integration_connect_request";
    readonly propose_integration_sync: "integration_sync_request";
    readonly propose_owner_reminder: "owner_reminder_request";
    readonly propose_owner_invite_accountant: "owner_invite_accountant_request";
    readonly propose_client_owner_invite: "client_owner_invite_request";
    readonly propose_listing_visibility: "listing_visibility_request";
    readonly propose_listing_field_update: "listing_field_update_request";
    readonly propose_share_token: "share_token_request";
    readonly propose_share_token_revoke: "share_token_revoke_request";
    readonly propose_valuation_method_preference: "valuation_method_preference_request";
    readonly propose_valuation_defaults: "valuation_defaults_request";
    readonly propose_acknowledge_warning: "acknowledge_warning_request";
    readonly propose_secure_credential: "secure_credential_request";
    readonly propose_csv_upload: "csv_upload_request";
    readonly propose_multi_select: "multi_select_request";
    readonly propose_single_select: "single_select_request";
    readonly create_client: "client_create_request";
    readonly bootstrap_belgian_company: "belgian_company_bootstrap";
    readonly start_client_valuation: "valuation_session_request";
    readonly get_client_data_readiness: "client_data_readiness";
    readonly open_import_review: "import_review_request";
    readonly get_method_readiness: "method_readiness";
    readonly get_sync_status: "sync_status";
    readonly get_valuation_defaults: "valuation_defaults";
    readonly get_workspace_clients: "workspace_clients";
    readonly get_listing_preview: "listing_preview";
    readonly create_listing: "listing_create_request";
    readonly get_buyer_profile_preview: "buyer_profile_preview";
    readonly search_business_types: "business_type_search_results";
    readonly search_kbo_registry: "registry_search_results";
    readonly search_kvk_registry: "registry_search_results";
    readonly suggest_normalization_batch: "normalization_suggestion_batch";
    readonly propose_normalization_dismiss: "normalization_dismiss_request";
    readonly get_buyer_ready_package: "buyer_ready_package_status";
    readonly generate_buyer_ready_package: "buyer_ready_package_generation_request";
    readonly get_dd_checklist: "dd_checklist";
    readonly get_data_room_manifest: "data_room_manifest";
    readonly get_legal_readiness: "legal_readiness";
    readonly get_deal_readiness: "deal_readiness";
    readonly propose_data_room_upload: "data_room_upload_request";
    readonly propose_mark_dd_item: "dd_override_request";
    readonly regenerate_im_section: "im_regenerate_request";
    readonly propose_buyer_invitation: "buyer_invitation_request";
    readonly propose_package_publish: "package_publish_request";
    readonly request_lawyer_handoff: "lawyer_handoff_request";
    readonly propose_start_playbook: "start_playbook_request";
    readonly advisor_add_client_widget: "add_client_widget";
};
export type AiActionToolName = keyof typeof AI_ACTION_TOOL_NAME_TO_RESULT_TYPE;
export declare const AI_ACTION_TOOL_NAMES: readonly ("suggest_normalization" | "update_field_value" | "propose_business_card_field" | "run_valuation" | "propose_bulk_valuation_run" | "generate_report" | "run_sellability" | "update_owner_profile_answer" | "propose_integration_connect" | "propose_integration_sync" | "propose_owner_reminder" | "propose_owner_invite_accountant" | "propose_client_owner_invite" | "propose_listing_visibility" | "propose_listing_field_update" | "propose_share_token" | "propose_share_token_revoke" | "propose_valuation_method_preference" | "propose_valuation_defaults" | "propose_acknowledge_warning" | "propose_secure_credential" | "propose_csv_upload" | "propose_multi_select" | "propose_single_select" | "create_client" | "bootstrap_belgian_company" | "start_client_valuation" | "get_client_data_readiness" | "open_import_review" | "get_method_readiness" | "get_sync_status" | "get_valuation_defaults" | "get_workspace_clients" | "get_listing_preview" | "create_listing" | "get_buyer_profile_preview" | "search_business_types" | "search_kbo_registry" | "search_kvk_registry" | "suggest_normalization_batch" | "propose_normalization_dismiss" | "get_buyer_ready_package" | "generate_buyer_ready_package" | "get_dd_checklist" | "get_data_room_manifest" | "get_legal_readiness" | "get_deal_readiness" | "propose_data_room_upload" | "propose_mark_dd_item" | "regenerate_im_section" | "propose_buyer_invitation" | "propose_package_publish" | "request_lawyer_handoff" | "propose_start_playbook" | "advisor_add_client_widget")[];
export declare const AI_ACTION_TOOL_RESULT_TYPES: readonly ["normalization_suggestion", "field_update", "valuation_run_request", "bulk_valuation_run_request", "report_generation_request", "sellability_run_request", "owner_profile_answer_request", "integration_connect_request", "integration_sync_request", "owner_reminder_request", "owner_invite_accountant_request", "client_owner_invite_request", "listing_visibility_request", "listing_field_update_request", "share_token_request", "share_token_revoke_request", "valuation_method_preference_request", "valuation_defaults_request", "acknowledge_warning_request", "secure_credential_request", "csv_upload_request", "multi_select_request", "single_select_request", "client_create_request", "belgian_company_bootstrap", "valuation_session_request", "client_data_readiness", "import_review_request", "method_readiness", "sync_status", "valuation_defaults", "workspace_clients", "listing_preview", "listing_create_request", "buyer_profile_preview", "business_type_search_results", "registry_search_results", "normalization_suggestion_batch", "normalization_dismiss_request", "buyer_ready_package_status", "buyer_ready_package_generation_request", "dd_checklist", "data_room_manifest", "legal_readiness", "deal_readiness", "data_room_upload_request", "dd_override_request", "im_regenerate_request", "buyer_invitation_request", "package_publish_request", "lawyer_handoff_request", "start_playbook_request", "add_client_widget"];
export type AiActionToolResultType = (typeof AI_ACTION_TOOL_RESULT_TYPES)[number];
export type AiToolResultEnvelopeType = AiActionToolResultType | 'data';
export declare const AI_STREAM_CHUNK_TYPES: readonly ["text", "tool_start", "tool_result", "done", "error", "_keepalive", "stream_recovery"];
export type AiStreamChunkType = (typeof AI_STREAM_CHUNK_TYPES)[number];
/**
 * Exact SSE `data:` payload for a keepalive frame. Pinned as a literal so
 * the producer (Titan AI / onboarding controllers) and the consumer
 * (Mercury dock + tests) cannot drift: any change here breaks the FE pin
 * in `ai-dock-tool-card-parser-streaming.test.ts` and forces a deliberate
 * matching update on Titan.
 *
 * Why a constant for the *encoded* shape: Titan emits via
 * `{ data: AI_STREAM_KEEPALIVE_CHUNK_JSON }` to skip a JSON.stringify per
 * heartbeat and to keep the wire format pin in one place. Consumers
 * reading the parsed object should still pattern-match on `type` against
 * the discriminant above.
 */
export declare const AI_STREAM_KEEPALIVE_CHUNK_JSON = "{\"type\":\"_keepalive\"}";
export interface AiToolResultEnvelope<TType extends AiToolResultEnvelopeType = AiToolResultEnvelopeType> {
    type: TType;
    toolName?: AiActionToolName | string;
    data: unknown;
}
export interface AiLooseToolResultEnvelope {
    type?: string;
    toolName?: string;
    data?: unknown;
}
export interface AiCreditSnapshot {
    remaining: number;
    limit: number;
}
export type AiStreamChunk = {
    type: 'text';
    content?: string;
    conversationId?: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
} | {
    type: 'tool_start';
    toolName?: AiActionToolName | string;
    conversationId?: string;
} | {
    type: 'tool_result';
    toolName?: AiActionToolName | string;
    toolResult?: unknown;
    conversationId?: string;
} | {
    type: 'done';
    conversationId?: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
    aiCredits?: AiCreditSnapshot;
} | {
    type: 'error';
    error?: string;
    conversationId?: string;
} | {
    type: '_keepalive';
} | {
    type: 'stream_recovery';
    source: 'bff-fallback' | 'bff-fallback-failed' | 'bff-stream-incomplete';
};
export declare function isAiActionToolName(value: unknown): value is AiActionToolName;
export declare function isAiActionToolResultType(value: unknown): value is AiActionToolResultType;
export declare function classifyAiActionToolResultType(toolName: string): AiToolResultEnvelopeType;
//# sourceMappingURL=ai-actions.d.ts.map