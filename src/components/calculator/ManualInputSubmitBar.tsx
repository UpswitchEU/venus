'use client'

import { useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'

interface ManualInputSubmitBarProps {
  canSave: boolean
  canSaveReason?: string
  canSubmit: boolean
  hasBusinessType: boolean
  hasCompanyInfo: boolean
  isCalculating: boolean
}

export function ManualInputSubmitBar({
  canSave,
  canSaveReason,
  canSubmit,
  hasBusinessType,
  hasCompanyInfo,
  isCalculating,
}: ManualInputSubmitBarProps) {
  const mi = useTranslations('manualInput')

  return (
    <div className="sticky bottom-0 z-20 shrink-0 px-6 py-4 -mx-6 -mb-6 border-t border-foreground/[0.06] bg-background">
      <AuroraButton
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={isCalculating}
        disabled={!canSubmit}
      >
        {isCalculating ? mi('calculating') : mi('calculateEstimate')}
      </AuroraButton>
      {!canSubmit && (
        <p className="text-center text-xs text-foreground/40 mt-2">
          {!canSave
            ? canSaveReason
            : !hasCompanyInfo
              ? mi('validation.enterCompanyName')
              : !hasBusinessType
                ? mi('validation.selectBusinessType')
                : mi('validation.enterFinancials')}
        </p>
      )}
    </div>
  )
}
