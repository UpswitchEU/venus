'use client'

import { Check } from 'lucide-react'
import {
  formatLegalFormLabel,
  formatRegistryCompanyLocation,
  formatRegistryNumber,
  getRegistryActivityDescription,
} from '@/utils/registryCompanyDisplay'
import { cn, safeString } from '../../utils'
import type { KBOCompany } from './EntitySearchTypes'

export interface KboConfirmedCardProps {
  company: KBOCompany
  activityCodeLabel: string
  /** When embedded under a search field that already shows the company name. */
  variant?: 'full' | 'detailsOnly'
  className?: string
}

export function KboConfirmedCard({
  company,
  activityCodeLabel,
  variant = 'full',
  className,
}: KboConfirmedCardProps) {
  const name = safeString(company.name)
  const { label: legalFormLabel, title: legalFormTitle } = formatLegalFormLabel(company.legalForm)
  const kboRaw = safeString(company.kboNumber)
  const kboFormatted = kboRaw ? formatRegistryNumber(kboRaw, company.countryCode ?? 'BE') : ''
  const location = formatRegistryCompanyLocation({
    address: company.address,
    postalCode: company.postalCode,
    city: company.city,
  })
  const activityCode = safeString(company.activityCode ?? company.naceCode)
  const activityDescription = getRegistryActivityDescription(company)

  const metaParts = [legalFormLabel, kboFormatted].filter(Boolean)
  const showName = variant === 'full' && Boolean(name)
  const regionLabel = name || undefined

  return (
    <div
      role="region"
      aria-label={regionLabel}
      className={cn('mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3', className)}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Check className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {showName && (
            <p className="break-words text-sm font-semibold leading-snug text-foreground">{name}</p>
          )}
          {metaParts.length > 0 && (
            <p className="text-xs text-foreground/50">
              {legalFormLabel && <span title={legalFormTitle}>{legalFormLabel}</span>}
              {legalFormLabel && kboFormatted && <span aria-hidden="true"> · </span>}
              {kboFormatted && <span className="font-mono">{kboFormatted}</span>}
            </p>
          )}
          {location && <p className="text-xs leading-relaxed text-foreground/40">{location}</p>}
          {(activityCode || activityDescription) && (
            <div className="space-y-1 pt-1">
              {activityCode && (
                <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary/70">
                  {activityCodeLabel} {activityCode}
                </span>
              )}
              {activityDescription && (
                <p className="break-words text-xs leading-relaxed text-foreground/50">
                  {activityDescription}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
