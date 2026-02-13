'use client';

/**
 * Progress Component
 * 
 * Animated progress bars and indicators following the Hybrid Aurora design system.
 * Features linear and circular variants with spring animations.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { springSnappy } from './motion';
import { Check } from 'lucide-react';

/* ─────────────────────────────────────────
   PROGRESS BAR VARIANTS
   ───────────────────────────────────────── */

const progressTrackVariants = cva(
  'relative overflow-hidden bg-foreground/10 rounded-full',
  {
    variants: {
      size: {
        xs: 'h-1',
        sm: 'h-1.5',
        md: 'h-2',
        lg: 'h-3',
        xl: 'h-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

const progressFillVariants = cva(
  'h-full rounded-full',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        success: 'bg-success',
        warning: 'bg-warning',
        error: 'bg-destructive',
        gradient: 'bg-gradient-to-r from-primary to-secondary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/* ─────────────────────────────────────────
   LINEAR PROGRESS
   ───────────────────────────────────────── */

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressTrackVariants>,
    VariantProps<typeof progressFillVariants> {
  /** Current value (0-100) */
  value?: number;
  /** Maximum value */
  max?: number;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: 'top' | 'right' | 'inside';
  /** Custom label format */
  formatLabel?: (value: number, max: number) => string;
  /** Indeterminate state */
  indeterminate?: boolean;
  /** Animate on mount */
  animated?: boolean;
}

export function Progress({
  value = 0,
  max = 100,
  size,
  variant,
  showLabel = false,
  labelPosition = 'right',
  formatLabel,
  indeterminate = false,
  animated = true,
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  
  const label = formatLabel 
    ? formatLabel(value, max) 
    : `${Math.round(percentage)}%`;

  return (
    <div 
      className={cn(
        'w-full',
        showLabel && labelPosition === 'top' && 'space-y-1.5',
        showLabel && labelPosition === 'right' && 'flex items-center gap-3',
        className
      )}
      {...props}
    >
      {showLabel && labelPosition === 'top' && (
        <div className="flex justify-between items-center text-xs text-foreground/60">
          <span>Progress</span>
          <span className="font-mono font-medium text-foreground">{label}</span>
        </div>
      )}
      
      <div className={cn(progressTrackVariants({ size }), 'flex-1')}>
        {indeterminate ? (
          <motion.div
            className={cn(progressFillVariants({ variant }), 'w-1/3')}
            animate={{
              x: ['-100%', '400%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ) : (
          <motion.div
            className={cn(progressFillVariants({ variant }))}
            initial={animated ? { width: 0 } : { width: `${percentage}%` }}
            animate={{ width: `${percentage}%` }}
            transition={springSnappy}
          />
        )}
        
        {showLabel && labelPosition === 'inside' && size !== 'xs' && size !== 'sm' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-medium text-foreground mix-blend-difference">
              {label}
            </span>
          </div>
        )}
      </div>
      
      {showLabel && labelPosition === 'right' && (
        <span className="text-sm font-mono font-medium text-foreground min-w-[3rem] text-right">
          {label}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   CIRCULAR PROGRESS
   ───────────────────────────────────────── */

export interface CircularProgressProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current value (0-100) */
  value?: number;
  /** Maximum value */
  max?: number;
  /** Size of the circle */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Stroke width */
  strokeWidth?: number;
  /** Color variant */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'gradient';
  /** Show percentage in center */
  showLabel?: boolean;
  /** Custom center content */
  children?: React.ReactNode;
  /** Indeterminate state */
  indeterminate?: boolean;
  /** Animate on mount */
  animated?: boolean;
}

const circularSizes = {
  sm: { size: 40, stroke: 3, textSize: 'text-xs' },
  md: { size: 64, stroke: 4, textSize: 'text-sm' },
  lg: { size: 96, stroke: 5, textSize: 'text-lg' },
  xl: { size: 128, stroke: 6, textSize: 'text-xl' },
};

const circularColors = {
  default: 'stroke-primary',
  success: 'stroke-success',
  warning: 'stroke-warning',
  error: 'stroke-destructive',
  gradient: 'stroke-primary',
};

export function CircularProgress({
  value = 0,
  max = 100,
  size = 'md',
  strokeWidth,
  variant = 'default',
  showLabel = true,
  children,
  indeterminate = false,
  animated = true,
  className,
  ...props
}: CircularProgressProps) {
  const config = circularSizes[size];
  const stroke = strokeWidth ?? config.stroke;
  const radius = (config.size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const offset = circumference - (percentage / 100) * circumference;

  const gradientId = React.useId();

  return (
    <div 
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: config.size, height: config.size }}
      {...props}
    >
      <svg
        className={cn(
          'transform -rotate-90',
          indeterminate && 'animate-spin'
        )}
        width={config.size}
        height={config.size}
      >
        {variant === 'gradient' && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--secondary))" />
            </linearGradient>
          </defs>
        )}
        
        {/* Background track */}
        <circle
          className="stroke-foreground/10"
          strokeWidth={stroke}
          fill="none"
          r={radius}
          cx={config.size / 2}
          cy={config.size / 2}
        />
        
        {/* Progress arc */}
        <motion.circle
          className={cn(
            variant !== 'gradient' && circularColors[variant],
            'transition-colors'
          )}
          stroke={variant === 'gradient' ? `url(#${gradientId})` : undefined}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={config.size / 2}
          cy={config.size / 2}
          initial={animated ? { strokeDashoffset: circumference } : { strokeDashoffset: offset }}
          animate={{ 
            strokeDashoffset: indeterminate ? [circumference, 0] : offset 
          }}
          transition={indeterminate ? { duration: 1.5, repeat: Infinity, ease: 'linear' } : springSnappy}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? (showLabel && !indeterminate && (
          <span className={cn(config.textSize, 'font-semibold text-foreground font-mono')}>
            {Math.round(percentage)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   STEP PROGRESS
   ───────────────────────────────────────── */

export interface StepProgressStep {
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface StepProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Steps configuration */
  steps: StepProgressStep[];
  /** Current active step (0-indexed) */
  currentStep: number;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  variant?: 'default' | 'success' | 'primary';
  /** Show step numbers instead of checkmarks */
  showNumbers?: boolean;
}

const stepSizes = {
  sm: { circle: 'w-6 h-6', icon: 'w-3 h-3', text: 'text-xs', gap: 'gap-2' },
  md: { circle: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-sm', gap: 'gap-3' },
  lg: { circle: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-base', gap: 'gap-4' },
};

const stepVariantColors = {
  default: {
    complete: 'bg-primary text-primary-foreground border-primary',
    active: 'bg-primary/20 text-primary border-primary',
    pending: 'bg-foreground/5 text-foreground/40 border-foreground/20',
  },
  success: {
    complete: 'bg-success text-success-foreground border-success',
    active: 'bg-success/20 text-success border-success',
    pending: 'bg-foreground/5 text-foreground/40 border-foreground/20',
  },
  primary: {
    complete: 'bg-primary text-primary-foreground border-primary',
    active: 'bg-background text-primary border-primary ring-4 ring-primary/20',
    pending: 'bg-foreground/5 text-foreground/40 border-foreground/20',
  },
};

export function StepProgress({
  steps,
  currentStep,
  orientation = 'horizontal',
  size = 'md',
  variant = 'default',
  showNumbers = false,
  className,
  ...props
}: StepProgressProps) {
  const config = stepSizes[size];
  const colors = stepVariantColors[variant];

  const getStepState = (index: number): 'complete' | 'active' | 'pending' => {
    if (index < currentStep) return 'complete';
    if (index === currentStep) return 'active';
    return 'pending';
  };

  return (
    <div 
      className={cn(
        orientation === 'horizontal' 
          ? 'flex items-start justify-between' 
          : 'flex flex-col',
        config.gap,
        className
      )}
      {...props}
    >
      {steps.map((step, index) => {
        const state = getStepState(index);
        const isLast = index === steps.length - 1;

        return (
          <div
            key={index}
            className={cn(
              orientation === 'horizontal' 
                ? 'flex flex-col items-center flex-1'
                : 'flex items-start',
              config.gap
            )}
          >
            <div className={cn(
              orientation === 'horizontal' 
                ? 'flex items-center w-full'
                : 'flex flex-col items-center'
            )}>
              {/* Step Circle */}
              <motion.div
                className={cn(
                  config.circle,
                  'rounded-full border-2 flex items-center justify-center shrink-0 font-medium',
                  config.text,
                  colors[state]
                )}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...springSnappy, delay: index * 0.1 }}
              >
                {state === 'complete' && !showNumbers ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={springSnappy}
                  >
                    {step.icon ?? <Check className={config.icon} />}
                  </motion.div>
                ) : (
                  <span>{index + 1}</span>
                )}
              </motion.div>

              {/* Connector Line */}
              {!isLast && orientation === 'horizontal' && (
                <div className="flex-1 h-0.5 bg-foreground/10 mx-2">
                  <motion.div
                    className={cn(
                      'h-full',
                      state === 'complete' ? 'bg-primary' : 'bg-transparent'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: state === 'complete' ? '100%' : '0%' }}
                    transition={springSnappy}
                  />
                </div>
              )}

              {/* Vertical Connector */}
              {!isLast && orientation === 'vertical' && (
                <div className="w-0.5 h-8 bg-foreground/10 my-2 ml-[15px]">
                  <motion.div
                    className={cn(
                      'w-full',
                      state === 'complete' ? 'bg-primary' : 'bg-transparent'
                    )}
                    initial={{ height: 0 }}
                    animate={{ height: state === 'complete' ? '100%' : '0%' }}
                    transition={springSnappy}
                  />
                </div>
              )}
            </div>

            {/* Labels */}
            <div className={cn(
              orientation === 'horizontal' ? 'text-center mt-2' : 'ml-3',
              'flex-1'
            )}>
              <p className={cn(
                config.text,
                'font-medium',
                state === 'pending' ? 'text-foreground/40' : 'text-foreground'
              )}>
                {step.label}
              </p>
              {step.description && (
                <p className={cn(
                  'text-xs text-foreground/50 mt-0.5',
                  orientation === 'horizontal' && 'hidden sm:block'
                )}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   EXPORTS
   ───────────────────────────────────────── */

export { progressTrackVariants, progressFillVariants };
