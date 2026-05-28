export const MANUAL_AGENT_NEXT_RUN_VALUATION = 'run_valuation'
export const MANUAL_AGENT_NEXT_PROFILE_BUYERS = 'profile_buyers'
export const MANUAL_AGENT_NEXT_PREPARE_LISTING = 'prepare_listing'
export const MANUAL_AGENT_NEXT_DEEPEN_REPORT = 'deepen_report'
export const MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS = 'check_integrations'
export const MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT = 'Run the valuation for this client.'
export const MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT =
  'Profile likely buyers for this completed valuation. Show the listing preview and buyer profile first; wait to propose opening the listing wizard until I ask to publish.'
export const MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT =
  'Profile likely buyers for this completed valuation. Show the listing preview and buyer profile first, then propose opening the Mercury listing wizard as a private draft for my approval. Do not publish or create a live public listing.'
export const MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT =
  'Review this valuation workspace. Check registry context, accounting integrations, normalization adjustments, buyer-readiness gaps, and listing-readiness next steps. Propose approvals before changing anything.'
export const MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT =
  'Check whether Silverfin, Yuki, Exact, Octopus, or CSV import can improve this valuation evidence. Propose the safest connection or sync action before changing anything.'

const MANUAL_AGENT_NEXT_PROFILE_BUYERS_ALIASES = new Set([
  MANUAL_AGENT_NEXT_PROFILE_BUYERS,
  'profile-buyers',
  'profileBuyers',
])

const MANUAL_AGENT_NEXT_PREPARE_LISTING_ALIASES = new Set([
  MANUAL_AGENT_NEXT_PREPARE_LISTING,
  'prepare-listing',
  'prepareListing',
])

const MANUAL_AGENT_NEXT_DEEPEN_REPORT_ALIASES = new Set([
  MANUAL_AGENT_NEXT_DEEPEN_REPORT,
  'deepen-report',
  'deepenReport',
])

const MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_ALIASES = new Set([
  MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS,
  'check-integrations',
  'checkIntegrations',
])

export function isManualAgentNextRunValuation(value: string | null | undefined): boolean {
  return value?.trim() === MANUAL_AGENT_NEXT_RUN_VALUATION
}

export function isManualAgentNextProfileBuyers(value: string | null | undefined): boolean {
  const normalizedValue = value?.trim()
  return normalizedValue ? MANUAL_AGENT_NEXT_PROFILE_BUYERS_ALIASES.has(normalizedValue) : false
}

export function isManualAgentNextPrepareListing(value: string | null | undefined): boolean {
  const normalizedValue = value?.trim()
  return normalizedValue ? MANUAL_AGENT_NEXT_PREPARE_LISTING_ALIASES.has(normalizedValue) : false
}

export function isManualAgentNextDeepenReport(value: string | null | undefined): boolean {
  const normalizedValue = value?.trim()
  return normalizedValue ? MANUAL_AGENT_NEXT_DEEPEN_REPORT_ALIASES.has(normalizedValue) : false
}

export function isManualAgentNextCheckIntegrations(value: string | null | undefined): boolean {
  const normalizedValue = value?.trim()
  return normalizedValue ? MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_ALIASES.has(normalizedValue) : false
}

export function resolveManualAgentNextPrompt(value: string | null | undefined): string | null {
  if (isManualAgentNextRunValuation(value)) return MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT
  if (isManualAgentNextProfileBuyers(value)) return MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT
  if (isManualAgentNextPrepareListing(value)) return MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT
  if (isManualAgentNextDeepenReport(value)) return MANUAL_AGENT_NEXT_DEEPEN_REPORT_PROMPT
  if (isManualAgentNextCheckIntegrations(value)) return MANUAL_AGENT_NEXT_CHECK_INTEGRATIONS_PROMPT
  return null
}

export function stripAgentNextFromHref(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('agent_next')
  url.searchParams.delete('ai_next')
  const search = url.searchParams.toString()
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
}
