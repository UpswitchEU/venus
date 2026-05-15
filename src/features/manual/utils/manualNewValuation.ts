import { buildPostDeleteNewValuationUrl } from './deleteValuationEntry'

interface ResolveManualNewValuationPrefilledCompanyNameParams {
  collectedCompanyName?: string | null
  isAccountantFlow: boolean
  clientCompanyName?: string | null
}

interface ResolveManualNewValuationClientIdParams {
  isAccountantMode: boolean
  isActingAsClient?: boolean
  clientContextId?: string | null
  relationshipId?: string | null
}

export interface BuildManualNewValuationUrlParams
  extends ResolveManualNewValuationPrefilledCompanyNameParams,
    ResolveManualNewValuationClientIdParams {
  locale: string
  currentSearch?: string | URLSearchParams | null
}

function normalizeText(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

export function resolveManualNewValuationPrefilledCompanyName({
  collectedCompanyName,
  isAccountantFlow,
  clientCompanyName,
}: ResolveManualNewValuationPrefilledCompanyNameParams): string | undefined {
  return (
    normalizeText(collectedCompanyName) ??
    (isAccountantFlow ? normalizeText(clientCompanyName) : undefined)
  )
}

export function resolveManualNewValuationClientId({
  isAccountantMode,
  isActingAsClient,
  clientContextId,
  relationshipId,
}: ResolveManualNewValuationClientIdParams): string | undefined {
  if (!isAccountantMode && !isActingAsClient) return undefined
  return normalizeText(clientContextId) ?? normalizeText(relationshipId)
}

export function buildManualNewValuationUrl({
  locale,
  collectedCompanyName,
  isAccountantFlow,
  clientCompanyName,
  isAccountantMode,
  isActingAsClient,
  clientContextId,
  relationshipId,
  currentSearch,
}: BuildManualNewValuationUrlParams): string {
  return buildPostDeleteNewValuationUrl({
    locale,
    clientId: resolveManualNewValuationClientId({
      isAccountantMode,
      isActingAsClient,
      clientContextId,
      relationshipId,
    }),
    companyName: resolveManualNewValuationPrefilledCompanyName({
      collectedCompanyName,
      isAccountantFlow,
      clientCompanyName,
    }),
    currentSearch,
  })
}
