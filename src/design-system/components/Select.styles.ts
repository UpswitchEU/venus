import { cva } from 'class-variance-authority'
import { springDefault } from './motion'

export const dropdownVariants = {
  hidden: {
    opacity: 0,
    y: -8,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springDefault,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: 0.15 },
  },
}

export const selectTriggerVariants = cva(
  [
    'relative w-full flex items-center justify-between',
    'border rounded-xl shadow-sm transition-all duration-200',
    'bg-foreground/[0.04]',
    'cursor-pointer select-none',
  ],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        error: 'border-destructive',
        disabled: 'border-foreground/[0.05] opacity-60 cursor-not-allowed',
      },
      size: {
        sm: 'h-14 px-4',
        md: 'h-16 px-4',
        lg: 'h-[72px] px-4',
      },
    },
    defaultVariants: {
      state: 'default',
      size: 'md',
    },
  }
)

export const selectLabelVariants = cva(
  [
    'absolute left-4 transition-all duration-200 ease-in-out pointer-events-none',
    'text-foreground/60',
  ],
  {
    variants: {
      state: {
        idle: 'top-1/2 -translate-y-1/2 text-base',
        floated: 'top-2 translate-y-0 text-xs font-medium',
      },
      error: {
        true: 'text-destructive',
        false: '',
      },
    },
    defaultVariants: {
      state: 'idle',
      error: false,
    },
  }
)

export const selectDropdownClassName = [
  'fixed z-[9999]',
  'bg-background border border-foreground/[0.10] rounded-xl',
  'shadow-2xl shadow-black/20',
  'overflow-hidden',
]

export const selectSearchInputClassName = [
  'w-full h-10 pl-9 pr-4 text-sm',
  'bg-foreground/[0.04] border border-foreground/[0.08] rounded-lg',
  'text-foreground placeholder:text-foreground/40',
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
]
