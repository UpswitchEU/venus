import { cva } from 'class-variance-authority'

export type SliderSize = 'sm' | 'md' | 'lg'
export type SliderVariant = 'default' | 'success' | 'accent'

export const sliderTrackVariants = cva(
  ['relative w-full rounded-full', 'bg-foreground/[0.10]', 'cursor-pointer'],
  {
    variants: {
      size: {
        sm: 'h-1.5',
        md: 'h-2',
        lg: 'h-2.5',
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      disabled: false,
    },
  }
)

export const sliderThumbVariants = cva(
  [
    'absolute top-1/2 -translate-y-1/2 z-10',
    'rounded-full bg-background',
    'border-2 border-primary',
    'shadow-md cursor-grab active:cursor-grabbing',
    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
    'transition-shadow',
  ],
  {
    variants: {
      size: {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
      },
      variant: {
        default: 'border-primary',
        success: 'border-success',
        accent: 'border-accent',
      },
      disabled: {
        true: 'cursor-not-allowed',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
      disabled: false,
    },
  }
)

export const sliderFillClassByVariant: Record<SliderVariant, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  accent: 'bg-accent',
}

export function sliderTrackHitAreaSize(size: SliderSize): string {
  if (size === 'sm') return 'min-h-11 sm:h-5'
  if (size === 'lg') return 'min-h-11 sm:h-7'
  return 'min-h-11 sm:h-6'
}

export function sliderThumbVisualSize(size: SliderSize): string {
  if (size === 'sm') return 'h-4 w-4'
  if (size === 'lg') return 'h-6 w-6'
  return 'h-5 w-5'
}

export function sliderThumbBorderClass(variant: SliderVariant): string {
  if (variant === 'success') return 'border-success'
  if (variant === 'accent') return 'border-accent'
  return 'border-primary'
}
