'use client'

import type { FormCardTone } from '@upswitch/ai-dock-shells'
import { cn } from '@/design-system/utils'
import type { FollowUpAction } from './ChatAssistantAdvisoryPreviewActions'

interface FollowUpButtonsProps {
  actions: FollowUpAction[]
  onSendFollowUp?: (content: string) => void
}

export function FollowUpButtons({ actions, onSendFollowUp }: FollowUpButtonsProps) {
  if (typeof onSendFollowUp !== 'function' || actions.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:gap-3">
      {actions.map((action) => (
        <button
          key={`${action.label}-${action.prompt}`}
          type="button"
          onClick={() => onSendFollowUp(action.prompt)}
          className={cn(
            'inline-flex min-h-11 items-center rounded-full px-3 transition-colors touch-manipulation sm:min-h-0 sm:px-0',
            action.primary
              ? 'font-medium text-primary/85 hover:text-primary'
              : 'text-foreground/55 hover:text-foreground/75'
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

export function advisoryTone({
  blocked,
  ready,
}: {
  blocked?: boolean
  ready?: boolean
}): FormCardTone {
  if (blocked) return 'warning'
  if (ready) return 'success'
  return 'idle'
}
