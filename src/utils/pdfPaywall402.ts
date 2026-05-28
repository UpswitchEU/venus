export type TitanPdfPaywallBody = {
  code?: string
  message?: string
  error?: string
  action?: string
  required_tier?: string
}

/** Maps Titan 402 paywall to BFF JSON (seller invite-advisor vs advisor Starter). */
export function buildPdfPaywall402JsonBody(
  errBody: TitanPdfPaywallBody,
  fallbackError = 'PDF download is not available on your current plan.'
): Record<string, unknown> {
  const code = typeof errBody.code === 'string' ? errBody.code : undefined
  const message =
    typeof errBody.message === 'string'
      ? errBody.message
      : typeof errBody.error === 'string'
        ? errBody.error
        : fallbackError

  if (code === 'INVITE_ADVISOR_REQUIRED') {
    return {
      success: false,
      error: message,
      code,
      action: typeof errBody.action === 'string' ? errBody.action : 'invite_accountant',
      inviteAdvisorRequired: true,
    }
  }

  return {
    success: false,
    error: message,
    code: code ?? 'STARTER_REQUIRED',
    upgradeRequired: true,
    required_tier: typeof errBody.required_tier === 'string' ? errBody.required_tier : 'starter',
  }
}
