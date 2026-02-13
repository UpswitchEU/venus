'use client';

/**
 * Tooltip Component
 * 
 * Animated tooltip with multiple placement options and arrow indicator.
 * Built on Radix UI for accessibility with Framer Motion animations.
 */

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  delayDuration?: number;
  showArrow?: boolean;
  className?: string;
}

export interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}

// ─────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────

const tooltipVariants = {
  initial: (side: string) => ({
    opacity: 0,
    scale: 0.96,
    y: side === 'bottom' ? -4 : side === 'top' ? 4 : 0,
    x: side === 'right' ? -4 : side === 'left' ? 4 : 0,
  }),
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    x: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    },
  },
  exit: (side: string) => ({
    opacity: 0,
    scale: 0.96,
    y: side === 'bottom' ? -2 : side === 'top' ? 2 : 0,
    x: side === 'right' ? -2 : side === 'left' ? 2 : 0,
    transition: {
      duration: 0.15,
      ease: 'easeOut' as const,
    },
  }),
};

// ─────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────

export const TooltipProvider: React.FC<TooltipProviderProps> = ({
  children,
  delayDuration = 200,
  skipDelayDuration = 300,
}) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
  >
    {children}
  </TooltipPrimitive.Provider>
);

// ─────────────────────────────────────────
// TOOLTIP COMPONENT
// ─────────────────────────────────────────

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  delayDuration,
  showArrow = true,
  className,
}) => {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      delayDuration={delayDuration}
    >
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <AnimatePresence>
        {open && (
          <TooltipPrimitive.Portal forceMount>
            <TooltipPrimitive.Content
              side={side}
              align={align}
              sideOffset={sideOffset}
              asChild
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              <motion.div
                custom={side}
                variants={tooltipVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={cn(
                  'z-50 overflow-hidden rounded-lg px-3 py-1.5',
                  'bg-foreground/95 backdrop-blur-md',
                  'text-sm text-background font-medium',
                  'border border-foreground/10',
                  'shadow-lg shadow-black/20',
                  className
                )}
              >
                {content}
                {showArrow && (
                  <TooltipPrimitive.Arrow
                    className="fill-foreground/95"
                    width={10}
                    height={5}
                  />
                )}
              </motion.div>
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        )}
      </AnimatePresence>
    </TooltipPrimitive.Root>
  );
};

// ─────────────────────────────────────────
// COMPOUND COMPONENTS
// ─────────────────────────────────────────

export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipPortal = TooltipPrimitive.Portal;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    showArrow?: boolean;
  }
>(({ className, sideOffset = 6, showArrow = true, children, side = 'top', ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    side={side}
    className={cn(
      'z-50 overflow-hidden rounded-lg px-3 py-1.5',
      'bg-foreground/95 backdrop-blur-md',
      'text-sm text-background font-medium',
      'border border-foreground/10',
      'shadow-lg shadow-black/20',
      'animate-in fade-in-0 zoom-in-95',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'data-[side=bottom]:slide-in-from-top-2',
      'data-[side=left]:slide-in-from-right-2',
      'data-[side=right]:slide-in-from-left-2',
      'data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  >
    {children}
    {showArrow && (
      <TooltipPrimitive.Arrow
        className="fill-foreground/95"
        width={10}
        height={5}
      />
    )}
  </TooltipPrimitive.Content>
));
TooltipContent.displayName = 'TooltipContent';

export default Tooltip;
