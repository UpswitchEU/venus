'use client'

import { useLocale } from 'next-intl'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { accountingAPI } from '@/services/api/accounting'
import {
  encodeSilverfinOAuthState,
  generateSilverfinOAuthNonce,
  persistSilverfinOAuthState,
} from '@/utils/silverfin-oauth-state'
import {
  accountingReconnectProviderName,
  buildMercuryAccountingReconnectUrl,
  generateAccountingReconnectHandoffNonce,
} from '../utils/accountingReconnectHandoff'
import {
  bindAccountingReconnectHandoff,
  bindAccountingReconnectOAuth,
  markAccountingReconnectFailed,
} from '../utils/accountingReconnectResume'

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
  const titleId = useId()
  const descriptionId = useId()
  const provider = typeof context.provider === 'string' ? context.provider.trim().toLowerCase() : ''
  const clientId = typeof context.client_id === 'string' ? context.client_id.trim() : ''
  const phase =
    typeof context.recovery_phase === 'string' ? context.recovery_phase : 'reconnect_required'
  const recoveryInProgress = ['oauth_pending', 'handoff_pending', 'resyncing'].includes(phase)
  const providerName = accountingReconnectProviderName(provider)
  const contextFirmId = typeof context.firm_id === 'string' ? context.firm_id : ''
  const [firmId, setFirmId] = useState(contextFirmId)
  const [minimized, setMinimized] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const reconnectInFlightRef = useRef(false)
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
          unavailableGeneric: `Een nieuw boekjaar wordt alleen geladen als het gekoppelde dossier in ${providerName} volledige omzet- en EBITDA-cijfers bevat. Anders blijft het laatste volledige jaar geselecteerd.`,
          handoff: `We openen ${providerName} veilig in Upswitch. Na het verbinden keert u automatisch terug naar dit rapport; synchronisatie en berekening gaan hier verder.`,
          firm: 'Silverfin kantoor-ID of webadres',
          close: 'Later',
          reconnect: 'Opnieuw verbinden',
          lastSync: 'Laatste geslaagde synchronisatie',
          refreshingTitle: `${providerName} wordt bijgewerkt`,
          refreshingBody:
            'De verbinding is hersteld. We synchroniseren het gekoppelde dossier, controleren de volledige boekjaren en hervatten de berekening automatisch.',
          refreshing: 'Dossier bijwerken…',
          incomplete:
            'De herstelactie is onvolledig. Start de berekening opnieuw om veilig te herbeginnen.',
          expired:
            'De herstelactie is verlopen. Start de berekening opnieuw om veilig te herbeginnen.',
          failed: `Verbinden met ${providerName} is mislukt`,
        }
      : locale === 'fr'
        ? {
            title: 'Reconnecter la comptabilité',
            body: 'Les chiffres enregistrés restent visibles, mais le calcul est suspendu. Reconnectez et synchronisez le dossier lié pour continuer.',
            unavailable:
              '2025 ne sera chargé que si cette période existe réellement dans Silverfin. Sinon, la dernière année complète reste sélectionnée.',
            unavailableGeneric: `Un nouvel exercice n’est chargé que si le dossier lié dans ${providerName} contient un chiffre d’affaires et un EBITDA complets. Sinon, la dernière année complète reste sélectionnée.`,
            handoff: `Nous ouvrons ${providerName} de manière sécurisée dans Upswitch. Après la reconnexion, vous revenez automatiquement à ce rapport ; la synchronisation et le calcul reprennent ici.`,
            firm: 'Identifiant ou adresse Web Silverfin',
            close: 'Plus tard',
            reconnect: 'Reconnecter',
            lastSync: 'Dernière synchronisation réussie',
            refreshingTitle: `Mise à jour de ${providerName}`,
            refreshingBody:
              'La connexion est rétablie. Nous synchronisons le dossier lié, vérifions les exercices complets et reprenons automatiquement le calcul.',
            refreshing: 'Mise à jour du dossier…',
            incomplete:
              'La récupération est incomplète. Relancez le calcul pour recommencer en toute sécurité.',
            expired:
              'La récupération a expiré. Relancez le calcul pour recommencer en toute sécurité.',
            failed: `La connexion à ${providerName} a échoué`,
          }
        : {
            title: 'Reconnect accounting',
            body: 'Saved figures remain visible, but calculation is paused. Reconnect and synchronize the linked dossier to continue.',
            unavailable:
              '2025 loads only when that dossier period actually exists in Silverfin. Otherwise the latest complete year stays selected.',
            unavailableGeneric: `A newer year loads only when the linked ${providerName} dossier contains a complete revenue and EBITDA pair. Otherwise the latest complete year stays selected.`,
            handoff: `We’ll open ${providerName} securely in Upswitch. After reconnecting, you return to this report automatically; sync and calculation continue here.`,
            firm: 'Silverfin firm ID or web address',
            close: 'Later',
            reconnect: 'Reconnect',
            lastSync: 'Last successful sync',
            refreshingTitle: `Refreshing ${providerName}`,
            refreshingBody:
              'The connection is restored. We are syncing the linked dossier, checking complete fiscal years, and will resume calculation automatically.',
            refreshing: 'Refreshing dossier…',
            incomplete: 'The recovery is incomplete. Calculate again to restart safely.',
            expired: 'The recovery expired. Calculate again to restart safely.',
            failed: `${providerName} connection failed`,
          }

  useEffect(() => {
    setError(typeof context.failure === 'string' ? copy.failed : null)
  }, [context.failure, copy.failed])

  useEffect(() => {
    if (!contextFirmId) return
    setFirmId((current) => current || contextFirmId)
  }, [contextFirmId])

  useEffect(() => {
    if (minimized) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.offsetParent !== null)
    const initial = focusable()[0] ?? dialog
    initial?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMinimized(true)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [minimized])

  const beginReconnect = async () => {
    if (reconnectInFlightRef.current) return
    if (!clientId || !provider) {
      setError(copy.incomplete)
      return
    }
    reconnectInFlightRef.current = true
    setConnecting(true)
    setError(null)
    try {
      if (provider !== 'silverfin') {
        const nonce = generateAccountingReconnectHandoffNonce()
        if (
          !bindAccountingReconnectHandoff(sessionStorage, {
            provider,
            clientId,
            nonce,
          })
        ) {
          throw new Error(copy.expired)
        }
        const handoffUrl = buildMercuryAccountingReconnectUrl({
          currentUrl: window.location.href,
          locale,
          provider,
          clientId,
          nonce,
        })
        window.location.assign(handoffUrl)
        return
      }

      const resolvedFirmId = parseFirmId(firmId)
      if (!resolvedFirmId) throw new Error(copy.firm)
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
        throw new Error(copy.expired)
      }
      window.location.assign(trustedSilverfinAuthorizationUrl(authorization_url))
    } catch (cause) {
      sessionStorage.removeItem('upswitch_silverfin_oauth_in_progress')
      const safeFailure =
        cause instanceof Error && [copy.incomplete, copy.expired, copy.firm].includes(cause.message)
          ? cause.message
          : copy.failed
      markAccountingReconnectFailed(sessionStorage, {
        provider,
        clientId,
        failure: safeFailure,
      })
      reconnectInFlightRef.current = false
      setConnecting(false)
      setError(safeFailure)
    }
  }

  if (minimized) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-[120] mx-auto flex max-w-3xl flex-col items-stretch gap-3 rounded-xl border border-amber-500/30 bg-background p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-medium">{copy.title}</p>
          {lastSync ? (
            <p className="text-xs opacity-70">
              {copy.lastSync}: {lastSync}
            </p>
          ) : null}
        </div>
        <button
          className="shrink-0 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-primary-foreground"
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
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="grid max-h-[min(90dvh,42rem)] w-full max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl bg-background shadow-2xl outline-none"
      >
        <header className="border-b px-5 py-5 sm:px-6">
          <h2 className="min-h-7 text-xl font-semibold" id={titleId}>
            {recoveryInProgress ? copy.refreshingTitle : copy.title}
          </h2>
          <p className="mt-2 min-h-12 text-sm leading-6 opacity-75" id={descriptionId}>
            {recoveryInProgress ? copy.refreshingBody : copy.body}
          </p>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
          <p className="text-xs leading-5 opacity-65">
            {provider === 'silverfin' ? copy.unavailable : copy.unavailableGeneric}
          </p>
          {provider !== 'silverfin' && !recoveryInProgress ? (
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 opacity-80">
              {copy.handoff}
            </p>
          ) : null}
          {lastSync ? (
            <p className="mt-3 text-xs opacity-70">
              {copy.lastSync}: {lastSync}
            </p>
          ) : null}
          {provider === 'silverfin' && !recoveryInProgress ? (
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
          <p className="mt-3 min-h-5 text-sm text-destructive" role="alert" aria-live="polite">
            {error ?? ''}
          </p>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t bg-background/95 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            className="min-w-28 whitespace-nowrap rounded-lg border px-4 py-2"
            type="button"
            onClick={() => {
              setMinimized(true)
            }}
          >
            {copy.close}
          </button>
          <button
            className="min-w-44 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            type="button"
            disabled={connecting || recoveryInProgress}
            onClick={() => void beginReconnect()}
            aria-live="polite"
            aria-busy={connecting || recoveryInProgress}
          >
            {connecting || recoveryInProgress ? copy.refreshing : copy.reconnect}
          </button>
        </footer>
      </div>
    </div>
  )
}
