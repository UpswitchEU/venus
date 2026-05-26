/**
 * Pure-function parser for Titan's `toolResults` array, converting the
 * envelope shape into the Venus AIChatResponse fields used by the chat
 * drawer + ManualLayout host.
 *
 * Mirrors Mercury's `parseToolResultsToCards` in
 * `apps/mercury/shared/components/ai-dock/tool-card-parser.ts` but produces
 * the legacy Venus response shape: separate arrays per kind instead of a
 * single ToolCard discriminated union.
 */

import type { AiLooseToolResultEnvelope } from '@upswitch/ai-actions'
import { parseBuyerReadyToolResult } from './buyer-ready-tool-result-parser'
import { recordValue } from './tool-result-parser-utils'
import {
  parseAcknowledgeWarningRequest,
  parseBelgianCompanyBootstrap,
  parseBuyerProfilePreview,
  parseClientCreateRequest,
  parseClientDataReadiness,
  parseCsvUploadRequest,
  parseImportReviewRequest,
  parseIntegrationConnectRequest,
  parseIntegrationSyncRequest,
  parseListingPreview,
  parseListingVisibilityRequest,
  parseMethodReadiness,
  parseMultiSelectRequest,
  parseOwnerInviteAccountantRequest,
  parseOwnerProfileAnswerRequest,
  parseOwnerReminderRequest,
  parseSecureCredentialRequest,
  parseShareTokenRequest,
  parseShareTokenRevokeRequest,
  parseSingleSelectRequest,
  parseSyncStatus,
  parseValuationDefaultsRequest,
  parseValuationMethodPreferenceRequest,
  parseValuationSessionRequest,
} from './tool-result-request-parsers'
import type { ParsedToolResults } from './tool-result-types'
import {
  parseBusinessTypeSearchResults,
  parseListingCreateRequest,
  parseRegistrySearchResults,
  parseReportGenerationRequest,
  parseSellabilityRunRequest,
  parseValuationRunRequest,
} from './tool-workflow-result-parsers'

export type { ChunkDispatchCallbacks, ChunkDispatchState } from './ai-chat-chunk-dispatcher'
export { dispatchAIChatChunk, makeChunkDispatchState } from './ai-chat-chunk-dispatcher'

export type {
  AcknowledgeWarningRequest,
  BelgianCompanyBootstrap,
  BusinessTypeSearchResult,
  BusinessTypeSearchResults,
  BuyerProfilePreview,
  BuyerReadyToolCard,
  ClientCreateRequest,
  ClientDataReadinessPreview,
  CsvUploadRequest,
  FieldUpdateParsed,
  ImportReviewRequest,
  ImportReviewRequestPending,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingCreateRequest,
  ListingCreateRequestBlocked,
  ListingCreateRequestPending,
  ListingPreview,
  ListingVisibilityRequest,
  MethodReadinessPreview,
  MultiSelectRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  ParsedToolResults,
  RegistrySearchHit,
  RegistrySearchResults,
  ReportGenerationRequest,
  ReportGenerationRequestBlocked,
  ReportGenerationRequestPending,
  SecureCredentialRequest,
  SellabilityRunRequest,
  SellabilityRunRequestBlocked,
  SellabilityRunRequestPending,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  SyncStatusPreview,
  ValuationMethodPreferenceRequest,
  ValuationRunRequest,
  ValuationRunRequestBlocked,
  ValuationRunRequestPending,
  ValuationSessionRequest,
} from './tool-result-types'

function emptyResult(): ParsedToolResults {
  return {
    normalisationSuggestions: [],
    fieldUpdates: [],
    valuationRunRequests: [],
    reportGenerationRequests: [],
    sellabilityRunRequests: [],
    ownerProfileAnswerRequests: [],
    integrationConnectRequests: [],
    integrationSyncRequests: [],
    syncStatusPreviews: [],
    ownerReminderRequests: [],
    ownerInviteAccountantRequests: [],
    listingVisibilityRequests: [],
    shareTokenRequests: [],
    shareTokenRevokeRequests: [],
    valuationMethodPreferenceRequests: [],
    valuationDefaultsRequests: [],
    acknowledgeWarningRequests: [],
    secureCredentialRequests: [],
    csvUploadRequests: [],
    multiSelectRequests: [],
    singleSelectRequests: [],
    clientCreateRequests: [],
    belgianCompanyBootstraps: [],
    valuationSessionRequests: [],
    clientDataReadinessPreviews: [],
    importReviewRequests: [],
    methodReadinessPreviews: [],
    listingPreviews: [],
    listingCreateRequests: [],
    buyerProfilePreviews: [],
    registrySearchResults: [],
    businessTypeSearchResults: [],
    buyerReadyCards: [],
  }
}

/**
 * Parse Titan's `toolResults` array into the Venus drawer-facing response
 * shape. Defensive against malformed entries and unknown tool types.
 */
export function parseAIChatToolResults(toolResults: unknown): ParsedToolResults {
  if (!Array.isArray(toolResults)) return emptyResult()
  const out = emptyResult()

  for (const tr of toolResults) {
    if (!tr || typeof tr !== 'object') continue
    const entry = tr as AiLooseToolResultEnvelope
    const type = entry.type
    const data = entry.data
    if (typeof type !== 'string') continue

    switch (type) {
      case 'normalization_suggestion':
        if (data && typeof data === 'object') {
          out.normalisationSuggestions.push(data)
        }
        break

      case 'normalization_suggestion_batch': {
        const suggestions = recordValue(data)?.suggestions
        if (Array.isArray(suggestions)) {
          out.normalisationSuggestions.push(
            ...suggestions.filter((item) => item && typeof item === 'object')
          )
        }
        break
      }

      case 'field_update': {
        const update = recordValue(recordValue(data)?.update)
        if (!update) break
        const field = update.field
        const value = update.value
        const label = update.label
        if (typeof field !== 'string' || field.length === 0) break
        if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
          break
        }
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
      case 'owner_profile_answer_request':
        out.ownerProfileAnswerRequests.push(...parseOwnerProfileAnswerRequest(data))
        break
      case 'integration_connect_request':
        out.integrationConnectRequests.push(...parseIntegrationConnectRequest(data))
        break
      case 'integration_sync_request':
        out.integrationSyncRequests.push(...parseIntegrationSyncRequest(data))
        break
      case 'sync_status':
        out.syncStatusPreviews.push(...parseSyncStatus(data))
        break
      case 'owner_reminder_request':
        out.ownerReminderRequests.push(...parseOwnerReminderRequest(data))
        break
      case 'owner_invite_accountant_request':
        out.ownerInviteAccountantRequests.push(...parseOwnerInviteAccountantRequest(data))
        break
      case 'listing_visibility_request':
        out.listingVisibilityRequests.push(...parseListingVisibilityRequest(data))
        break
      case 'share_token_request':
        out.shareTokenRequests.push(...parseShareTokenRequest(data))
        break
      case 'share_token_revoke_request':
        out.shareTokenRevokeRequests.push(...parseShareTokenRevokeRequest(data))
        break
      case 'valuation_method_preference_request':
        out.valuationMethodPreferenceRequests.push(...parseValuationMethodPreferenceRequest(data))
        break
      case 'valuation_defaults_request':
        out.valuationDefaultsRequests.push(...parseValuationDefaultsRequest(data))
        break
      case 'acknowledge_warning_request':
        out.acknowledgeWarningRequests.push(...parseAcknowledgeWarningRequest(data))
        break
      case 'secure_credential_request':
        out.secureCredentialRequests.push(...parseSecureCredentialRequest(data))
        break
      case 'csv_upload_request':
        out.csvUploadRequests.push(...parseCsvUploadRequest(data))
        break
      case 'multi_select_request':
        out.multiSelectRequests.push(...parseMultiSelectRequest(data))
        break
      case 'single_select_request':
        out.singleSelectRequests.push(...parseSingleSelectRequest(data))
        break
      case 'client_create_request':
        out.clientCreateRequests.push(...parseClientCreateRequest(data))
        break
      case 'belgian_company_bootstrap':
        out.belgianCompanyBootstraps.push(...parseBelgianCompanyBootstrap(data))
        break
      case 'valuation_session_request':
        out.valuationSessionRequests.push(...parseValuationSessionRequest(data))
        break
      case 'client_data_readiness':
        out.clientDataReadinessPreviews.push(...parseClientDataReadiness(data))
        break
      case 'import_review_request':
        out.importReviewRequests.push(...parseImportReviewRequest(data))
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
      case 'business_type_search_results':
        out.businessTypeSearchResults.push(...parseBusinessTypeSearchResults(data))
        break
      case 'registry_search_results':
        out.registrySearchResults.push(...parseRegistrySearchResults(data))
        break

      case 'buyer_ready_package_status':
      case 'buyer_ready_package_generation_request':
      case 'dd_checklist':
      case 'data_room_manifest':
      case 'legal_readiness':
      case 'data_room_upload_request':
      case 'dd_override_request':
      case 'im_regenerate_request':
      case 'buyer_invitation_request':
      case 'package_publish_request':
      case 'lawyer_handoff_request': {
        const card = parseBuyerReadyToolResult(type, data)
        if (card) out.buyerReadyCards.push(card)
        break
      }

      default:
        break
    }
  }

  return out
}
