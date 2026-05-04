'use client'

/**
 * Advisor-only journey rail: deep-link to Mercury client detail with
 * `?focus=` while the valuation step stays in Venus.
 */

import { motion } from 'framer-motion'
import { Check, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { springDefault } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import { getMercuryUrl } from '@/utils/getMercuryUrl'

export interface AdvisorLifecycleStripProps {
  mercuryLocale: string
  clientId: string | null | undefined
  className?: string
}

export function AdvisorLifecycleStrip({
  mercuryLocale,
  clientId,
  className,
}: AdvisorLifecycleStripProps) {
  const t = useTranslations('calculator.advisorLifecycle')
  const trimmed = clientId?.trim()
  const baseMercury =
    trimmed != null && trimmed.length > 0
      ? `${getMercuryUrl().replace(/\/$/, '')}/${mercuryLocale}/advisor/clients/${trimmed}`
      : null

  if (!baseMercury) return null

  const segments: Array<{
    key: string
    label: string
    href?: string
    current?: boolean
  }> = [
    { key: 'business', label: t('basis'), href: `${baseMercury}?focus=business` },
    { key: 'profile', label: t('profile'), href: `${baseMercury}?focus=profile` },
    { key: 'valuation', label: t('valuation'), current: true },
    { key: 'listing', label: t('live'), href: `${baseMercury}?focus=listing` },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springDefault}
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-b border-foreground/[0.06] bg-foreground/[0.015] px-2 py-1.5',
        className
      )}
      role="navigation"
      aria-label={t('ariaLabel')}
    >
      {segments.map((seg, i) => (
        <div key={seg.key} className="flex items-center gap-1">
          {i > 0 ? (
            <span className="select-none text-foreground/20" aria-hidden>
              ·
            </span>
          ) : null}
          {seg.current ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                'bg-primary/12 text-primary ring-1 ring-primary/20'
              )}
            >
              <Check className="h-3 w-3 shrink-0" aria-hidden />
              {seg.label}
            </span>
          ) : seg.href ? (
            <a
              href={seg.href}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors',
                'text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35'
              )}
            >
              {seg.label}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
            </a>
          ) : (
            <span className="px-2 py-1 text-[11px] font-medium text-foreground/40">
              {seg.label}
            </span>
          )}
        </div>
      ))}
    </motion.div>
  )
}
