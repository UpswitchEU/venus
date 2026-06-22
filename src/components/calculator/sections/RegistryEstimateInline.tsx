'use client'

import { motion } from 'framer-motion'
import { FileSearch, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import {
  fetchProvisionalBand,
  type ProvisionalValuationBand,
} from '@/services/api/provisionalValuation'

interface RegistryEstimateInlineProps {
  /** The selected company (KBO/KVK shape); registry id + country are read defensively. */
  company: unknown
  /** Country fallback (form country) when the company row omits one. */
  fallbackCountry: string | null
}

type Status = 'idle' | 'loading' | 'done'

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/** Pull the registry country + number off a loosely-typed selected-company row. */
function readCompanyRegistry(company: unknown): { country: string | null; number: string | null } {
  if (!company || typeof company !== 'object') return { country: null, number: null }
  const record = company as Record<string, unknown>
  return {
    country: readString(record, 'countryCode'),
    number: readString(record, 'kboNumber') ?? readString(record, 'vatNumber'),
  }
}

function formatBand(band: { low: number; high: number; currency: string }, locale: string): string {
  const format = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: band.currency || 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)
  return `${format(band.low)} – ${format(band.high)}`
}

/**
 * BET-318 — Door 3: "I don't know — estimate it for me" at the financials step.
 *
 * The "blank is never a dead end" door. An owner who doesn't know their revenue
 * /EBITDA taps this for a registry-derived provisional band (the Delphi-enriched
 * corpus, via `GET /api/valuations/provisional/:country/:registryNumber`), then
 * gets nudged to Door 1/2 above for a precise number. The fetch never throws and
 * `available:false` is a normal outcome — so the door always resolves to either
 * a ballpark band or a graceful precision-upsell, never an error.
 */
export function RegistryEstimateInline({ company, fallbackCountry }: RegistryEstimateInlineProps) {
  const re = useTranslations('manualInput.registryEstimate')
  const locale = useLocale()
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ProvisionalValuationBand | null>(null)

  const registry = readCompanyRegistry(company)
  const country = registry.country ?? (fallbackCountry?.trim() || null)
  const registryNumber = registry.number

  // No registry id → nothing to estimate from; Door 1/2 cover this owner.
  if (!country || !registryNumber) return null

  const run = async () => {
    setStatus('loading')
    const band = await fetchProvisionalBand(country, registryNumber)
    setResult(band)
    setStatus('done')
  }

  if (status === 'idle') {
    return (
      <div className="ml-8 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/50" />
          <p className="min-w-0 text-xs leading-snug text-foreground/70">{re('prompt')}</p>
        </div>
        <AuroraButton
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => void run()}
        >
          {re('cta')}
        </AuroraButton>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="ml-8 flex items-center gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />
        <p className="text-xs text-foreground/70">{re('loading')}</p>
      </div>
    )
  }

  const band = result?.available ? result.band : null
  if (band) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="ml-8 space-y-1.5 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-3"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs font-medium text-foreground">{re('bandTitle')}</p>
        </div>
        <p className="font-mono text-sm tabular-nums text-foreground">{formatBand(band, locale)}</p>
        <p className="text-[11px] leading-snug text-foreground/60">{re('bandCaveat')}</p>
      </motion.div>
    )
  }

  return (
    <div className="ml-8 space-y-1 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-3">
      <p className="text-xs font-medium text-foreground">{re('unavailableTitle')}</p>
      <p className="text-[11px] leading-snug text-foreground/65">{re('unavailableBody')}</p>
    </div>
  )
}
