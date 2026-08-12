import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationTypes'
import {
  buildCanonicalNormalizationDecisions,
  buildValuationRequestNormalizations,
} from '../valuationRequestNormalizations'

describe('owner-compensation normalization transport', () => {
  it('serializes actual pay, replacement pay, EBITDA delta and governance losslessly', () => {
    const ownerCompensation: NormalizationItem = {
      id: 'owner-comp-2025',
      ledgerCode: '620100',
      ledgerName: 'Working owner compensation',
      category: 'salary',
      backendCategory: 'owner_compensation_adjustment',
      type: 'add',
      value: 100_000,
      adjustment: 40_000,
      reason: 'Actual owner pay exceeds evidenced market replacement compensation',
      source: 'manual',
      sourceRef: 'evidence-owner-pay-2025',
      status: 'accepted',
      reviewedAt: '2026-08-12T09:30:00.000Z',
      applyAllYears: false,
      applyYears: [2025],
      year: 2025,
      confidence: 'high',
      ownerRole: 'working',
      actualOwnerCompensation: 100_000,
      replacementOwnerCompensation: 60_000,
      ruleVersion: 'owner-compensation-v1',
    }

    const normByYear = buildValuationRequestNormalizations({
      companyName: 'Evidence First BV',
      rawNormalizationItems: [ownerCompensation],
      legacyNormalizations: {},
      allDataYears: [2025],
      yearEbitdaMap: { 2025: 200_000 },
      ownerRole: 'working',
    })

    expect(normByYear[2025]?.items).toEqual([
      expect.objectContaining({
        category: 'owner_compensation_adjustment',
        amount: 40_000,
        owner_role: 'working',
        actual_owner_compensation: 100_000,
        replacement_owner_compensation: 60_000,
        evidence_id: 'evidence-owner-pay-2025',
        reviewed_at: '2026-08-12T09:30:00.000Z',
        rule_version: 'owner-compensation-v1',
      }),
    ])

    expect(
      buildCanonicalNormalizationDecisions({
        normByYear,
        yearEbitdaMap: { 2025: 200_000 },
        currency: 'EUR',
      })
    ).toEqual([
      expect.objectContaining({
        id: 'owner-comp-2025',
        fiscal_year: 2025,
        field: 'owner_compensation_adjustment',
        category: 'owner_compensation_adjustment',
        original_value: 200_000,
        adjusted_value: 240_000,
        adjustment_amount: 40_000,
        status: 'accepted',
        evidence_id: 'evidence-owner-pay-2025',
        reviewed_at: '2026-08-12T09:30:00.000Z',
        rule_version: 'owner-compensation-v1',
        currency: 'EUR',
        owner_role: 'working',
        actual_owner_compensation: 100_000,
        replacement_owner_compensation: 60_000,
      }),
    ])
  })
})
