'use client'

/**
 * Hybrid Aurora Design System
 * Toast / Notification Component
 *
 * Animated notification toasts with Sage success color and semantic variants.
 * Uses Framer Motion for entrance/exit animations.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'
import { springDefault } from './motion'

// ─────────────────────────────────────────
// TOAST VARIANTS
// ─────────────────────────────────────────

const toastVariants = cva(
  [
    'relative flex items-start gap-3 w-full max-w-sm p-4 rounded-xl',
    'border shadow-lg backdrop-blur-md',
    'pointer-events-auto',
  ].join(' '),
  {
    variants: {
      variant: {
        success: ['bg-success/10 border-success/30', 'text-success'].join(' '),
        error: ['bg-destructive/10 border-destructive/30', 'text-destructive'].join(' '),
        warning: ['bg-secondary/10 border-secondary/30', 'text-secondary'].join(' '),
        info: ['bg-primary/10 border-primary/30', 'text-primary'].join(' '),
        default: ['bg-background/80 border-foreground/10', 'text-foreground'].join(' '),
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

// ─────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────

const slideVariants = {
  initial: {
    opacity: 0,
    x: 100,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: springDefault,
  },
  exit: {
    opacity: 0,
    x: 100,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
}

const popVariants = {
  initial: {
    opacity: 0,
    scale: 0.8,
    y: 20,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springDefault,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    y: 20,
    transition: { duration: 0.15 },
  },
}

// ─────────────────────────────────────────
// ICONS MAP
// ─────────────────────────────────────────

const iconMap = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  default: Info,
}

// ─────────────────────────────────────────
// TOAST ITEM
// ─────────────────────────────────────────

export interface ToastItemProps extends VariantProps<typeof toastVariants> {
  id: string
  title?: string
  description?: string
  onDismiss?: (id: string) => void
  animation?: 'slide' | 'pop'
  showIcon?: boolean
  duration?: number
  className?: string
}

export const ToastItem = React.forwardRef<HTMLDivElement, ToastItemProps>(
  (
    {
      id,
      variant = 'default',
      title,
      description,
      onDismiss,
      animation = 'slide',
      showIcon = true,
      duration = 5000,
      className,
    },
    ref
  ) => {
    const Icon = iconMap[variant || 'default']
    const animationVariants = animation === 'pop' ? popVariants : slideVariants

    React.useEffect(() => {
      if (duration > 0 && onDismiss) {
        const timer = setTimeout(() => onDismiss(id), duration)
        return () => clearTimeout(timer)
      }
    }, [id, duration, onDismiss])

    return (
      <motion.div
        ref={ref}
        layout
        variants={animationVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn(toastVariants({ variant }), className)}
      >
        {showIcon && (
          <div className="shrink-0 mt-0.5">
            <Icon className="w-5 h-5" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {title && <p className="text-sm font-semibold leading-tight">{title}</p>}
          {description && (
            <p className={cn('text-sm opacity-80', title && 'mt-1')}>{description}</p>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={() => onDismiss(id)}
            className={cn(
              'shrink-0 p-1 rounded-md transition-colors',
              'hover:bg-foreground/10 focus:outline-none focus:ring-2 focus:ring-foreground/20'
            )}
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    )
  }
)
ToastItem.displayName = 'ToastItem'

// ─────────────────────────────────────────
// TOAST CONTAINER
// ─────────────────────────────────────────

export interface ToastContainerProps {
  position?:
    | 'top-right'
    | 'top-left'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-center'
    | 'bottom-center'
  className?: string
  children?: React.ReactNode
}

const positionClasses = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  position = 'bottom-right',
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        'fixed z-[100] flex flex-col gap-3 pointer-events-none',
        positionClasses[position],
        className
      )}
    >
      <AnimatePresence mode="popLayout">{children}</AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────
// TOAST HOOK
// ─────────────────────────────────────────

export interface ToastData {
  id: string
  variant?: 'success' | 'error' | 'warning' | 'info' | 'default'
  title?: string
  description?: string
  duration?: number
  animation?: 'slide' | 'pop'
  showIcon?: boolean
}

type ToastState = {
  toasts: ToastData[]
}

type ToastAction =
  | { type: 'ADD'; toast: ToastData }
  | { type: 'DISMISS'; id: string }
  | { type: 'CLEAR' }

const toastReducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case 'ADD':
      return { toasts: [...state.toasts, action.toast] }
    case 'DISMISS':
      return { toasts: state.toasts.filter((t) => t.id !== action.id) }
    case 'CLEAR':
      return { toasts: [] }
    default:
      return state
  }
}

let toastCount = 0

export function useDesignSystemToast() {
  const [state, dispatch] = React.useReducer(toastReducer, { toasts: [] })

  const toast = React.useCallback((data: Omit<ToastData, 'id'>) => {
    const id = `toast-${++toastCount}`
    dispatch({ type: 'ADD', toast: { id, ...data } })
    return id
  }, [])

  const dismiss = React.useCallback((id: string) => {
    dispatch({ type: 'DISMISS', id })
  }, [])

  const clear = React.useCallback(() => {
    dispatch({ type: 'CLEAR' })
  }, [])

  const success = React.useCallback(
    (title: string, description?: string) => {
      return toast({ variant: 'success', title, description })
    },
    [toast]
  )

  const error = React.useCallback(
    (title: string, description?: string) => {
      return toast({ variant: 'error', title, description })
    },
    [toast]
  )

  const warning = React.useCallback(
    (title: string, description?: string) => {
      return toast({ variant: 'warning', title, description })
    },
    [toast]
  )

  const info = React.useCallback(
    (title: string, description?: string) => {
      return toast({ variant: 'info', title, description })
    },
    [toast]
  )

  return {
    toasts: state.toasts,
    toast,
    dismiss,
    clear,
    success,
    error,
    warning,
    info,
  }
}

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export { toastVariants }
export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>['variant']>
