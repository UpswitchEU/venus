'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { Body, Caption } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'

export function ManualInputFallback({
  onManualInput,
  className,
}: {
  onManualInput: () => void
  className?: string
}) {
  const t = useTranslations('yukiIntegration')
  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-xl',
        'bg-foreground/[0.02] border border-dashed border-foreground/[0.10]',
        className
      )}
    >
      <div>
        <Body size="sm" className="font-medium mb-0.5">
          {t('noAccountingPackage')}
        </Body>
        <Caption className="text-foreground/40">{t('manualInputDesc')}</Caption>
      </div>
      <Button variant="secondary" size="sm" onClick={onManualInput}>
        {t('manualInput')}
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  )
}
