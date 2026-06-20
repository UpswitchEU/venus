export type BuyerReadyToolCard =
  | {
      kind: 'buyer_package_status'
      entityId: string | null
      packageStatus: string | null
      releaseStatus: string | null
      includedArtifactCount: number
      requiredArtifactCount: number
      missingRequiredArtifactTypes: string[]
      openInputCount: number
      checklist: {
        overallStatus: string | null
        greenCount: number
        yellowCount: number
        redCount: number
      }
    }
  | {
      kind: 'buyer_package_generation'
      status: 'pending_approval' | 'blocked'
      reportId?: string
      reason: string | null
      message?: string
      regionLabel?: string | null
      countryCode?: string | null
      readinessCaseId?: string | null
      submitPath?: string
      resultSummary?: {
        businessName: string | null
        businessType: string | null
        valuationMethod: string | null
        currency: string
        midpoint: number | null
        min: number | null
        max: number | null
      } | null
    }
  | {
      kind: 'dd_checklist'
      entityId: string | null
      overallStatus: string | null
      greenCount: number
      yellowCount: number
      redCount: number
      items: Array<{
        category: string
        status: string
        reason: string
        advisorOverride: boolean
      }>
    }
  | {
      kind: 'data_room_manifest'
      entityId: string | null
      docCount: number
      ndaSignedBuyerCount: number
      docs: Array<{
        filename: string
        category: string
        version: number
        uploadedAt: string
        accessGate: string
      }>
    }
  | {
      kind: 'legal_readiness'
      entityId: string | null
      jurisdiction: string
      dealStructure: string
      buyerReleaseStatus: string
      counselReviewRequired: boolean
      clearCount: number
      reviewCount: number
      blockedCount: number
      items: Array<{
        category: string
        status: string
        title: string
        owner: string
        requiredBefore: string
        reason: string
      }>
    }
  | {
      kind: 'data_room_upload'
      status: 'pending_approval'
      category: string
      label: string
      reason?: string
      accessGate: string
      submitPath?: string
      maxSizeBytes?: number
      accept?: string
    }
  | {
      kind: 'dd_override'
      status: 'pending_approval'
      category: string
      newStatus: string
      rationale: string
      submitPath?: string
    }
  | {
      kind: 'im_regenerate'
      status: 'pending_approval'
      sectionKey: string
      currentConfidence: string | null
      reason: string
      submitPath?: string
    }
  | {
      kind: 'buyer_invitation'
      status: 'pending_approval'
      buyerEmail: string
      buyerName: string | null
      ndaRequired: boolean
      reason: string
      submitPath?: string
    }
  | {
      kind: 'package_publish'
      status: 'pending_approval' | 'blocked'
      reason: string | null
      missingArtifactTypes: string[]
      notReadyArtifacts: Array<{
        artifactType: string
        status: string
        reason: string
      }>
      legalReleaseStatus: string | null
      packageStatus: string | null
      releaseStatus: string | null
      includedArtifactCount: number
      submitPath?: string
    }
  | {
      kind: 'lawyer_handoff'
      status: 'pending_approval'
      urgency: string
      handoffReason: string
      legalItemCategory: string | null
      submitPath?: string
    }
