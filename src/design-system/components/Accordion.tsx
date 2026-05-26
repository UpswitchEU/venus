'use client'

/**
 * Hybrid Aurora Design System
 * Accordion Component
 *
 * Animated expand/collapse with Radix UI for accessibility.
 */

import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

// ─────────────────────────────────────────
// VARIANTS
// ─────────────────────────────────────────

const accordionVariants = cva('w-full', {
  variants: {
    variant: {
      default: '',
      bordered: 'border border-foreground/10 rounded-xl overflow-hidden',
      separated: 'space-y-2',
      ghost: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

const accordionItemVariants = cva('overflow-hidden', {
  variants: {
    variant: {
      default: 'border-b border-foreground/10 last:border-b-0',
      bordered: 'border-b border-foreground/10 last:border-b-0',
      separated: 'border border-foreground/10 rounded-xl bg-foreground/[0.02]',
      ghost: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

const accordionTriggerVariants = cva(
  'flex w-full items-center justify-between py-4 text-left font-medium transition-all hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default: 'px-0',
        bordered: 'px-4',
        separated: 'px-4',
        ghost: 'px-0 py-3',
      },
      size: {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type AccordionSingleProps = AccordionPrimitive.AccordionSingleProps &
  VariantProps<typeof accordionVariants> & {
    iconStyle?: 'chevron' | 'plus-minus'
  }

export type AccordionMultipleProps = AccordionPrimitive.AccordionMultipleProps &
  VariantProps<typeof accordionVariants> & {
    iconStyle?: 'chevron' | 'plus-minus'
  }

export type AccordionProps = AccordionSingleProps | AccordionMultipleProps

export interface AccordionItemProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>,
    VariantProps<typeof accordionItemVariants> {}

export interface AccordionTriggerProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>,
    VariantProps<typeof accordionTriggerVariants> {
  iconStyle?: 'chevron' | 'plus-minus'
}

export interface AccordionContentProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> {
  variant?: 'default' | 'bordered' | 'separated' | 'ghost'
}

// ─────────────────────────────────────────
// CONTEXT FOR VARIANT SHARING
// ─────────────────────────────────────────

const AccordionContext = React.createContext<{
  variant: 'default' | 'bordered' | 'separated' | 'ghost'
  iconStyle: 'chevron' | 'plus-minus'
}>({
  variant: 'default',
  iconStyle: 'chevron',
})

// ─────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────

const Accordion = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Root>,
  AccordionProps
>(({ className, variant = 'default', iconStyle = 'chevron', ...props }, ref) => {
  // Memoise the context value so consumers don't re-render every time the
  // Accordion root re-renders (and don't cascade through `composeRefs` of
  // any callback-ref children inside).
  const contextValue = React.useMemo(
    () => ({ variant: variant || 'default', iconStyle }),
    [variant, iconStyle]
  )
  return (
    <AccordionContext.Provider value={contextValue}>
      <AccordionPrimitive.Root
        ref={ref}
        className={cn(accordionVariants({ variant }), className)}
        {...(props as
          | AccordionPrimitive.AccordionSingleProps
          | AccordionPrimitive.AccordionMultipleProps)}
      />
    </AccordionContext.Provider>
  )
})
Accordion.displayName = 'Accordion'

// ─────────────────────────────────────────
// ITEM COMPONENT
// ─────────────────────────────────────────

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  AccordionItemProps
>(({ className, variant, ...props }, ref) => {
  const context = React.useContext(AccordionContext)
  const itemVariant = variant || context.variant

  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn(accordionItemVariants({ variant: itemVariant }), className)}
      {...props}
    />
  )
})
AccordionItem.displayName = 'AccordionItem'

// ─────────────────────────────────────────
// TRIGGER COMPONENT
// ─────────────────────────────────────────

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({ className, children, variant, size, iconStyle, ...props }, ref) => {
  const context = React.useContext(AccordionContext)
  const triggerVariant = variant || context.variant
  const icon = iconStyle || context.iconStyle

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          accordionTriggerVariants({ variant: triggerVariant, size }),
          'group',
          className
        )}
        {...props}
      >
        <span className="flex-1">{children}</span>
        {icon === 'plus-minus' ? (
          <div className="relative w-5 h-5 shrink-0 text-foreground/50 group-hover:text-foreground transition-colors">
            <Plus className="absolute inset-0 w-5 h-5 transition-transform duration-300 group-data-[state=open]:rotate-90 group-data-[state=open]:opacity-0" />
            <Minus className="absolute inset-0 w-5 h-5 transition-transform duration-300 opacity-0 group-data-[state=open]:opacity-100" />
          </div>
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-foreground/50 transition-transform duration-300 group-hover:text-foreground group-data-[state=open]:rotate-180" />
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
})
AccordionTrigger.displayName = 'AccordionTrigger'

// ─────────────────────────────────────────
// CONTENT COMPONENT
// ─────────────────────────────────────────

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  AccordionContentProps
>(({ className, children, variant, ...props }, ref) => {
  const context = React.useContext(AccordionContext)
  const contentVariant = variant || context.variant

  const paddingX = contentVariant === 'bordered' || contentVariant === 'separated' ? 'px-4' : 'px-0'

  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        'overflow-hidden text-sm text-foreground/70',
        'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
        className
      )}
      {...props}
    >
      <div className={cn('pb-4 pt-0', paddingX)}>{children}</div>
    </AccordionPrimitive.Content>
  )
})
AccordionContent.displayName = 'AccordionContent'

// ─────────────────────────────────────────
// SIMPLE ACCORDION (convenience wrapper)
// ─────────────────────────────────────────

export interface SimpleAccordionItem {
  id: string
  title: React.ReactNode
  content: React.ReactNode
  disabled?: boolean
}

export interface SimpleAccordionProps {
  items: SimpleAccordionItem[]
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'bordered' | 'separated' | 'ghost'
  iconStyle?: 'chevron' | 'plus-minus'
  type?: 'single' | 'multiple'
  defaultValue?: string | string[]
  collapsible?: boolean
  className?: string
}

const SimpleAccordion: React.FC<SimpleAccordionProps> = ({
  items,
  size = 'md',
  variant = 'default',
  iconStyle = 'chevron',
  type = 'single',
  defaultValue,
  collapsible = true,
  className,
}) => (
  <Accordion
    type={type as 'single'}
    variant={variant}
    iconStyle={iconStyle}
    defaultValue={defaultValue as string}
    collapsible={collapsible}
    className={className}
  >
    {items.map((item) => (
      <AccordionItem key={item.id} value={item.id} disabled={item.disabled}>
        <AccordionTrigger size={size}>{item.title}</AccordionTrigger>
        <AccordionContent>{item.content}</AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
)
SimpleAccordion.displayName = 'SimpleAccordion'

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  SimpleAccordion,
  accordionVariants,
  accordionItemVariants,
  accordionTriggerVariants,
}
