'use client'

import { useTranslations } from 'next-intl'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { ModalFooter } from '@/design-system/components/Modal'
import type { NormalizationPrimaryTab } from './UnifiedNormalizationModalHeader'

interface UnifiedNormalizationModalFooterProps {
  primaryTab: NormalizationPrimaryTab
  filteredNormalizationsCount: number
  normalizationsCount: number
  yearFilter: number | null
  taxLatencyCount: number
  onClose: () => void
}

export function UnifiedNormalizationModalFooter({
  primaryTab,
  filteredNormalizationsCount,
  normalizationsCount,
  yearFilter,
  taxLatencyCount,
  onClose,
}: UnifiedNormalizationModalFooterProps) {
  const nh = useTranslations('normalizationHub')
  const tCommon = useTranslations('common.actions')
  const tTax = useTranslations('taxLatency')
  const summary =
    primaryTab === 'ebitda'
      ? nh('normalizationsCountOf', {
          filtered: filteredNormalizationsCount,
          total: normalizationsCount,
        }) + (yearFilter ? ` · ${tCommon('filter')}: ${yearFilter}` : '')
      : taxLatencyCount > 0
        ? `${nh('primaryTabTaxLatencies')} · ${tTax('itemCount', { count: taxLatencyCount })}`
        : nh('primaryTabTaxLatencies')

  return (
    <ModalFooter className="border-t border-foreground/[0.06] px-6 py-4 shrink-0">
      <div className="flex items-center justify-between w-full">
        <p className="text-xs text-foreground/50">{summary}</p>
        <Button onClick={onClose}>{tCommon('close')}</Button>
      </div>
    </ModalFooter>
  )
}
