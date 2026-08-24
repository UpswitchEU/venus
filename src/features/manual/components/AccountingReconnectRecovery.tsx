'use client'

import { useLocale } from 'next-intl'
import { useMemo, useState } from 'react'
import { accountingAPI } from '@/services/api/accounting'
import {
  encodeSilverfinOAuthState,
  generateSilverfinOAuthNonce,
  persistSilverfinOAuthState,
} from '@/utils/silverfin-oauth-state'
import { bindAccountingReconnectOAuth } from '../utils/accountingReconnectResume'

function parseFirmId(value: string): string | null {
  const trimmed = value.trim()
  if (/^[A-Za-z0-9_-]{1,100}$/.test(trimmed)) return trimmed
  const match = trimmed.match(/(?:^|\/)f\/([A-Za-z0-9_-]{1,100})(?:\/|$)/i)
  return match?.[1] ?? null
}

function trustedSilverfinAuthorizationUrl(value: string): string {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const trusted =
    url.protocol === 'https:' &&
    (host === 'silverfin.com' ||
      host.endsWith('.silverfin.com') ||
      host === 'getsilverfin.com' ||
      host.endsWith('.getsilverfin.com'))
  if (!trusted) throw new Error('Silverfin returned an untrusted authorization address.')
  return url.toString()
}

export function AccountingReconnectRecovery({ context }: { context: Record<string, unknown> }) {
  const locale = useLocale()
  const provider = typeof context.provider === 'string' ? context.provider.trim().toLowerCase() : ''
  const clientId = typeof context.client_id === 'string' ? context.client_id.trim() : ''
  const [firmId, setFirmId] = useState(typeof context.firm_id === 'string' ? context.firm_id : '')
  const [minimized, setMinimized] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSync = useMemo(() => {
    if (typeof context.last_successful_sync_at !== 'string') return null
    const date = new Date(context.last_successful_sync_at)
    if (!Number.isFinite(date.getTime())) return null
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }, [context.last_successful_sync_at, locale])

  const copy =
    locale === 'nl'
      ? {
          title: 'Boekhouding opnieuw verbinden',
          body: 'De opgeslagen cijfers blijven zichtbaar, maar de berekening is gepauzeerd. Verbind opnieuw en synchroniseer het gekoppelde dossier om verder te gaan.',
          unavailable:
            '2025 wordt alleen geladen als die dossierperiode werkelijk in Silverfin bestaat. Anders blijft het laatste volledige jaar geselecteerd.',
          firm: 'Silverfin kantoor-ID of webadres',
          close: 'Later',
          reconnect: 'Opnieuw verbinden',
          lastSync: 'Laatste geslaagde synchronisatie',
        }
      : locale === 'fr'
        ? {
            title: 'Reconnecter la comptabilité',
            body: 'Les chiffres enregistrés restent visibles, mais le calcul est suspendu. Reconnectez et synchronisez le dossier lié pour continuer.',
            unavailable:
              '2025 ne sera chargé que si cette période existe réellement dans Silverfin. Sinon, la dernière année complète reste sélectionnée.',
            firm: 'Identifiant ou adresse Web Silverfin',
            close: 'Plus tard',
            reconnect: 'Reconnecter',
            lastSync: 'Dernière synchronisation réussie',
          }
        : {
            title: 'Reconnect accounting',
            body: 'Saved figures remain visible, but calculation is paused. Reconnect and synchronize the linked dossier to continue.',
            unavailable:
              '2025 loads only when that dossier period actually exists in Silverfin. Otherwise the latest complete year stays selected.',
            firm: 'Silverfin firm ID or web address',
            close: 'Later',
            reconnect: 'Reconnect',
            lastSync: 'Last successful sync',
          }

  const beginReconnect = async () => {
    if (provider !== 'silverfin') {
      const providerName = provider === 'exact' ? 'Exact' : provider === 'xero' ? 'Xero' : provider
      setError(
        `Reconnect ${providerName} from your Upswitch integrations settings, then return here.`
      )
      return
    }
    const resolvedFirmId = parseFirmId(firmId)
    if (!resolvedFirmId || !clientId) {
      setError(copy.firm)
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const redirectUrl = new URL(window.location.href)
      for (const key of ['code', 'state', 'firm_id']) redirectUrl.searchParams.delete(key)
      redirectUrl.searchParams.set('silverfin_connect', '1')
      const nonce = generateSilverfinOAuthNonce()
      persistSilverfinOAuthState(nonce)
      sessionStorage.setItem('upswitch_silverfin_oauth_in_progress', '1')
      const state = encodeSilverfinOAuthState(resolvedFirmId, nonce)
      const { authorization_url } = await accountingAPI.getSilverfinAuthorizeUrl(
        redirectUrl.toString(),
        state
      )
      if (
        !bindAccountingReconnectOAuth(sessionStorage, {
          provider,
          clientId,
          nonce,
        })
      ) {
        throw new Error('The saved reconnect request expired. Calculate again to restart safely.')
      }
      window.location.assign(trustedSilverfinAuthorizationUrl(authorization_url))
    } catch (cause) {
      sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
      setConnecting(false)
      setError(cause instanceof Error ? cause.message : 'Silverfin connection failed')
    }
  }

  if (minimized) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-[120] mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-background p-4 shadow-xl">
        <div>
          <p className="font-medium">{copy.title}</p>
          {lastSync ? (
            <p className="text-xs opacity-70">
              {copy.lastSync}: {lastSync}
            </p>
          ) : null}
        </div>
        <button
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => setMinimized(false)}
          type="button"
        >
          {copy.reconnect}
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-background p-6 shadow-2xl">
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="mt-3 text-sm leading-6 opacity-75">{copy.body}</p>
        <p className="mt-2 text-xs leading-5 opacity-65">{copy.unavailable}</p>
        {lastSync ? (
          <p className="mt-3 text-xs opacity-70">
            {copy.lastSync}: {lastSync}
          </p>
        ) : null}
        {provider === 'silverfin' ? (
          <label className="mt-5 block text-sm font-medium">
            {copy.firm}
            <input
              className="mt-2 w-full rounded-lg border bg-transparent px-3 py-2"
              value={firmId}
              onChange={(event) => setFirmId(event.target.value)}
              autoComplete="off"
            />
          </label>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-lg border px-4 py-2"
            type="button"
            onClick={() => {
              setMinimized(true)
            }}
          >
            {copy.close}
          </button>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            type="button"
            disabled={connecting}
            onClick={() => void beginReconnect()}
          >
            {connecting ? '…' : copy.reconnect}
          </button>
        </div>
      </div>
    </div>
  )
}
