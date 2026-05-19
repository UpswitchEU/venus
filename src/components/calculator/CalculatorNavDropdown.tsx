import { AnimatePresence, motion } from 'framer-motion'
import React, { useId, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'

interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  variant?: 'default' | 'glass'
  keepOpen?: boolean
}

interface DropdownTriggerProps {
  onClick?: (event: React.MouseEvent) => void
  'aria-expanded'?: boolean
  'aria-controls'?: string
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'start',
  variant = 'default',
  keepOpen = false,
}) => {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  return (
    <div className="relative" ref={dropdownRef}>
      {React.isValidElement(trigger) ? (
        React.cloneElement(trigger as React.ReactElement<DropdownTriggerProps>, {
          onClick: (event: React.MouseEvent) => {
            trigger.props.onClick?.(event)
            if (!event.defaultPrevented) setOpen((current) => !current)
          },
          'aria-expanded': open,
          'aria-controls': menuId,
        })
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen((current) => !current)
            }
          }}
          aria-expanded={open}
          aria-controls={menuId}
        >
          {trigger}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
            className={cn(
              'absolute z-50 mt-2 min-w-[200px] rounded-xl border border-foreground/[0.08]',
              'backdrop-blur-xl shadow-xl',
              variant === 'glass' ? 'bg-background/80' : 'bg-background/95',
              align === 'end' && 'right-0',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              align === 'start' && 'left-0'
            )}
            onClick={keepOpen ? undefined : () => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
