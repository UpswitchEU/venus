import {
  arrayRecords,
  cardRecord,
  nullableString,
  numberValue,
  optionalString,
  pendingRequest,
  recordValue,
  requestRecord,
  stringArray,
  stringValue,
} from './tool-result-parser-utils'
import type { BuyerReadyToolCard } from './tool-result-types'

function parseNotReadyArtifacts(value: unknown) {
  return arrayRecords(value).map((item) => ({
    artifactType: stringValue(item.artifact_type),
    status: stringValue(item.status),
    reason: stringValue(item.reason),
  }))
}

export function parseBuyerReadyToolResult(type: string, data: unknown): BuyerReadyToolCard | null {
  const d = recordValue(data)
  if (!d) return null

  switch (type) {
    case 'buyer_ready_package_status':
      return parseBuyerReadyPackageStatusCard(d)
    case 'buyer_ready_package_generation_request':
      return parseBuyerReadyPackageGenerationCard(d)
    case 'dd_checklist':
      return parseDdChecklistCard(d)
    case 'data_room_manifest':
      return parseDataRoomManifestCard(d)
    case 'legal_readiness':
      return parseLegalReadinessCard(d)
    case 'data_room_upload_request':
      return parseDataRoomUploadCard(d)
    case 'dd_override_request':
      return parseDdOverrideCard(d)
    case 'im_regenerate_request':
      return parseImRegenerateCard(d)
    case 'buyer_invitation_request':
      return parseBuyerInvitationCard(d)
    case 'package_publish_request':
      return parsePackagePublishCard(d)
    case 'lawyer_handoff_request':
      return parseLawyerHandoffCard(d)
    default:
      return null
  }
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseBuyerReadyPackageGenerationCard(
  data: Record<string, unknown>
): BuyerReadyToolCard | null {
  if (data.status !== 'pending_approval' && data.status !== 'blocked') return null
  const req = requestRecord(data) ?? {}
  const summary = recordValue(req.result_summary)
  return {
    kind: 'buyer_package_generation',
    status: data.status,
    reportId: optionalString(req.report_id),
    reason: nullableString(req.reason) ?? nullableString(data.reason),
    message: optionalString(data.message),
    regionLabel: nullableString(req.region_label),
    countryCode: nullableString(req.country_code),
    readinessCaseId: nullableString(req.readiness_case_id),
    submitPath: optionalString(req.submit_path),
    resultSummary: summary
      ? {
          businessName: nullableString(summary.business_name),
          businessType: nullableString(summary.business_type),
          valuationMethod: nullableString(summary.valuation_method),
          currency: stringValue(summary.currency, 'EUR'),
          midpoint: nullableNumber(summary.midpoint),
          min: nullableNumber(summary.min),
          max: nullableNumber(summary.max),
        }
      : null,
  }
}

function parseBuyerReadyPackageStatusCard(
  data: Record<string, unknown>
): BuyerReadyToolCard | null {
  if (data.status !== 'available') return null
  const card = cardRecord(data)
  if (!card) return null
  const checklist = recordValue(card.checklist) ?? {}
  return {
    kind: 'buyer_package_status',
    entityId: nullableString(card.entity_id),
    packageStatus: nullableString(card.package_status),
    releaseStatus: nullableString(card.release_status),
    includedArtifactCount: numberValue(card.included_artifact_count, 0),
    requiredArtifactCount: numberValue(card.required_artifact_count, 10),
    missingRequiredArtifactTypes: stringArray(card.missing_required_artifact_types),
    openInputCount: numberValue(card.open_input_count, 0),
    checklist: {
      overallStatus: nullableString(checklist.overall_status),
      greenCount: numberValue(checklist.green_count, 0),
      yellowCount: numberValue(checklist.yellow_count, 0),
      redCount: numberValue(checklist.red_count, 0),
    },
  }
}

function parseDdChecklistCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  if (data.status !== 'available') return null
  const card = cardRecord(data)
  if (!card) return null
  const items = arrayRecords(card.items)
    .map((item) => ({
      category: stringValue(item.category),
      status: stringValue(item.status),
      reason: stringValue(item.reason),
      advisorOverride: item.advisor_override === true,
    }))
    .filter((item) => item.category.length > 0)
  return {
    kind: 'dd_checklist',
    entityId: nullableString(card.entity_id),
    overallStatus: nullableString(card.overall_status),
    greenCount: numberValue(card.green_count, 0),
    yellowCount: numberValue(card.yellow_count, 0),
    redCount: numberValue(card.red_count, 0),
    items,
  }
}

function parseDataRoomManifestCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  if (data.status !== 'available') return null
  const card = cardRecord(data)
  if (!card) return null
  const docs = arrayRecords(card.docs)
    .map((doc) => ({
      filename: stringValue(doc.filename),
      category: stringValue(doc.category),
      version: numberValue(doc.version, 1),
      uploadedAt: stringValue(doc.uploaded_at),
      accessGate: stringValue(doc.access_gate),
    }))
    .filter((doc) => doc.filename.length > 0)
  return {
    kind: 'data_room_manifest',
    entityId: nullableString(card.entity_id),
    docCount: numberValue(card.doc_count, 0),
    ndaSignedBuyerCount: numberValue(card.nda_signed_buyer_count, 0),
    docs,
  }
}

function parseLegalReadinessCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  if (data.status !== 'available') return null
  const card = cardRecord(data)
  if (!card) return null
  const items = arrayRecords(card.items)
    .map((item) => ({
      category: stringValue(item.category),
      status: stringValue(item.status),
      title: stringValue(item.title),
      owner: stringValue(item.owner),
      requiredBefore: stringValue(item.required_before),
      reason: stringValue(item.reason),
    }))
    .filter((item) => item.title.length > 0)
  return {
    kind: 'legal_readiness',
    entityId: nullableString(card.entity_id),
    jurisdiction: stringValue(card.jurisdiction),
    dealStructure: stringValue(card.deal_structure),
    buyerReleaseStatus: stringValue(card.buyer_release_status),
    counselReviewRequired: card.counsel_review_required === true,
    clearCount: numberValue(card.clear_count, 0),
    reviewCount: numberValue(card.review_count, 0),
    blockedCount: numberValue(card.blocked_count, 0),
    items,
  }
}

function parseDataRoomUploadCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  const req = pendingRequest(data)
  if (!req) return null
  return {
    kind: 'data_room_upload',
    status: 'pending_approval',
    category: stringValue(req.category),
    label: stringValue(req.label),
    reason: optionalString(req.reason),
    accessGate: stringValue(req.access_gate, 'after_nda'),
    submitPath: optionalString(req.submit_path),
    maxSizeBytes: typeof req.max_size_bytes === 'number' ? req.max_size_bytes : undefined,
    accept: optionalString(req.accept),
  }
}

function parseDdOverrideCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  const req = pendingRequest(data)
  if (!req) return null
  return {
    kind: 'dd_override',
    status: 'pending_approval',
    category: stringValue(req.category),
    newStatus: stringValue(req.new_status),
    rationale: stringValue(req.rationale),
    submitPath: optionalString(req.submit_path),
  }
}

function parseImRegenerateCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  const req = pendingRequest(data)
  if (!req) return null
  return {
    kind: 'im_regenerate',
    status: 'pending_approval',
    sectionKey: stringValue(req.section_key),
    currentConfidence: nullableString(req.current_confidence),
    reason: stringValue(req.reason),
    submitPath: optionalString(req.submit_path),
  }
}

function parseBuyerInvitationCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  const req = pendingRequest(data)
  if (!req) return null
  return {
    kind: 'buyer_invitation',
    status: 'pending_approval',
    buyerEmail: stringValue(req.buyer_email),
    buyerName: nullableString(req.buyer_name),
    ndaRequired: req.nda_required !== false,
    reason: stringValue(req.reason),
    submitPath: optionalString(req.submit_path),
  }
}

function parsePackagePublishCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  const req = requestRecord(data) ?? {}
  const shared = {
    missingArtifactTypes: stringArray(req.missing_artifact_types),
    notReadyArtifacts: parseNotReadyArtifacts(req.not_ready_artifacts),
    legalReleaseStatus: nullableString(req.legal_release_status),
  }

  if (data.status === 'pending_approval') {
    return {
      kind: 'package_publish',
      status: 'pending_approval',
      reason: null,
      ...shared,
      packageStatus: nullableString(req.package_status),
      releaseStatus: nullableString(req.release_status),
      includedArtifactCount: numberValue(req.included_artifact_count, 0),
      submitPath: optionalString(req.submit_path),
    }
  }

  if (data.status === 'blocked') {
    return {
      kind: 'package_publish',
      status: 'blocked',
      reason: nullableString(data.reason),
      ...shared,
      packageStatus: null,
      releaseStatus: null,
      includedArtifactCount: 0,
    }
  }

  return null
}

function parseLawyerHandoffCard(data: Record<string, unknown>): BuyerReadyToolCard | null {
  const req = pendingRequest(data)
  if (!req) return null
  return {
    kind: 'lawyer_handoff',
    status: 'pending_approval',
    urgency: stringValue(req.urgency, 'routine'),
    handoffReason: stringValue(req.handoff_reason),
    legalItemCategory: nullableString(req.legal_item_category),
    submitPath: optionalString(req.submit_path),
  }
}
