import { cva } from 'class-variance-authority'

export const searchContainerVariants = cva('relative w-full transition-all duration-200', {
  variants: {
    size: {
      sm: '',
      md: '',
      lg: '',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export const searchGroupVariants = cva(
  ['relative border rounded-xl shadow-sm transition-all duration-200', 'bg-foreground/[0.04]'],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        success: 'border-primary ring-2 ring-primary/20',
        error: 'border-destructive',
        disabled: 'border-foreground/[0.05] opacity-60 cursor-not-allowed',
      },
      size: {
        sm: '',
        md: '',
        lg: '',
      },
    },
    defaultVariants: {
      state: 'default',
      size: 'md',
    },
  }
)

export const searchFieldVariants = cva(
  [
    'w-full border-none rounded-xl',
    'bg-transparent',
    'disabled:bg-muted',
    'focus:outline-none focus:ring-0',
    'transition-all duration-200 ease-in-out',
    'placeholder:text-transparent',
    'text-foreground',
    'disabled:cursor-not-allowed',
  ],
  {
    variants: {
      size: {
        sm: 'h-14 px-4 pt-6 pb-2 text-sm pl-14',
        md: 'h-16 px-4 pt-6 pb-2 text-base pl-14',
        lg: 'h-[72px] px-4 pt-7 pb-2 text-lg pl-14',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

export const floatingLabelVariants = cva(
  ['absolute transition-all duration-200 ease-in-out pointer-events-none', 'origin-left'],
  {
    variants: {
      state: {
        default: 'text-foreground/70',
        focus: 'text-primary',
        success: 'text-primary',
        error: 'text-destructive',
        disabled: 'text-foreground/30',
      },
      floated: {
        true: '',
        false: '',
      },
      size: {
        sm: '',
        md: '',
        lg: '',
      },
    },
    compoundVariants: [
      { floated: false, size: 'sm', className: 'top-4 text-sm left-14' },
      { floated: true, size: 'sm', className: 'top-2 text-xs font-medium left-14' },
      { floated: false, size: 'md', className: 'top-5 text-base left-14' },
      { floated: true, size: 'md', className: 'top-2 text-xs font-medium left-14' },
      { floated: false, size: 'lg', className: 'top-6 text-lg left-14' },
      { floated: true, size: 'lg', className: 'top-2.5 text-xs font-medium left-14' },
    ],
    defaultVariants: {
      state: 'default',
      floated: false,
      size: 'md',
    },
  }
)

export const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: 0.1, ease: 'easeIn' as const },
  },
}
