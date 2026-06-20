'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { STARTUP_STUDIO_SECTORS } from '@/features/startup-studio/utils/studioDeepLinkContract'
import {
  STARTUP_SECTOR_EXIT_MULTIPLES,
  type StartupSector,
} from '@/store/manual/useStartupValuationStore'

interface CompanySectorChipProps {
  sector: StartupSector
  onChange: (next: StartupSector) => void
  appliedMultiple?: number | null
}

/**
 * Render the canonical engine sector + the exit multiple it drives.
 * Founders never had a way to see what sector the NACE inference picked,
 * which made engine assumptions invisible when the sector default mattered.
 */
export function CompanySectorChip({ sector, onChange, appliedMultiple }: CompanySectorChipProps) {
  const t = useTranslations('startupStudio.companyCard')
  const tSector = useTranslations('startupStudio.narrative.sectorLabels')
  const [editing, setEditing] = useState(false)
  const sectorLabel = tSector(sector)
  const sectorDefault = STARTUP_SECTOR_EXIT_MULTIPLES[sector]
  const isOverridden = appliedMultiple != null && Math.abs(appliedMultiple - sectorDefault) > 0.01

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-[12px] text-foreground/75">
        <span className="font-medium uppercase tracking-wide text-foreground/55 text-[10px]">
          {t('sectorChipLabel')}
        </span>
        <span className="font-semibold text-foreground">{sectorLabel}</span>
        {isOverridden && (
          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground/55">
            override
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto min-h-11 rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-[11px] font-medium text-foreground/75 transition hover:border-primary/50 hover:text-primary sm:min-h-0 sm:px-2 sm:py-0.5"
        >
          {t('sectorChipChange')}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/[0.03] p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
        {t('sectorChipPickHeading')}
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {STARTUP_STUDIO_SECTORS.map((opt) => {
          const isSelected = opt === sector
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setEditing(false)
              }}
              className={[
                'min-h-11 rounded-md px-3 py-2 text-[11px] font-medium transition sm:min-h-0 sm:px-2 sm:py-1.5',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-foreground/15 bg-background text-foreground/75 hover:border-primary/50 hover:text-primary',
              ].join(' ')}
            >
              {tSector(opt)}{' '}
              <span className="opacity-65 tabular-nums">
                {STARTUP_SECTOR_EXIT_MULTIPLES[opt]}&times;
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-foreground/55">{t('sectorChipPickHint')}</p>
    </div>
  )
}
