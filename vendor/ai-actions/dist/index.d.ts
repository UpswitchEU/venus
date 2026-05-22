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
    readonly generate_report: "report_generation_request";
    readonly run_sellability: "sellability_run_request";
    readonly update_owner_profile_answer: "owner_profile_answer_request";
    readonly propose_integration_connect: "integration_connect_request";
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
    readonly get_listing_preview: "listing_preview";
    readonly create_listing: "listing_create_request";
    readonly get_buyer_profile_preview: "buyer_profile_preview";
    readonly search_business_types: "business_type_search_results";
    readonly search_kbo_registry: "registry_search_results";
    readonly search_kvk_registry: "registry_search_results";
    readonly get_buyer_ready_package: "buyer_ready_package_status";
    readonly generate_buyer_ready_package: "buyer_ready_package_generation_request";
    readonly get_dd_checklist: "dd_checklist";
    readonly get_data_room_manifest: "data_room_manifest";
    readonly get_legal_readiness: "legal_readiness";
    readonly propose_data_room_upload: "data_room_upload_request";
    readonly propose_mark_dd_item: "dd_override_request";
    readonly regenerate_im_section: "im_regenerate_request";
    readonly propose_buyer_invitation: "buyer_invitation_request";
    readonly propose_package_publish: "package_publish_request";
    readonly request_lawyer_handoff: "lawyer_handoff_request";
};
export type AiActionToolName = keyof typeof AI_ACTION_TOOL_NAME_TO_RESULT_TYPE;
export declare const AI_ACTION_TOOL_NAMES: readonly ("suggest_normalization" | "update_field_value" | "propose_business_card_field" | "run_valuation" | "generate_report" | "run_sellability" | "update_owner_profile_answer" | "propose_integration_connect" | "propose_secure_credential" | "propose_csv_upload" | "propose_multi_select" | "propose_single_select" | "create_client" | "bootstrap_belgian_company" | "start_client_valuation" | "get_client_data_readiness" | "open_import_review" | "get_method_readiness" | "get_listing_preview" | "create_listing" | "get_buyer_profile_preview" | "search_business_types" | "search_kbo_registry" | "search_kvk_registry" | "get_buyer_ready_package" | "generate_buyer_ready_package" | "get_dd_checklist" | "get_data_room_manifest" | "get_legal_readiness" | "propose_data_room_upload" | "propose_mark_dd_item" | "regenerate_im_section" | "propose_buyer_invitation" | "propose_package_publish" | "request_lawyer_handoff")[];
export declare const AI_ACTION_TOOL_RESULT_TYPES: readonly ["normalization_suggestion", "field_update", "valuation_run_request", "report_generation_request", "sellability_run_request", "owner_profile_answer_request", "integration_connect_request", "secure_credential_request", "csv_upload_request", "multi_select_request", "single_select_request", "client_create_request", "belgian_company_bootstrap", "valuation_session_request", "client_data_readiness", "import_review_request", "method_readiness", "listing_preview", "listing_create_request", "buyer_profile_preview", "business_type_search_results", "registry_search_results", "buyer_ready_package_status", "buyer_ready_package_generation_request", "dd_checklist", "data_room_manifest", "legal_readiness", "data_room_upload_request", "dd_override_request", "im_regenerate_request", "buyer_invitation_request", "package_publish_request", "lawyer_handoff_request"];
export type AiActionToolResultType = (typeof AI_ACTION_TOOL_RESULT_TYPES)[number];
export type AiToolResultEnvelopeType = AiActionToolResultType | 'data';
export declare const AI_STREAM_CHUNK_TYPES: readonly ["text", "tool_start", "tool_result", "done", "error"];
export type AiStreamChunkType = (typeof AI_STREAM_CHUNK_TYPES)[number];
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
};
export declare function isAiActionToolName(value: unknown): value is AiActionToolName;
export declare function isAiActionToolResultType(value: unknown): value is AiActionToolResultType;
export declare function classifyAiActionToolResultType(toolName: string): AiToolResultEnvelopeType;
//# sourceMappingURL=index.d.ts.map