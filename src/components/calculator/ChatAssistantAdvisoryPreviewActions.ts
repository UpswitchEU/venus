import type { useTranslations } from 'next-intl'
import type {
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ClientDataReadinessPreview,
  ListingPreview,
  MethodReadinessPreview,
} from './ChatAssistantTypes'

export type ChatAssistantTranslator = ReturnType<typeof useTranslations>
export type FollowUpAction = { label: string; prompt: string; primary?: boolean }
export type IntegrationActionOptions = { integrationsEnabled?: boolean }

export function formatMethodName(method: string) {
  return method
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function listingSubject(preview: Pick<ListingPreview, 'reportId' | 'sourceBusinessName'>) {
  if (preview.reportId) return `valuation report ${preview.reportId}`
  if (preview.sourceBusinessName) return preview.sourceBusinessName
  return 'this business'
}

export function buyerProfileSubject(
  preview: Pick<BuyerProfilePreview, 'reportId' | 'sourceBusinessName'>
) {
  if (preview.reportId) return `valuation report ${preview.reportId}`
  if (preview.sourceBusinessName) return preview.sourceBusinessName
  return 'this business'
}

export function buildListingGapPrompt(preview: ListingPreview) {
  const hint = preview.nextActionHint?.trim()
  if (hint) return hint
  const fields = preview.missingFields?.filter(Boolean) ?? []
  if (fields.length > 0) {
    return `Help me complete the missing listing fields for ${listingSubject(preview)}: ${fields.join(
      ', '
    )}.`
  }
  return `Help me get the listing ready for ${listingSubject(preview)}.`
}

export function buildBuyerProfileGapPrompt(preview: BuyerProfilePreview) {
  const fields = preview.listingReadiness?.missingFields?.filter(Boolean) ?? []
  if (fields.length > 0) {
    return `Help me complete the missing listing fields for ${buyerProfileSubject(
      preview
    )}: ${fields.join(', ')}.`
  }
  return `Help me get the buyer profile ready for ${buyerProfileSubject(preview)}.`
}

function bootstrapSubject(bootstrap: BelgianCompanyBootstrap) {
  if (bootstrap.identity?.legalName) return bootstrap.identity.legalName
  if (bootstrap.identity?.kboNumber) return `KBO ${bootstrap.identity.kboNumber}`
  return 'this company'
}

export function buildBelgianBootstrapActions(
  bootstrap: BelgianCompanyBootstrap,
  ca: ChatAssistantTranslator,
  options: IntegrationActionOptions = {}
): FollowUpAction[] {
  const subject = bootstrapSubject(bootstrap)
  const integrationsEnabled = options.integrationsEnabled === true
  const isBlocked = bootstrap.status === 'blocked' || bootstrap.status === 'failed'
  if (isBlocked) {
    return [
      {
        label: ca('proposalCards.belgianBootstrap.resolveGapsAction'),
        prompt: `Help me bootstrap ${subject} from KBO/NBB public data and resolve the data gaps.`,
        primary: true,
      },
    ]
  }
  const actions: FollowUpAction[] = [
    {
      label: ca('proposalCards.belgianBootstrap.createClientAction'),
      prompt: `Create an advisor client for ${subject} from this KBO/NBB public-data bootstrap.`,
      primary: true,
    },
  ]
  if (integrationsEnabled) {
    actions.push({
      label: ca('proposalCards.belgianBootstrap.connectAccountingAction'),
      prompt: `Connect accounting data for ${subject} and continue onboarding.`,
    })
  }
  actions.push({
    label: ca('proposalCards.belgianBootstrap.startValuationAction'),
    prompt: `Start a valuation for ${subject} using the public data, then ask me for any missing inputs.`,
  })
  return actions
}

function clientReadinessSubject(readiness: ClientDataReadinessPreview) {
  if (readiness.businessName) return readiness.businessName
  if (readiness.clientId) return `client ${readiness.clientId}`
  return 'this client'
}

export function buildClientDataReadinessActions(
  readiness: ClientDataReadinessPreview,
  ca: ChatAssistantTranslator,
  options: IntegrationActionOptions = {}
): FollowUpAction[] {
  const subject = clientReadinessSubject(readiness)
  const integrationsEnabled = options.integrationsEnabled === true
  const needsReview =
    readiness.status === 'needs_import_review' ||
    readiness.recommendedNextTool === 'open_import_review'
  const isReady = readiness.status === 'ready_for_valuation'
  if (needsReview) {
    return [
      {
        label: ca('proposalCards.clientDataReadiness.openReviewAction'),
        prompt: `Open the import review for ${subject} and walk me through the accounting flags.`,
        primary: true,
      },
      {
        label: ca('proposalCards.clientDataReadiness.resolveDataAction'),
        prompt: `Help me resolve client data readiness for ${subject}.`,
      },
    ]
  }
  if (isReady) {
    return [
      {
        label: ca('proposalCards.clientDataReadiness.startValuationAction'),
        prompt: `Start a valuation for ${subject} using the synced accounting data.`,
        primary: true,
      },
      {
        label: ca('proposalCards.clientDataReadiness.resolveDataAction'),
        prompt: `Review client data readiness for ${subject} before valuation.`,
      },
    ]
  }
  const actions: FollowUpAction[] = []
  if (integrationsEnabled) {
    actions.push({
      label: ca('proposalCards.clientDataReadiness.connectAccountingAction'),
      prompt: `Help me connect or import accounting data for ${subject}.`,
      primary: true,
    })
  }
  actions.push(
    {
      label: ca('proposalCards.clientDataReadiness.enterFiguresAction'),
      prompt: `Enter financials manually for ${subject}: revenue + EBITDA by fiscal year.`,
      primary: !integrationsEnabled,
    },
    {
      label: ca('proposalCards.clientDataReadiness.resolveDataAction'),
      prompt: `Help me resolve client data readiness for ${subject}.`,
    }
  )
  return actions
}

function methodReadinessSubject(preview: MethodReadinessPreview) {
  if (preview.businessName) return preview.businessName
  if (preview.reportId) return `valuation report ${preview.reportId}`
  return 'this valuation'
}

function methodsForPrompt(methods: string[]) {
  const names = methods.map(formatMethodName).filter(Boolean).slice(0, 6)
  return names.length > 0 ? names.join(', ') : 'the available methods'
}

export function buildMethodReadinessActions(
  preview: MethodReadinessPreview,
  ca: ChatAssistantTranslator
): FollowUpAction[] {
  const subject = methodReadinessSubject(preview)
  if (preview.status === 'blocked') {
    return [
      {
        label: ca('proposalCards.methodReadiness.resolveAction'),
        prompt: `Help me resolve valuation-method readiness for ${subject}.`,
        primary: true,
      },
      {
        label: ca('proposalCards.methodReadiness.explainAction'),
        prompt: `Explain the valuation-method readiness for ${subject} and recommend the next best method.`,
      },
    ]
  }

  const actions: FollowUpAction[] = []
  if (preview.readyMethods.length > 0) {
    actions.push({
      label: ca('proposalCards.methodReadiness.runReadyAction'),
      prompt: `Run the ready valuation methods for ${subject}: ${methodsForPrompt(
        preview.readyMethods
      )}.`,
      primary: true,
    })
  }
  if (preview.blockedMethods.length > 0) {
    actions.push({
      label: ca('proposalCards.methodReadiness.unlockMethodsAction'),
      prompt: `Help me unlock these valuation methods for ${subject}: ${methodsForPrompt(
        preview.blockedMethods
      )}.`,
    })
  }
  actions.push({
    label: ca('proposalCards.methodReadiness.explainAction'),
    prompt: `Explain the valuation-method readiness for ${subject} and recommend the next best method.`,
  })
  return actions
}
