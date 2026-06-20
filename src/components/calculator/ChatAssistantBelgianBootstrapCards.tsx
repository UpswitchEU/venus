'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  buildBelgianBootstrapActions,
  type ChatAssistantTranslator,
} from './ChatAssistantAdvisoryPreviewActions'
import { FollowUpButtons } from './ChatAssistantAdvisoryPreviewCardParts'
import type { BelgianCompanyBootstrap } from './ChatAssistantTypes'

interface ChatAssistantBelgianBootstrapCardsProps {
  bootstraps: BelgianCompanyBootstrap[]
  currencyLocale: string
  onSendFollowUp?: (content: string) => void
}

function isBootstrapBlocked(bootstrap: BelgianCompanyBootstrap) {
  return bootstrap.status === 'blocked' || bootstrap.status === 'failed'
}

function formatBelgianEuros(value: number | null | undefined, currencyLocale: string) {
  return value != null && Number.isFinite(Number(value))
    ? `€${Math.round(Number(value)).toLocaleString(currencyLocale)}`
    : null
}

function bootstrapSummaryBits(
  bootstrap: BelgianCompanyBootstrap,
  ca: ChatAssistantTranslator,
  currencyLocale: string
) {
  const bits: string[] = []
  const blocked = isBootstrapBlocked(bootstrap)
  if (bootstrap.identity?.legalName) bits.push(bootstrap.identity.legalName)
  if (bootstrap.identity?.kboNumber) bits.push(bootstrap.identity.kboNumber)
  if (bootstrap.identity?.city) bits.push(bootstrap.identity.city)
  if (!blocked && bootstrap.filingSummary?.filingYear) {
    bits.push(
      ca('proposalCards.belgianBootstrap.filingYear', {
        year: bootstrap.filingSummary.filingYear,
      })
    )
  }

  const revenue = formatBelgianEuros(bootstrap.filingSummary?.revenue, currencyLocale)
  const ebitda = formatBelgianEuros(bootstrap.filingSummary?.ebitda, currencyLocale)
  const equity = formatBelgianEuros(bootstrap.valuationPreview?.equityMid, currencyLocale)
  if (revenue) bits.push(`${ca('proposalCards.valuation.labelRevenue')} ${revenue}`)
  if (ebitda) bits.push(`EBITDA ${ebitda}`)
  if (equity) bits.push(`${ca('proposalCards.belgianBootstrap.equityPreview')} ${equity}`)
  return bits
}

function BootstrapIdentityCard({
  bootstrap,
  ca,
}: {
  bootstrap: BelgianCompanyBootstrap
  ca: ChatAssistantTranslator
}) {
  return (
    <div className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground/80 truncate">
          {bootstrap.identity?.legalName ??
            bootstrap.identity?.kboNumber ??
            ca('proposalCards.belgianBootstrap.identityTitle')}
        </span>
        {bootstrap.identity?.isActive != null && (
          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
            {bootstrap.identity.isActive
              ? ca('proposalCards.belgianBootstrap.active')
              : ca('proposalCards.belgianBootstrap.inactive')}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-foreground/55">
        {bootstrap.identity?.kboNumber && <span>{bootstrap.identity.kboNumber}</span>}
        {bootstrap.identity?.legalForm && <span>{bootstrap.identity.legalForm}</span>}
        {bootstrap.identity?.city && <span>{bootstrap.identity.city}</span>}
        {bootstrap.identity?.naceDescription && <span>{bootstrap.identity.naceDescription}</span>}
      </div>
    </div>
  )
}

function BootstrapDetails({
  bootstrap,
  ca,
  currencyLocale,
}: {
  bootstrap: BelgianCompanyBootstrap
  ca: ChatAssistantTranslator
  currencyLocale: string
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <BootstrapIdentityCard bootstrap={bootstrap} ca={ca} />
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
          <p className="text-[10px] font-medium uppercase text-foreground/35">
            {ca('proposalCards.belgianBootstrap.filingTitle')}
          </p>
          <p className="mt-0.5 text-foreground/65 leading-snug">
            {bootstrap.filingSummary?.filingYear
              ? ca('proposalCards.belgianBootstrap.filingYear', {
                  year: bootstrap.filingSummary.filingYear,
                })
              : ca('proposalCards.belgianBootstrap.noFiling')}
          </p>
          {bootstrap.filingSummary?.dataHealthMessage && (
            <p className="mt-0.5 text-[10px] text-foreground/45">
              {bootstrap.filingSummary.dataHealthMessage}
            </p>
          )}
        </div>
        <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
          <p className="text-[10px] font-medium uppercase text-foreground/35">
            {ca('proposalCards.belgianBootstrap.benchmarkTitle')}
          </p>
          <p className="mt-0.5 text-foreground/65 leading-snug">
            {bootstrap.benchmark?.businessTypeTitle ??
              ca('proposalCards.belgianBootstrap.noBenchmark')}
          </p>
          {bootstrap.benchmark?.evEbitdaMedian != null && (
            <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
              {Number(bootstrap.benchmark.evEbitdaMedian).toFixed(1)}x
            </p>
          )}
        </div>
        <div className="rounded-md bg-foreground/[0.03] px-2 py-1.5 text-xs">
          <p className="text-[10px] font-medium uppercase text-foreground/35">
            {ca('proposalCards.belgianBootstrap.previewTitle')}
          </p>
          <p className="mt-0.5 text-foreground/65 leading-snug">
            {formatBelgianEuros(bootstrap.valuationPreview?.equityMid, currencyLocale) ??
              ca('proposalCards.belgianBootstrap.noPreview')}
          </p>
          {bootstrap.valuationPreview?.ebitdaYear && (
            <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
              EBITDA {bootstrap.valuationPreview.ebitdaYear}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatAssistantBelgianBootstrapCards({
  bootstraps,
  currencyLocale,
  onSendFollowUp,
}: ChatAssistantBelgianBootstrapCardsProps) {
  const ca = useTranslations('chatAssistant')

  if (bootstraps.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
      {bootstraps.map((bootstrap) => {
        const blocked = isBootstrapBlocked(bootstrap)
        const summaryBits = bootstrapSummaryBits(bootstrap, ca, currencyLocale)
        const followUpActions = buildBelgianBootstrapActions(bootstrap, ca)

        return (
          <motion.div
            key={bootstrap.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="text-sm leading-relaxed"
          >
            <p className="text-foreground">
              {blocked
                ? ca('proposalCards.belgianBootstrap.titleBlocked')
                : ca('proposalCards.belgianBootstrap.titleReady')}
            </p>
            {bootstrap.message && (
              <p className="text-foreground/55 text-xs mt-0.5">{bootstrap.message}</p>
            )}
            {summaryBits.length > 0 && (
              <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
            )}
            {!blocked && (
              <BootstrapDetails bootstrap={bootstrap} ca={ca} currencyLocale={currencyLocale} />
            )}
            <FollowUpButtons actions={followUpActions} onSendFollowUp={onSendFollowUp} />
          </motion.div>
        )
      })}
    </div>
  )
}
