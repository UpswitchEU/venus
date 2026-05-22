/**
 * Canonical cross-app AI action contract.
 *
 * Titan emits these tool-result envelope strings; Mercury and Venus render
 * them. Keep this file aligned with `tests/contracts/ai-tool-result-contract.json`.
 */
export const AI_ACTION_TOOL_NAME_TO_RESULT_TYPE = {
    suggest_normalization: 'normalization_suggestion',
    update_field_value: 'field_update',
    propose_business_card_field: 'field_update',
    run_valuation: 'valuation_run_request',
    generate_report: 'report_generation_request',
    run_sellability: 'sellability_run_request',
    update_owner_profile_answer: 'owner_profile_answer_request',
    propose_integration_connect: 'integration_connect_request',
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
    get_listing_preview: 'listing_preview',
    create_listing: 'listing_create_request',
    get_buyer_profile_preview: 'buyer_profile_preview',
    search_business_types: 'business_type_search_results',
    search_kbo_registry: 'registry_search_results',
    search_kvk_registry: 'registry_search_results',
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
export const AI_ACTION_TOOL_NAMES = Object.freeze(Object.keys(AI_ACTION_TOOL_NAME_TO_RESULT_TYPE));
export const AI_ACTION_TOOL_RESULT_TYPES = [
    'normalization_suggestion',
    'field_update',
    'valuation_run_request',
    'report_generation_request',
    'sellability_run_request',
    'owner_profile_answer_request',
    'integration_connect_request',
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
    'listing_preview',
    'listing_create_request',
    'buyer_profile_preview',
    'business_type_search_results',
    'registry_search_results',
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
export const AI_STREAM_CHUNK_TYPES = [
    'text',
    'tool_start',
    'tool_result',
    'done',
    'error',
];
const AI_ACTION_TOOL_NAME_SET = new Set(AI_ACTION_TOOL_NAMES);
const AI_ACTION_TOOL_RESULT_TYPE_SET = new Set(AI_ACTION_TOOL_RESULT_TYPES);
export function isAiActionToolName(value) {
    return typeof value === 'string' && AI_ACTION_TOOL_NAME_SET.has(value);
}
export function isAiActionToolResultType(value) {
    return typeof value === 'string' && AI_ACTION_TOOL_RESULT_TYPE_SET.has(value);
}
export function classifyAiActionToolResultType(toolName) {
    return AI_ACTION_TOOL_NAME_TO_RESULT_TYPE[toolName] ?? 'data';
}
//# sourceMappingURL=index.js.map