'use client'

import { useTranslations } from 'next-intl'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { Badge } from '@/design-system/components/Badge'
import { GlassCard } from '@/design-system/components/GlassCard'
import { Body, Caption, Heading, Mono } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'
import type { MappingRow } from './yukiIntegrationTypes'

export function MappingTable({
  mappings,
  className,
}: {
  mappings: MappingRow[]
  className?: string
}) {
  const t = useTranslations('yukiIntegration')
  return (
    <GlassCard className={cn('overflow-hidden', className)}>
      <div className="px-6 py-4 border-b border-foreground/[0.06]">
        <Heading level={3} className="text-lg">
          {t('mappingTitle')}
        </Heading>
        <Caption className="text-foreground/50">
          {t('accountsMatched', { count: mappings.length })}
        </Caption>
      </div>

      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-foreground/[0.06]">
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('yukiCode')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('description')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('category')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('mappedTo')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.04]">
            {mappings.map((mapping) => (
              <tr
                key={`${mapping.yukiCode}:${mapping.mappedTo}`}
                className="hover:bg-foreground/[0.02] transition-colors"
              >
                <td className="px-6 py-3">
                  <Mono size="sm" className="text-foreground/70">
                    {mapping.yukiCode}
                  </Mono>
                </td>
                <td
                  className="px-6 py-3 align-top min-w-[12rem] max-w-xl"
                  title={mapping.yukiDescription}
                >
                  <Body size="sm" className={cn('text-foreground/70', LEDGER_LABEL_TEXT_CLASSES)}>
                    {mapping.yukiDescription}
                  </Body>
                </td>
                <td className="px-6 py-3">
                  <Badge
                    variant={
                      mapping.category === 'revenue'
                        ? 'primary'
                        : mapping.category === 'expense'
                          ? 'accent'
                          : 'neutral'
                    }
                    size="sm"
                  >
                    {mapping.category === 'revenue'
                      ? t('revenue')
                      : mapping.category === 'expense'
                        ? t('expense')
                        : mapping.category === 'asset'
                          ? t('asset')
                          : t('liability')}
                  </Badge>
                </td>
                <td className="px-6 py-3">
                  <Body size="sm" className="text-foreground">
                    {mapping.mappedTo}
                  </Body>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
