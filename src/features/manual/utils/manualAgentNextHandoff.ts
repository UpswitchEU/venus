export const MANUAL_AGENT_NEXT_RUN_VALUATION = 'run_valuation'
export const MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT = 'Run the valuation for this client.'
export const MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT =
  'Profile likely buyers for this completed valuation. Show the listing preview and buyer profile first; wait to propose opening the listing wizard until I ask to publish.'

export function isManualAgentNextRunValuation(value: string | null | undefined): boolean {
  return value?.trim() === MANUAL_AGENT_NEXT_RUN_VALUATION
}

export function stripAgentNextFromHref(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('agent_next')
  const search = url.searchParams.toString()
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
}
