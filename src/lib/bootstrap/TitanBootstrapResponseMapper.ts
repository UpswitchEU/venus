import {
  type CompanyGraphContext,
  isCompanyGraphContextForAudience,
  parseCompanyGraphContext,
} from '../../types/companyGraphContext'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import type {
  BootstrapContext,
  BootstrapErrorInfo,
  CreditStatus,
  IdentityState,
  PrefillData,
  ReportState,
  SessionBootstrapState,
  UIHints,
  ValuationPackage,
} from './types'
import {
  BOOTSTRAP_VERSION,
  DEFAULT_IDENTITY,
  DEFAULT_PREFILL,
  DEFAULT_REPORT,
  DEFAULT_UI_HINTS,
} from './types'
import { generateReportId } from './utils'

type DateInput = string | number | Date

type TitanIdentityPayload = Partial<IdentityState> & Pick<IdentityState, 'type'>

type TitanReportPayload = Partial<Omit<ReportState, 'createdAt' | 'updatedAt' | 'completedAt'>> & {
  mode?: ReportState['mode']
  reportId?: string
  hasExistingData?: boolean
  status?: ReportState['status']
  createdAt?: DateInput
  updatedAt?: DateInput
  completedAt?: DateInput
}

type TitanValuationPackagePayload = Partial<ValuationPackage> & {
  htmlReport?: string | null
}

type TitanPrefillPayload = Partial<Omit<PrefillData, 'companyGraphContext'>> & {
  company_graph_context?: unknown
}

export interface TitanBootstrapData {
  identity?: TitanIdentityPayload
  report?: TitanReportPayload
  prefill?: TitanPrefillPayload
  ui?: Partial<UIHints>
  creditStatus?: CreditStatus
  valuationPackage?: TitanValuationPackagePayload
}

export interface SuccessfulTitanBootstrapData extends TitanBootstrapData {
  identity: TitanIdentityPayload
  report: TitanReportPayload
  prefill: TitanPrefillPayload
  ui: Partial<UIHints>
}

export interface TitanBootstrapResponsePayload {
  success?: boolean
  data?: TitanBootstrapData
  error?: string
  errorInfo?: BootstrapErrorInfo
  bootstrapDurationMs?: number
}

function toDate(value: DateInput | undefined): Date | undefined {
  return value ? new Date(value) : undefined
}

function expectedWorkspaceAudience(identity?: TitanIdentityPayload): 'owner' | 'advisor' | null {
  if (!identity) return null
  if (identity.type === 'accountant_for_client') return 'advisor'
  if (identity.type === 'authenticated') return 'owner'
  return null
}

function parseTitanCompanyGraphContext(
  prefill: TitanPrefillPayload | undefined,
  identity: TitanIdentityPayload | undefined
): CompanyGraphContext | undefined {
  if (!prefill) return undefined
  const context = parseCompanyGraphContext(
    (prefill as Record<string, unknown>).company_graph_context
  )
  if (!context) return undefined

  const expectedAudience = expectedWorkspaceAudience(identity)
  if (!expectedAudience || !isCompanyGraphContextForAudience(context, expectedAudience)) {
    return undefined
  }
  return context
}

function sanitizePackageFormData(
  value: Record<string, unknown> | undefined,
  identity: TitanIdentityPayload | undefined
): Record<string, unknown> | undefined {
  if (
    !value ||
    (!Object.hasOwn(value, 'company_graph_context') && !Object.hasOwn(value, 'companyGraphContext'))
  ) {
    return value
  }
  const next = { ...value }
  delete next.companyGraphContext
  const context = parseCompanyGraphContext(next.company_graph_context)
  const expectedAudience = expectedWorkspaceAudience(identity)
  if (context && expectedAudience && isCompanyGraphContextForAudience(context, expectedAudience)) {
    next.company_graph_context = context
  } else {
    delete next.company_graph_context
  }
  return next
}

export function buildCreditBlockedTitanState(
  data: TitanBootstrapData,
  context: BootstrapContext,
  startTime: number
): SessionBootstrapState {
  const { identity, report, prefill, ui, creditStatus } = data

  return {
    identity: identity
      ? {
          type: identity.type ?? DEFAULT_IDENTITY.type,
          userId: identity.userId,
          clientContext: identity.clientContext,
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
        }
      : DEFAULT_IDENTITY,
    report: report
      ? {
          mode: report.mode ?? DEFAULT_REPORT.mode,
          reportId: report.reportId || context.reportId || generateReportId(),
          hasExistingData: report.hasExistingData || false,
          version: report.version,
          status: report.status || 'active',
          createdAt: toDate(report.createdAt),
          updatedAt: toDate(report.updatedAt),
          completedAt: toDate(report.completedAt),
          currentStep: report.currentStep,
        }
      : DEFAULT_REPORT,
    prefillData: prefill
      ? {
          sources: prefill.sources || [],
          companyInfo: prefill.companyInfo,
          financials: prefill.financials,
          officialFinancials: prefill.officialFinancials,
          officialEnrichmentJobId: prefill.officialEnrichmentJobId,
          businessType: prefill.businessType,
          kboData: prefill.kboData,
          confidence: prefill.confidence || 0,
          fieldsPopulated: prefill.fieldsPopulated || [],
          fieldsRemaining: prefill.fieldsRemaining || [],
          companyGraphContext: parseTitanCompanyGraphContext(prefill, identity),
        }
      : DEFAULT_PREFILL,
    ui: ui
      ? {
          showWelcomeBack: ui.showWelcomeBack || false,
          resumableSession: ui.resumableSession || false,
          suggestedFlow: ui.suggestedFlow || 'manual',
          prefilledFieldCount: ui.prefilledFieldCount || 0,
          totalFieldCount: ui.totalFieldCount || 0,
          showKboVerification: ui.showKboVerification || false,
          showAccountantBanner: ui.showAccountantBanner || false,
          returnUrl: ui.returnUrl,
          sourceApp: ui.sourceApp,
        }
      : DEFAULT_UI_HINTS,
    creditStatus,
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
    bootstrapDurationMs: performance.now() - startTime,
  }
}

export function buildSuccessfulTitanState(
  data: SuccessfulTitanBootstrapData,
  context: BootstrapContext,
  startTime: number,
  bootstrapDurationMs?: number
): SessionBootstrapState {
  const { identity, report, prefill, ui, creditStatus, valuationPackage } = data

  return {
    identity: {
      type: identity.type,
      userId: identity.userId,
      clientContext: identity.clientContext,
      email: identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
    },
    report: {
      mode: report.mode ?? DEFAULT_REPORT.mode,
      reportId: report.reportId ?? context.reportId ?? generateReportId(),
      hasExistingData: report.hasExistingData ?? false,
      hasValuationResult: report.hasValuationResult || !!valuationPackage?.htmlReport,
      reportReady:
        typeof report.reportReady === 'boolean'
          ? report.reportReady
          : report.status !== 'completed' || !!valuationPackage?.htmlReport,
      version: report.version,
      status: report.status ?? DEFAULT_REPORT.status,
      createdAt: toDate(report.createdAt),
      updatedAt: toDate(report.updatedAt),
      completedAt: toDate(report.completedAt),
      currentStep: report.currentStep,
    },
    prefillData: {
      sources: prefill.sources ?? [],
      companyInfo: prefill.companyInfo,
      financials: prefill.financials,
      officialFinancials: prefill.officialFinancials,
      officialEnrichmentJobId: prefill.officialEnrichmentJobId,
      businessType: prefill.businessType,
      kboData: prefill.kboData,
      confidence: prefill.confidence ?? 0,
      fieldsPopulated: prefill.fieldsPopulated ?? [],
      fieldsRemaining: prefill.fieldsRemaining ?? [],
      companyGraphContext: parseTitanCompanyGraphContext(prefill, identity),
    },
    ui: {
      showWelcomeBack: ui.showWelcomeBack ?? false,
      resumableSession: ui.resumableSession ?? false,
      suggestedFlow: ui.suggestedFlow ?? 'manual',
      prefilledFieldCount: ui.prefilledFieldCount ?? 0,
      totalFieldCount: ui.totalFieldCount ?? 0,
      showKboVerification: ui.showKboVerification ?? false,
      showAccountantBanner: ui.showAccountantBanner ?? false,
      returnUrl: context.returnUrl,
      sourceApp: context.sourceApp,
    },
    creditStatus,
    valuationPackage: valuationPackage
      ? {
          htmlReport: getFirstRenderableReportHtml(valuationPackage.htmlReport) ?? null,
          pricingRange: valuationPackage.pricingRange || null,
          versions: valuationPackage.versions || { current: 1, total: 1 },
          pdf: valuationPackage.pdf || { url: null, status: 'none' },
          formData: sanitizePackageFormData(valuationPackage.formData, identity),
          buyerReadiness: valuationPackage.buyerReadiness || undefined,
        }
      : undefined,
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
    bootstrapDurationMs: bootstrapDurationMs || performance.now() - startTime,
  }
}
