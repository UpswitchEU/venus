import { Check } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import type { SelectOption } from './Select.types'

const HOVER_DEBOUNCE_MS = 5000

interface SelectOptionItemProps {
  option: SelectOption
  isSelected: boolean
  isFocused: boolean
  dataIndex?: number
  onSelect: (value: string) => void
  onDisabledOptionInteract?: (value: string, action: 'click' | 'hover') => void
}

export const SelectOptionItem: React.FC<SelectOptionItemProps> = ({
  option,
  isSelected,
  isFocused,
  dataIndex,
  onSelect,
  onDisabledOptionInteract,
}) => {
  const lastHoverRef = React.useRef<Record<string, number>>({})
  const descId = React.useId()

  const handleClick = () => {
    if (option.disabled) {
      onDisabledOptionInteract?.(option.value, 'click')
    } else {
      onSelect(option.value)
    }
  }

  const handleMouseEnter = () => {
    if (option.disabled && onDisabledOptionInteract) {
      const now = Date.now()
      const last = lastHoverRef.current[option.value] ?? 0
      if (now - last >= HOVER_DEBOUNCE_MS) {
        lastHoverRef.current[option.value] = now
        onDisabledOptionInteract(option.value, 'hover')
      }
    }
  }

  const hasDescription = option.disabled && option.description

  return (
    <div
      data-index={dataIndex}
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.disabled}
      aria-describedby={hasDescription ? descId : undefined}
      className={cn(
        'px-4 py-2.5 cursor-pointer transition-colors',
        'flex items-center gap-3',
        option.disabled && 'opacity-50 cursor-not-allowed',
        !option.disabled && (isFocused || isSelected) && 'bg-primary/10',
        !option.disabled && !isFocused && !isSelected && 'hover:bg-foreground/[0.04]'
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {option.icon && <span className="shrink-0 text-foreground/60">{option.icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">{option.label}</div>
        {option.description && (
          <div id={descId} className="text-xs text-foreground/50 truncate">
            {option.description}
          </div>
        )}
      </div>
      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
    </div>
  )
}
