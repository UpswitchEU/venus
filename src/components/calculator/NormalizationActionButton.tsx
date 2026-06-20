import type React from 'react'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'

interface NormalizationActionButtonProps {
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  onClick: () => void
  color: 'primary' | 'secondary' | 'success' | 'muted'
  size?: 'sm' | 'md'
}

export function NormalizationActionButton({
  icon: Icon,
  tooltip,
  onClick,
  color,
  size = 'md',
}: NormalizationActionButtonProps) {
  const colorClasses = {
    primary: 'hover:text-primary hover:bg-primary/10',
    secondary: 'hover:text-secondary hover:bg-secondary/10',
    success: 'hover:text-success hover:bg-success/10',
    muted: 'hover:text-foreground/70 hover:bg-foreground/10',
  }

  const sizeClasses = {
    sm: 'p-1 rounded-md',
    md: 'p-1.5 rounded-lg',
  }

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            onClick={(event) => {
              event.stopPropagation()
              onClick()
            }}
            className={cn(
              'text-foreground/40 transition-colors',
              sizeClasses[size],
              colorClasses[color]
            )}
          >
            <Icon className={iconSizeClasses[size]} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
