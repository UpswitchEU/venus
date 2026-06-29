'use client'

import { motion } from 'framer-motion'
import { BadgeCheck, Building2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'
import { mercuryPath, openInNewTab } from '../agent-action-cards/shared'

interface ConnectAccountingInlineProps {
  /** True only when Titan says this plan can use live accounting integrations. */
  integrationsEnabled: boolean
  /** Display name of a Venus-importable provider (Bizzcontrol/Octopus) already connected, else null. */
  liveImportProviderName: string | null
  /** A batch has been pulled into the form this session → figures are accounting-verified. */
  imported: boolean
  /** A provider batch import is in flight. */
  importBusy: boolean
  /** The status pre-flight for the live import is opening. */
  openingImport: boolean
  /** Open the connected-provider import modal (reuses the live-accounting controller). */
  onImport: () => void | Promise<void>
}

/**
 * BET-316 — Door 1: "Pull it from my accounting software" at the financials step.
 *
 * The owner front-door for the autofill epic (BET-312). Sits beside Door 2
 * (`InviteAccountantInline`) and turns the blank revenue/EBITDA form into a
 * choice instead of a wall: pull the numbers straight from accounting (≤60s,
 * zero typing) rather than guess them — the exact friction that churns free
 * owners who "don't know their EBITDA".
 *
 * Three states, all on verified primitives — no new connect/OAuth UI:
 *   1. **Imported** — a batch was pulled this session → a green "verified from
 *      your accounting" provenance badge (the acceptance-criterion badge).
 *   2. **Connected** — a Venus pull-provider (Bizzcontrol/Octopus) is linked →
 *      one tap imports the last 3 years via the live-accounting controller.
 *   3. **Not connected** — opens the Mercury integrations settings (the same
 *      target the owner chat `IntegrationCard` uses) in a new tab; the figures
 *      then auto-fill on return (bootstrap prefill + the controller's
 *      visibility refetch), so the owner never leaves the funnel for good.
 *
 * Plan gate: owner Free sees the manual/invite/registry doors, but live
 * accounting import starts at owner Grow. The server remains authoritative;
 * this surface mirrors the plan flag so Free users do not get a dead-end
 * connect CTA.
 */
export function ConnectAccountingInline({
  integrationsEnabled,
  liveImportProviderName,
  imported,
  importBusy,
  openingImport,
  onImport,
}: ConnectAccountingInlineProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const ca = useTranslations('manualInput.connectAccounting')
  const locale = useLocale()

  if (!integrationsEnabled) {
    return (
      <div className="ml-8 space-y-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/50" />
            <p className="min-w-0 text-xs leading-snug text-foreground/70">
              {ca('upgradeDescription')}
            </p>
          </div>
          <AuroraButton
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => {
              openInNewTab(mercuryPath(locale, '/pricing', { tab: 'business-owners' }))
            }}
          >
            {ca('upgradeCta')}
          </AuroraButton>
        </div>
        <p className="text-[11px] leading-snug text-foreground/45">{ca('upgradeReassurance')}</p>
      </div>
    )
  }

  // State 1 — figures already pulled from accounting: show the provenance badge.
  if (imported) {
    const provider = liveImportProviderName ?? ca('genericProvider')
    return (
      <div className="ml-8 flex items-start gap-2.5 rounded-xl border border-success/20 bg-success/[0.04] px-3 py-2.5">
        <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-foreground">{ca('verifiedTitle')}</p>
          <p className="text-[11px] leading-snug text-foreground/70">
            {ca('verifiedBody', { provider })}
          </p>
        </div>
      </div>
    )
  }

  // State 2 — a Venus-importable provider is connected: one-tap pull.
  if (liveImportProviderName) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="ml-8 flex flex-wrap items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5"
      >
        <p className="min-w-0 flex-1 text-xs leading-snug text-foreground/75">
          {ca('descriptionConnected', { provider: liveImportProviderName })}
        </p>
        <AuroraButton
          type="button"
          variant="primary"
          size="sm"
          className="shrink-0"
          loading={openingImport || importBusy}
          loadingScreenReaderLabel={t('common.states.loading')}
          onClick={() => void onImport()}
          aria-label={mi('importFromAccountingAria', { provider: liveImportProviderName })}
        >
          {mi('importFromAccounting', { provider: liveImportProviderName })}
        </AuroraButton>
      </motion.div>
    )
  }

  // State 3 — nothing connected: send the owner to connect, then auto-fill on return.
  const openConnect = () => {
    openInNewTab(
      mercuryPath(locale, '/advisor/settings', {
        tab: 'integrations',
        source: 'venus_financials',
      })
    )
  }

  return (
    <div className="ml-8 space-y-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/50" />
          <p className="min-w-0 text-xs leading-snug text-foreground/70">
            {ca('descriptionDisconnected')}
          </p>
        </div>
        <AuroraButton
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={openConnect}
        >
          {ca('connectCta')}
        </AuroraButton>
      </div>
      <p className="text-[11px] leading-snug text-foreground/45">{ca('autofillReassurance')}</p>
    </div>
  )
}
