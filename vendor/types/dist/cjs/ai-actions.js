"use strict";
/**
 * Canonical cross-app AI action contract.
 *
 * Titan emits these tool-result envelope strings; Mercury and Venus render
 * them. Keep this file aligned with `tests/contracts/ai-tool-result-contract.json`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_STREAM_KEEPALIVE_CHUNK_JSON = exports.AI_STREAM_CHUNK_TYPES = exports.AI_ACTION_TOOL_RESULT_TYPES = exports.AI_ACTION_TOOL_NAMES = exports.AI_ACTION_TOOL_NAME_TO_RESULT_TYPE = void 0;
exports.isAiActionToolName = isAiActionToolName;
exports.isAiActionToolResultType = isAiActionToolResultType;
exports.classifyAiActionToolResultType = classifyAiActionToolResultType;
exports.AI_ACTION_TOOL_NAME_TO_RESULT_TYPE = {
    suggest_normalization: 'normalization_suggestion',
    update_field_value: 'field_update',
    propose_business_card_field: 'field_update',
    run_valuation: 'valuation_run_request',
    propose_bulk_valuation_run: 'bulk_valuation_run_request',
    generate_report: 'report_generation_request',
    run_sellability: 'sellability_run_request',
    update_owner_profile_answer: 'owner_profile_answer_request',
    propose_integration_connect: 'integration_connect_request',
    propose_integration_sync: 'integration_sync_request',
    propose_owner_reminder: 'owner_reminder_request',
    propose_owner_invite_accountant: 'owner_invite_accountant_request',
    propose_listing_visibility: 'listing_visibility_request',
    propose_listing_field_update: 'listing_field_update_request',
    propose_share_token: 'share_token_request',
    propose_share_token_revoke: 'share_token_revoke_request',
    propose_valuation_method_preference: 'valuation_method_preference_request',
    propose_valuation_defaults: 'valuation_defaults_request',
    propose_acknowledge_warning: 'acknowledge_warning_request',
    propose_secure_credential: 'secure_credential_request',
    propose_csv_upload: 'csv_upload_request',
    propose_multi_select: 'multi_select_request',
    propose_single_select: 'single_select_request',
    create_client: 'client_create_request',
    bootstrap_belgian_company: 'belgian_company_bootstrap',
    start_client_valuation: 'valuation_session_request',
    get_client_data_readiness: 'client_data_readiness',
    open_import_review: 'import_review_request',
    get_method_readiness: 'method_readiness',
    get_sync_status: 'sync_status',
    get_valuation_defaults: 'valuation_defaults',
    get_workspace_clients: 'workspace_clients',
    get_listing_preview: 'listing_preview',
    create_listing: 'listing_create_request',
    get_buyer_profile_preview: 'buyer_profile_preview',
    search_business_types: 'business_type_search_results',
    search_kbo_registry: 'registry_search_results',
    search_kvk_registry: 'registry_search_results',
    suggest_normalization_batch: 'normalization_suggestion_batch',
    propose_normalization_dismiss: 'normalization_dismiss_request',
    get_buyer_ready_package: 'buyer_ready_package_status',
    generate_buyer_ready_package: 'buyer_ready_package_generation_request',
    get_dd_checklist: 'dd_checklist',
    get_data_room_manifest: 'data_room_manifest',
    get_legal_readiness: 'legal_readiness',
    propose_data_room_upload: 'data_room_upload_request',
    propose_mark_dd_item: 'dd_override_request',
    regenerate_im_section: 'im_regenerate_request',
    propose_buyer_invitation: 'buyer_invitation_request',
    propose_package_publish: 'package_publish_request',
    request_lawyer_handoff: 'lawyer_handoff_request',
};
exports.AI_ACTION_TOOL_NAMES = Object.freeze(Object.keys(exports.AI_ACTION_TOOL_NAME_TO_RESULT_TYPE));
exports.AI_ACTION_TOOL_RESULT_TYPES = [
    'normalization_suggestion',
    'field_update',
    'valuation_run_request',
    'bulk_valuation_run_request',
    'report_generation_request',
    'sellability_run_request',
    'owner_profile_answer_request',
    'integration_connect_request',
    'integration_sync_request',
    'owner_reminder_request',
    'owner_invite_accountant_request',
    'listing_visibility_request',
    'listing_field_update_request',
    'share_token_request',
    'share_token_revoke_request',
    'valuation_method_preference_request',
    'valuation_defaults_request',
    'acknowledge_warning_request',
    'secure_credential_request',
    'csv_upload_request',
    'multi_select_request',
    'single_select_request',
    'client_create_request',
    'belgian_company_bootstrap',
    'valuation_session_request',
    'client_data_readiness',
    'import_review_request',
    'method_readiness',
    'sync_status',
    'valuation_defaults',
    'workspace_clients',
    'listing_preview',
    'listing_create_request',
    'buyer_profile_preview',
    'business_type_search_results',
    'registry_search_results',
    'normalization_suggestion_batch',
    'normalization_dismiss_request',
    'buyer_ready_package_status',
    'buyer_ready_package_generation_request',
    'dd_checklist',
    'data_room_manifest',
    'legal_readiness',
    'data_room_upload_request',
    'dd_override_request',
    'im_regenerate_request',
    'buyer_invitation_request',
    'package_publish_request',
    'lawyer_handoff_request',
];
exports.AI_STREAM_CHUNK_TYPES = [
    'text',
    'tool_start',
    'tool_result',
    'done',
    'error',
    // SSE keep-alive — emitted server-side every ~30s while the generator is
    // alive, so proxies (Cloudflare ~100s idle limit) don't close long tool
    // chains mid-stream. The FE MUST treat these as no-ops — they must never
    // satisfy `didReceiveAnyContent`, otherwise a silent Claude turn would
    // hide behind the keepalive and skip the user-facing empty-stream
    // fallback. See `AI_STREAM_KEEPALIVE_CHUNK_JSON` for the wire literal.
    '_keepalive',
];
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
exports.AI_STREAM_KEEPALIVE_CHUNK_JSON = '{"type":"_keepalive"}';
const AI_ACTION_TOOL_NAME_SET = new Set(exports.AI_ACTION_TOOL_NAMES);
const AI_ACTION_TOOL_RESULT_TYPE_SET = new Set(exports.AI_ACTION_TOOL_RESULT_TYPES);
function isAiActionToolName(value) {
    return typeof value === 'string' && AI_ACTION_TOOL_NAME_SET.has(value);
}
function isAiActionToolResultType(value) {
    return typeof value === 'string' && AI_ACTION_TOOL_RESULT_TYPE_SET.has(value);
}
function classifyAiActionToolResultType(toolName) {
    return exports.AI_ACTION_TOOL_NAME_TO_RESULT_TYPE[toolName] ?? 'data';
}
//# sourceMappingURL=ai-actions.js.map