import { describe, expect, it } from 'vitest'
import {
  getValuationEditGuidanceTextKey,
  getValuationEditGuidanceVariant,
  getValuationEditModeForSelectedMethod,
  resolveSelectedValuationMethodLabel,
  resolveValuationEditEmptyState,
  sanitizeZeroDraftFilename,
} from './ValuationEditModalModel'

describe('ValuationEditModalModel', () => {
  it('derives the edit mode from the selected headline method', () => {
    expect(getValuationEditModeForSelectedMethod('upswitch_adaptive')).toBe('ai')
    expect(getValuationEditModeForSelectedMethod('ebitda_multiple')).toBe('manual')
  })

  it('derives guidance state from pending override and mode', () => {
    expect(getValuationEditGuidanceVariant('ai', null)).toBe('ai')
    expect(getValuationEditGuidanceVariant('manual', null)).toBe('manual')
    expect(getValuationEditGuidanceVariant('ai', 'dcf')).toBe('pending')
    expect(getValuationEditGuidanceTextKey('pending')).toBe('stepExplainReason')
    expect(getValuationEditGuidanceTextKey('manual')).toBe('stepChooseMethod')
    expect(getValuationEditGuidanceTextKey('ai')).toBe('stepAiActive')
  })

  it('maps empty method states to stable translation and action policy', () => {
    expect(
      resolveValuationEditEmptyState({
        isHydratingMethods: true,
        methodDataLoadError: null,
        hasImportReviewRecovery: true,
      })
    ).toMatchObject({
      titleSource: 'modal',
      titleKey: 'loadingTitle',
      blurbKey: 'loadingBlurb',
      showRetry: false,
      showImportReviewRecovery: false,
    })

    expect(
      resolveValuationEditEmptyState({
        isHydratingMethods: false,
        methodDataLoadError: 'transient',
        hasImportReviewRecovery: true,
      })
    ).toMatchObject({
      titleSource: 'omni',
      titleKey: 'transientLoadTitle',
      showRetry: true,
      showImportReviewRecovery: false,
    })

    expect(
      resolveValuationEditEmptyState({
        isHydratingMethods: false,
        methodDataLoadError: 'report_pending',
        hasImportReviewRecovery: true,
      })
    ).toMatchObject({
      titleKey: 'unavailableTitleReportPending',
      blurbKey: 'unavailableBlurbReportPending',
      showRetry: true,
      showImportReviewRecovery: true,
    })
  })

  it('resolves the visible method label with adaptive fallback', () => {
    const valuationResults = {
      ebitda_multiple: { available: true, label: 'EBITDA Multiple', value: 120000 },
    }
    expect(
      resolveSelectedValuationMethodLabel({
        adaptiveLabel: 'Adaptive',
        method: 'upswitch_adaptive',
        valuationResults,
      })
    ).toBe('Adaptive')
    expect(
      resolveSelectedValuationMethodLabel({
        adaptiveLabel: 'Adaptive',
        method: 'ebitda_multiple',
        valuationResults,
      })
    ).toBe('EBITDA Multiple')
    expect(
      resolveSelectedValuationMethodLabel({
        adaptiveLabel: 'Adaptive',
        method: 'missing_method',
        valuationResults,
      })
    ).toBe('Adaptive')
  })

  it('sanitizes Zero Draft filenames without altering safe characters', () => {
    expect(sanitizeZeroDraftFilename('zero-draft_report.123.csv')).toBe('zero-draft_report.123.csv')
    expect(sanitizeZeroDraftFilename('Zero Draft: ACME / BE #42.csv')).toBe(
      'Zero_Draft__ACME___BE__42.csv'
    )
  })
})
