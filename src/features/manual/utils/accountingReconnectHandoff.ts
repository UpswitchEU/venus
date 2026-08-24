import { getMercuryUrl } from '@/utils/getMercuryUrl'

const SENSITIVE_OR_CALLBACK_QUERY_KEYS = [
  'access_token',
  'accounting_resume',
  'clientToken',
  'code',
  'firm_id',
  'id_token',
  'just_connected',
  'refresh_token',
  'resume_calculation',
  'silverfin_connect',
  'state',
  'token',
] as const

const PROVIDER_NAMES: Record<string, string> = {
  accountable: 'Accountable',
  bizzcontrol: 'Bizzcontrol',
  exact: 'Exact Online',
  expertm: 'Expert/M',
  generic: 'Custom API',
  horus: 'Horus',
  octopus: 'Octopus',
  silverfin: 'Silverfin',
  winbooks: 'WinBooks',
  wings: 'Wings',
  xero: 'Xero',
  yuki: 'Yuki',
}

export function accountingReconnectProviderName(provider: string): string {
  const normalized = provider.trim().toLowerCase()
  return (
    PROVIDER_NAMES[normalized] ??
    normalized.replace(/(^|[-_])([a-z])/g, (_, p, c) => {
      return `${p ? ' ' : ''}${String(c).toUpperCase()}`
    })
  )
}

export function generateAccountingReconnectHandoffNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  }
  throw new Error('Secure reconnect is unavailable in this browser. Reload and try again.')
}

export function buildMercuryAccountingReconnectUrl(input: {
  currentUrl: string
  locale: string
  provider: string
  clientId: string
  nonce: string
  mercuryOrigin?: string
}): string {
  const provider = input.provider.trim().toLowerCase()
  const clientId = input.clientId.trim()
  const nonce = input.nonce.trim()
  if (!/^[a-z0-9_-]{1,50}$/.test(provider) || !clientId || !nonce) {
    throw new Error('The reconnect request is incomplete. Calculate again to restart safely.')
  }

  const returnTarget = new URL(input.currentUrl)
  for (const key of SENSITIVE_OR_CALLBACK_QUERY_KEYS) returnTarget.searchParams.delete(key)
  returnTarget.searchParams.set('clientId', clientId)
  returnTarget.searchParams.set('accounting_resume', nonce)

  const locale = input.locale === 'fr' || input.locale === 'en' ? input.locale : 'nl'
  const mercury = new URL(input.mercuryOrigin ?? getMercuryUrl())
  const destination = new URL(`/${locale}/advisor/settings`, mercury.origin)
  destination.searchParams.set('tab', 'integrations')
  destination.searchParams.set('source', 'valuation_recovery')
  destination.searchParams.set('intent', 'reconnect')
  destination.searchParams.set('accounting_provider', provider)
  destination.searchParams.set('return_to', returnTarget.toString())
  return destination.toString()
}
