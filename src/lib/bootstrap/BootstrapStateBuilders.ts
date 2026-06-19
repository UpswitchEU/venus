import type {
  BootstrapContext,
  BootstrapHints,
  FlowType,
  IdentityState,
  PrefillData,
  ReportState,
  SessionBootstrapState,
  UIHints,
} from './types'
import {
  BOOTSTRAP_VERSION,
  DEFAULT_IDENTITY,
  DEFAULT_PREFILL,
  DEFAULT_REPORT,
  DEFAULT_UI_HINTS,
} from './types'
import { generateReportId } from './utils'

export function buildBootstrapUIHints(input: {
  context: BootstrapContext
  hints: BootstrapHints
  identity: IdentityState
  report: ReportState
  prefillData: PrefillData
}): UIHints {
  let suggestedFlow: FlowType = 'manual'
  if (input.hints.requestedFlow) {
    suggestedFlow = input.hints.requestedFlow
  } else if (input.prefillData.confidence < 0.3) {
    suggestedFlow = 'conversational'
  }

  return {
    showWelcomeBack: input.report.mode === 'existing' && input.report.hasExistingData,
    resumableSession: input.report.mode === 'existing' && input.report.status === 'active',
    suggestedFlow,
    prefilledFieldCount: input.prefillData.fieldsPopulated.length,
    totalFieldCount:
      input.prefillData.fieldsPopulated.length + input.prefillData.fieldsRemaining.length,
    showKboVerification: !!input.prefillData.kboData && input.prefillData.sources.includes('kbo'),
    showAccountantBanner: input.identity.type === 'accountant_for_client',
    returnUrl: input.context.returnUrl,
    sourceApp: input.context.sourceApp,
  }
}

export function buildBootstrapFallbackState(input: {
  context: BootstrapContext
  hints: BootstrapHints
  startTime: number
}): SessionBootstrapState {
  const reportId = input.context.reportId || generateReportId()

  return {
    identity: {
      ...DEFAULT_IDENTITY,
    },
    report: {
      ...DEFAULT_REPORT,
      reportId,
      mode: input.hints.hasReportId ? 'existing' : 'new',
    },
    prefillData: DEFAULT_PREFILL,
    ui: {
      ...DEFAULT_UI_HINTS,
      suggestedFlow: input.hints.requestedFlow || 'manual',
    },
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
    bootstrapDurationMs: performance.now() - input.startTime,
  }
}
