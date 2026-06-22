import { cva } from 'class-variance-authority'

export const shakeAnimation = {
  shake: {
    x: [0, -8, 8, -8, 8, -4, 4, 0],
    transition: { duration: 0.5, ease: 'easeInOut' as const },
  },
}

export const inputContainerVariants = cva('relative w-full transition-all duration-200', {
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

export const inputGroupVariants = cva(
  ['relative border rounded-xl shadow-sm transition-all duration-200', 'bg-foreground/[0.04]'],
  {
    variants: {
      state: {
        default: 'border-foreground/[0.10] hover:border-foreground/[0.20]',
        focus: 'border-primary ring-2 ring-primary/20 ring-offset-0',
        error: 'border-destructive',
        success: 'border-primary',
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

export const inputFieldVariants = cva(
  [
    'w-full border-none rounded-xl',
    'bg-transparent',
    'focus:outline-none focus:ring-0',
    'transition-all duration-200 ease-in-out',
    'placeholder:text-transparent',
    'text-foreground',
    'disabled:cursor-not-allowed',
  ],
  {
    variants: {
      size: {
        sm: 'h-14 px-4 pt-6 pb-2 text-sm',
        md: 'h-16 px-4 pt-6 pb-2 text-base',
        lg: 'h-[72px] px-4 pt-7 pb-2 text-lg',
      },
      hasIcon: {
        true: '',
        false: '',
      },
      iconPosition: {
        left: '',
        right: '',
      },
    },
    compoundVariants: [
      { hasIcon: true, iconPosition: 'left', size: 'sm', className: 'pl-10' },
      { hasIcon: true, iconPosition: 'left', size: 'md', className: 'pl-11' },
      { hasIcon: true, iconPosition: 'left', size: 'lg', className: 'pl-12' },
      { hasIcon: true, iconPosition: 'right', size: 'sm', className: 'pr-10' },
      { hasIcon: true, iconPosition: 'right', size: 'md', className: 'pr-10' },
      { hasIcon: true, iconPosition: 'right', size: 'lg', className: 'pr-12' },
    ],
    defaultVariants: {
      size: 'md',
      hasIcon: false,
      iconPosition: 'right',
    },
  }
)

export const floatingLabelVariants = cva(
  ['absolute left-4 transition-all duration-200 ease-in-out pointer-events-none', 'origin-left'],
  {
    variants: {
      state: {
        default: 'text-foreground/70',
        focus: 'text-primary',
        error: 'text-destructive',
        success: 'text-primary',
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
      { floated: false, size: 'sm', className: 'top-4 text-sm' },
      { floated: true, size: 'sm', className: 'top-2 text-xs font-medium' },
      { floated: false, size: 'md', className: 'top-5 text-base' },
      { floated: true, size: 'md', className: 'top-2 text-xs font-medium' },
      { floated: false, size: 'lg', className: 'top-6 text-lg' },
      { floated: true, size: 'lg', className: 'top-2.5 text-xs font-medium' },
    ],
    defaultVariants: {
      state: 'default',
      floated: false,
      size: 'md',
    },
  }
)
