import { describe, expect, it } from 'vitest'
import {
  buildEvidenceIndex,
  buildPackageSummaryDownload,
  extractBuyerReadinessFromPackageResponse,
  formatValuationRange,
  orderedImSections,
  summarizeRoom,
} from './readiness-room-model'
import type { BuyerReadyRoomPayload, BuyerReadinessPackage } from './types'

function readiness(overrides: Partial<BuyerReadinessPackage> = {}): BuyerReadinessPackage {
  return {
    generatedAt: '2026-05-18T06:00:00Z',
    status: 'ready',
    completionPct: 82,
    summary: { complete: 8, needsAttention: 2, missing: 1, requiredTotal: 11 },
    normalizedEarnings: {
      status: 'documented',
      year: 2025,
      reportedEbitda: 300_000,
      normalizedEbitda: 360_000,
      totalAdjustments: 60_000,
      adjustmentCount: 2,
      categories: ['owner_comp'],
      confidence: 'high',
      taxLatencyCount: 1,
    },
    sellability: {
      assessmentId: 'sell-1',
      score: 76,
      band: 'Buyer-believable',
      confidence: 'high',
      createdAt: '2026-05-18T06:00:00Z',
      topActions: [],
    },
    outputs: {
      valuationReport: 'complete',
      normalizedEbitdaBridge: 'complete',
      dataRoomChecklist: 'needs_attention',
      missingDocumentList: 'needs_attention',
      buyerFaq: 'complete',
      teaserImDraft: 'complete',
    },
    checklist: [],
    missingDocuments: [
      {
        key: 'tax_filings',
        label: 'Tax filings',
        status: 'missing',
        reason: 'Latest tax filing missing.',
      },
    ],
    buyerFaq: [{ question: 'Why sell?', answer: 'Founder succession.' }],
    teaserImDraft: {
      status: 'complete',
      title: 'Anonymised software business',
      summary: 'Draft available.',
      highlights: [],
      buyerConsiderations: [],
      nextSteps: [],
    },
    privateComps: {
      eligible: true,
      reason: 'Eligible',
      contributionEndpoint: '/api/v2/multiples/contribute',
      suggestedPayload: {},
    },
    handoff: {
      legalAiHandoffReady: true,
      target: 'lawyer_or_legal_ai',
      detail: 'Ready for legal intake.',
    },
    sourceSignals: ['valuation_package'],
    ...overrides,
  }
}

function payload(): BuyerReadyRoomPayload {
  const buyerReadiness = readiness()
  return {
    entityId: '00000000-0000-4000-8000-000000000263',
    generatedAt: '2026-05-18T06:05:00Z',
    package: {
      report: {
        id: '00000000-0000-4000-8000-000000000263',
        sessionKey: null,
        businessName: 'Northsky Software',
        status: 'completed',
        pricingRange: { min: 2_000_000, mid: 2_400_000, max: 2_800_000, currency: 'EUR' },
        methodology: 'upswitch_adaptive',
        confidenceScore: 78,
        createdAt: '2026-05-17T00:00:00Z',
        updatedAt: '2026-05-18T00:00:00Z',
        completedAt: '2026-05-18T00:00:00Z',
      },
      pdf: {
        url: 'https://example.test/report.pdf',
        status: 'ready',
        generatedAt: '2026-05-18T06:00:00Z',
        expiresAt: null,
      },
      buyerReadiness,
    },
    buyerReadiness,
    im: {
      imId: 'im-1',
      packageId: 'pkg-1',
      entityId: '00000000-0000-4000-8000-000000000263',
      version: 2,
      status: 'generated',
      generatedAt: '2026-05-18T06:00:00Z',
      htmlReport: '',
      pdfHtmlReport: '',
      confidenceMap: { executive_summary: 'high', cover: 'high' },
      sections: {
        executive_summary: {
          section_key: 'executive_summary',
          heading: 'Executive summary',
          narrative_paragraphs: ['A buyer-ready SME software narrative.'],
          key_figures: [],
          confidence: 'high',
          provenance: [],
        },
        cover: {
          section_key: 'cover',
          heading: 'Cover',
          narrative_paragraphs: ['Anonymised teaser.'],
          key_figures: [],
          confidence: 'high',
          provenance: [],
        },
      },
      createdAt: '2026-05-18T06:00:00Z',
      updatedAt: '2026-05-18T06:00:00Z',
      versionHistory: [],
    },
    wcTax: null,
    vaultDocs: [
      {
        id: 'doc-1',
        entity_id: '00000000-0000-4000-8000-000000000263',
        valuation_report_id: null,
        category: 'tax_filings',
        filename: 'tax-return.pdf',
        version: 1,
        size_bytes: 12_000,
        mime_type: 'application/pdf',
        storage_path: 'vault/tax-return.pdf',
        access_gate: 'after_nda',
        uploaded_by: 'user-1',
        uploaded_at: '2026-05-18T06:00:00Z',
        created_at: '2026-05-18T06:00:00Z',
        updated_at: '2026-05-18T06:00:00Z',
      },
    ],
    readinessCase: {
      id: 'case-1',
      entityId: '00000000-0000-4000-8000-000000000263',
      valuationReportId: '00000000-0000-4000-8000-000000000263',
      title: 'Northsky readiness case',
      state: 'in_progress',
      packageMetadata: {},
      handoffExports: {},
      tasks: [],
      evidence: [
        {
          id: 'ev-1',
          signalKey: 'normalized_ebitda',
          signalLabel: 'Normalised EBITDA bridge',
          status: 'documented',
          vaultDocIds: ['doc-1'],
          updatedAt: '2026-05-18T06:00:00Z',
        },
      ],
      portfolioSignals: {
        ownerOverdue: false,
        advisorReview: true,
        buyerReady: false,
        evidenceDocumentedPct: 80,
      },
      createdAt: '2026-05-18T06:00:00Z',
      updatedAt: '2026-05-18T06:00:00Z',
      closedAt: null,
    },
    partialFailures: [],
  }
}

describe('readiness room model', () => {
  it('extracts buyer readiness from a Titan package envelope', () => {
    const buyerReadiness = readiness()
    expect(extractBuyerReadinessFromPackageResponse({ data: { buyerReadiness } })).toBe(
      buyerReadiness
    )
  })

  it('summarizes the room and orders IM sections by package structure', () => {
    const room = payload()
    const summary = summarizeRoom(room, 'en')

    expect(summary.businessName).toBe('Northsky Software')
    expect(summary.valuationRange).toContain('2,000,000')
    expect(summary.sellabilityScore).toBe(76)
    expect(summary.imSectionCount).toBe(2)
    expect(orderedImSections(room.im?.sections)[0]?.section_key).toBe('cover')
    expect(formatValuationRange(room.package?.report.pricingRange, 'nl-BE')).toContain('€')
  })

  it('builds evidence and package summary downloads without UI state', () => {
    const room = payload()
    const evidence = buildEvidenceIndex(room)
    const summary = buildPackageSummaryDownload(room)

    expect(evidence.map((row) => row.label)).toContain('tax-return.pdf')
    expect(evidence.map((row) => row.label)).toContain('Latest tax filing missing.')
    expect(summary.readinessCompletionPct).toBe(82)
    expect(summary.imVersion).toBe(2)
  })
})
