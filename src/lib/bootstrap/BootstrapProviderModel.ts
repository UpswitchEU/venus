import type { CreditStatus, PrefillData, ReportMode } from './types'

export const DEFAULT_BOOTSTRAP_CREDIT_ERROR = 'Insufficient credits to create valuation'

export type BootstrapReportIdentityEvaluation =
  | {
      kind: 'match'
      requestedId: string | null
      returnedId: string | null
    }
  | {
      kind: 'expected-mint'
      requestedId: 'new'
      returnedId: string
    }
  | {
      kind: 'mismatch'
      requestedId: string
      returnedId: string | null
      reportMode: ReportMode
      message: string
    }

export type BootstrapCreditPolicy =
  | {
      kind: 'allow'
    }
  | {
      kind: 'allow-existing-report-with-credit-warning'
      creditStatus: CreditStatus
    }
  | {
      kind: 'block-new-report'
      creditStatus: CreditStatus
      message: string
    }

function trimReportId(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function formatReportIdForError(value: string | null): string {
  return value?.substring(0, 8) ?? 'null'
}

export function evaluateBootstrapReportIdentity({
  requestedReportId,
  returnedReportId,
  reportMode,
}: {
  requestedReportId?: string | null
  returnedReportId?: string | null
  reportMode: ReportMode
}): BootstrapReportIdentityEvaluation {
  const requestedId = trimReportId(requestedReportId)
  const returnedId = trimReportId(returnedReportId)

  if (!requestedId || requestedId === returnedId) {
    return { kind: 'match', requestedId, returnedId }
  }

  if (requestedId === 'new' && returnedId) {
    return { kind: 'expected-mint', requestedId, returnedId }
  }

  return {
    kind: 'mismatch',
    requestedId,
    returnedId,
    reportMode,
    message:
      `Report not available: requested ${formatReportIdForError(requestedId)} but resolved ${formatReportIdForError(returnedId)}. ` +
      'The report may not exist, you may not have access, or your session may be stale.',
  }
}

export function evaluateBootstrapCreditPolicy({
  creditStatus,
  reportMode,
}: {
  creditStatus?: CreditStatus
  reportMode: ReportMode
}): BootstrapCreditPolicy {
  if (!creditStatus || creditStatus.allowed) {
    return { kind: 'allow' }
  }

  if (reportMode === 'existing') {
    return { kind: 'allow-existing-report-with-credit-warning', creditStatus }
  }

  return {
    kind: 'block-new-report',
    creditStatus,
    message: creditStatus.message || DEFAULT_BOOTSTRAP_CREDIT_ERROR,
  }
}

export function hasMeaningfulBootstrapPrefill(prefillData: PrefillData): boolean {
  if ((prefillData.fieldsPopulated?.length ?? 0) > 0) return true
  if (prefillData.confidence >= 0.05) return true
  if (prefillData.companyInfo?.companyName?.trim()) return true
  if (prefillData.companyInfo?.kboNumber || prefillData.companyInfo?.vatNumber) return true
  if (prefillData.kboData?.kboNumber || prefillData.kboData?.vatNumber) return true
  if (prefillData.businessType?.id) return true
  if (prefillData.financials?.yearData && Object.keys(prefillData.financials.yearData).length > 0) {
    return true
  }
  if (
    prefillData.financials?.revenue != null &&
    Number.isFinite(Number(prefillData.financials.revenue))
  ) {
    return true
  }
  if (
    prefillData.financials?.ebitda != null &&
    Number.isFinite(Number(prefillData.financials.ebitda))
  ) {
    return true
  }
  return false
}
