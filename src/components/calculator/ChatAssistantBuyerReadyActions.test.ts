import { describe, expect, it } from 'vitest'
import {
  buildBuyerReadyPackageActions,
  buildDataRoomActions,
  buildDdChecklistActions,
  buildLegalReadinessActions,
  buildPackageGapPrompt,
  type ChatAssistantTranslator,
  extractErrorMessage,
  extractGeneratedEntityId,
  formatBytes,
  formatMoney,
  humanize,
  safeBuyerReadyPackagePath,
} from './ChatAssistantBuyerReadyActions'
import type { BuyerReadyToolCard } from './ChatAssistantTypes'

const translate = ((key: string) => key) as ChatAssistantTranslator

describe('ChatAssistantBuyerReadyActions', () => {
  it('keeps buyer-ready package submission pinned to the exact BFF endpoint', () => {
    expect(safeBuyerReadyPackagePath('/api/valuations/reports/report-1/buyer-ready-package')).toBe(
      '/api/valuations/reports/report-1/buyer-ready-package'
    )
    expect(safeBuyerReadyPackagePath('/api/auth/logout')).toBeNull()
    expect(
      safeBuyerReadyPackagePath('/api/valuations/reports/report-1/buyer-ready-package?x=1')
    ).toBeNull()
    expect(
      safeBuyerReadyPackagePath('//evil.test/api/valuations/reports/1/buyer-ready-package')
    ).toBeNull()
  })

  it('normalizes display helpers without leaking invalid values', () => {
    expect(humanize('__buyer_ready__')).toBe('Buyer Ready')
    expect(formatBytes(1025)).toBe('2 KB')
    expect(formatBytes(Number.NaN)).toBeNull()
    expect(formatMoney(1_200_000, 'EUR')).toMatch(/1\.200\.000/)
    expect(formatMoney(null, 'EUR')).toBeNull()
  })

  it('extracts generated entity ids and prioritized error messages from API payloads', () => {
    expect(extractGeneratedEntityId({ data: { entity_id: ' entity-1 ' } })).toBe('entity-1')
    expect(extractGeneratedEntityId({ entityId: 'entity-2' })).toBe('entity-2')
    expect(extractGeneratedEntityId({ data: { entityId: '' } })).toBeNull()
    expect(extractErrorMessage({ message: 'fallback', error: 'primary' }, 422)).toBe('primary')
    expect(extractErrorMessage({}, 503)).toBe('HTTP 503')
  })

  it('builds buyer-ready package actions from gaps and defaults', () => {
    const card = {
      kind: 'buyer_package_status',
      id: 'package-status',
      entityId: 'entity-1',
      packageStatus: 'draft',
      releaseStatus: 'not_ready',
      includedArtifactCount: 2,
      requiredArtifactCount: 4,
      missingRequiredArtifactTypes: ['information_memorandum'],
      openInputCount: 2,
      checklist: {
        overallStatus: 'needs_review',
        greenCount: 3,
        yellowCount: 1,
        redCount: 1,
      },
    } as Extract<BuyerReadyToolCard, { kind: 'buyer_package_status' }>

    expect(buildPackageGapPrompt(card)).toBe(
      'Help me resolve buyer-ready package gaps for buyer-ready package entity-1 (missing artifacts: Information Memorandum; 2 open inputs; diligence: 1 missing, 1 review).'
    )
    expect(buildBuyerReadyPackageActions(card, translate).map((action) => action.prompt)).toEqual([
      'Help me resolve buyer-ready package gaps for buyer-ready package entity-1 (missing artifacts: Information Memorandum; 2 open inputs; diligence: 1 missing, 1 review).',
      'Review the diligence checklist for buyer-ready package entity-1.',
      'Review the data room manifest for buyer-ready package entity-1.',
      'Check legal readiness for buyer-ready package entity-1.',
    ])
  })

  it('builds diligence, data-room, and legal follow-up actions', () => {
    const ddCard = {
      kind: 'dd_checklist',
      id: 'dd',
      entityId: 'entity-2',
      overallStatus: 'needs_review',
      greenCount: 4,
      yellowCount: 1,
      redCount: 1,
      items: [
        {
          category: 'financial_documents',
          status: 'red',
          reason: 'Missing annual accounts',
          advisorOverride: false,
        },
      ],
    } as Extract<BuyerReadyToolCard, { kind: 'dd_checklist' }>
    const dataRoomCard = {
      kind: 'data_room_manifest',
      id: 'data-room',
      entityId: 'entity-3',
      docCount: 0,
      ndaSignedBuyerCount: 0,
      docs: [],
    } as Extract<BuyerReadyToolCard, { kind: 'data_room_manifest' }>
    const legalCard = {
      kind: 'legal_readiness',
      id: 'legal',
      entityId: 'entity-4',
      jurisdiction: 'BE',
      dealStructure: 'share_deal',
      buyerReleaseStatus: 'blocked',
      counselReviewRequired: true,
      clearCount: 1,
      reviewCount: 1,
      blockedCount: 1,
      items: [
        {
          category: 'share_purchase_agreement',
          status: 'blocked',
          title: 'SPA review',
          owner: 'legal',
          requiredBefore: 'publication',
          reason: 'Counsel review required',
        },
      ],
    } as Extract<BuyerReadyToolCard, { kind: 'legal_readiness' }>

    expect(buildDdChecklistActions(ddCard, translate)[0]?.prompt).toBe(
      'Help me resolve the diligence checklist gaps for buyer-ready package entity-2: Financial Documents.'
    )
    expect(buildDataRoomActions(dataRoomCard, translate).map((action) => action.prompt)).toEqual([
      'Prepare a data-room upload for buyer-ready package entity-3.',
      'Review the buyer-ready package status for buyer-ready package entity-3.',
    ])
    expect(buildLegalReadinessActions(legalCard, translate)[0]?.prompt).toBe(
      'Request a lawyer handoff for buyer-ready package entity-4 about Share Purchase Agreement.'
    )
  })
})
