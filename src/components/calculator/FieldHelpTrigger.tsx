'use client'

/**
 * Field Help Trigger
 *
 * "?" icon button that opens the Chat Co-pilot drawer with field-specific context.
 */

import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipProvider } from '@/design-system'
import { cn } from '@/design-system/utils'

export interface FieldHelpContext {
  field: string
  label: string
  value?: number | string
  grootboekCode?: string
  category?: string
  hint?: string
  normalizationType?: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'other'
}

export interface FieldHelpTriggerProps {
  context: FieldHelpContext
  onTrigger?: (context: FieldHelpContext) => void
  className?: string
  size?: 'sm' | 'md'
}

export function FieldHelpTrigger({
  context,
  onTrigger,
  className,
  size = 'sm',
}: FieldHelpTriggerProps) {
  const t = useTranslations('fieldHelp')
  if (!onTrigger) return null

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onTrigger(context)
  }

  return (
    <Tooltip
      content={
        <div>
          <p>{t('askAbout', { label: context.label.toLowerCase() })}</p>
          {context.grootboekCode && (
            <p className="text-foreground/50 mt-0.5 font-mono text-[10px]">
              {t('ledgerAccount', { code: context.grootboekCode })}
            </p>
          )}
        </div>
      }
      side="top"
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-all',
          'text-foreground/30 hover:text-primary hover:bg-primary/10',
          'focus:outline-none focus:ring-2 focus:ring-primary/20',
          size === 'sm' ? 'w-5 h-5' : 'w-6 h-6',
          className
        )}
        aria-label={t('helpWith', { label: context.label })}
      >
        <HelpCircle className={cn(size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
      </button>
    </Tooltip>
  )
}

export default FieldHelpTrigger
