import { TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React from 'react'

export const ValuationEmptyState: React.FC = () => {
  const t = useTranslations('valuationEmptyState')
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-background">
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-foreground/10 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
        <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{t('reportsWillAppearHere')}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">
        {t('startConversationDesc')}
      </p>
    </div>
  )
}
