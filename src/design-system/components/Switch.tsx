'use client';

/**
 * Hybrid Aurora Design System
 * Switch Component
 * 
 * Toggle switch with spring animations and multiple sizes.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { springSnappy } from "./motion";

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const switchTrackVariants = cva(
  [
    "relative inline-flex shrink-0 cursor-pointer items-center rounded-full",
    "border-2 border-transparent transition-colors duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  {
    variants: {
      size: {
        sm: "h-5 w-9",
        md: "h-6 w-11",
        lg: "h-8 w-14",
      },
      checked: {
        true: "bg-primary",
        false: "bg-foreground/[0.15]",
      },
      variant: {
        default: "",
        success: "",
        warning: "",
      },
    },
    compoundVariants: [
      { checked: true, variant: "success", className: "bg-success" },
      { checked: true, variant: "warning", className: "bg-warning" },
    ],
    defaultVariants: {
      size: "md",
      checked: false,
      variant: "default",
    },
  }
);

const switchThumbVariants = cva(
  [
    "pointer-events-none block rounded-full bg-background shadow-lg ring-0",
  ],
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        md: "h-5 w-5",
        lg: "h-7 w-7",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

// ─────────────────────────────────────────
// COMPONENT TYPES
// ─────────────────────────────────────────

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>,
    VariantProps<typeof switchTrackVariants> {
  /** Controlled checked state */
  checked?: boolean;
  /** Default checked state for uncontrolled usage */
  defaultChecked?: boolean;
  /** Callback when switch state changes */
  onChange?: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Description text shown below label */
  description?: string;
  /** Position of the label */
  labelPosition?: "left" | "right";
  /** Whether to show loading state */
  loading?: boolean;
}

export interface SwitchGroupProps {
  /** Group label */
  label?: string;
  /** Description for the group */
  description?: string;
  /** Switch items */
  children: React.ReactNode;
  /** Container className */
  className?: string;
  /** Layout orientation */
  orientation?: "vertical" | "horizontal";
}

// ─────────────────────────────────────────
// THUMB POSITION HELPERS
// ─────────────────────────────────────────

const getThumbPosition = (size: "sm" | "md" | "lg", checked: boolean) => {
  const positions = {
    sm: { checked: 16, unchecked: 0 },
    md: { checked: 20, unchecked: 0 },
    lg: { checked: 24, unchecked: 0 },
  };
  return checked ? positions[size].checked : positions[size].unchecked;
};

// ─────────────────────────────────────────
// SWITCH COMPONENT
// ─────────────────────────────────────────

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked: controlledChecked,
      defaultChecked = false,
      onChange,
      size = "md",
      variant = "default",
      label,
      description,
      labelPosition = "right",
      loading = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    
    const isControlled = controlledChecked !== undefined;
    const isChecked = isControlled ? controlledChecked : internalChecked;

    const handleClick = () => {
      if (disabled || loading) return;
      
      const newValue = !isChecked;
      
      if (!isControlled) {
        setInternalChecked(newValue);
      }
      
      onChange?.(newValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    };

    const switchElement = (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-disabled={disabled}
        disabled={disabled || loading}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          switchTrackVariants({ size, checked: isChecked, variant }),
          className
        )}
        {...props}
      >
        <span
          className="pointer-events-none absolute top-1/2 -translate-y-1/2"
          style={{ left: 2 }}
          aria-hidden="true"
        >
          <motion.span
            className={cn(switchThumbVariants({ size }))}
            initial={false}
            animate={{
              x: getThumbPosition(size || "md", isChecked),
            }}
            transition={springSnappy}
          >
            {loading && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div
                  className={cn(
                    "border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin",
                    size === "sm" && "w-2.5 h-2.5",
                    size === "md" && "w-3 h-3",
                    size === "lg" && "w-4 h-4"
                  )}
                />
              </motion.div>
            )}
          </motion.span>
        </span>
      </button>
    );

    if (!label) {
      return switchElement;
    }

    return (
      <label
        className={cn(
          "inline-flex items-center gap-3 cursor-pointer",
          disabled && "cursor-not-allowed opacity-60",
          labelPosition === "left" && "flex-row-reverse"
        )}
      >
        {switchElement}
        <div className="flex flex-col">
          <span
            className={cn(
              "text-foreground font-medium select-none",
              size === "sm" && "text-sm",
              size === "md" && "text-base",
              size === "lg" && "text-lg"
            )}
          >
            {label}
          </span>
          {description && (
            <span className="text-foreground/60 text-sm">{description}</span>
          )}
        </div>
      </label>
    );
  }
);
Switch.displayName = "Switch";

// ─────────────────────────────────────────
// SWITCH GROUP
// ─────────────────────────────────────────

export const SwitchGroup = React.forwardRef<HTMLDivElement, SwitchGroupProps>(
  ({
    label,
    description,
    children,
    className,
    orientation = "vertical",
  }, ref) => {
    return (
      <div 
        ref={ref}
        className={cn("space-y-3", className)} 
        role="group" 
        aria-label={label}
      >
        {(label || description) && (
          <div className="space-y-1">
            {label && (
              <div className="text-sm font-medium text-foreground">{label}</div>
            )}
            {description && (
              <div className="text-sm text-foreground/60">{description}</div>
            )}
          </div>
        )}
        <div
          className={cn(
            orientation === "vertical" && "flex flex-col gap-3",
            orientation === "horizontal" && "flex flex-wrap gap-4"
          )}
        >
          {children}
        </div>
      </div>
    );
  }
);
SwitchGroup.displayName = "SwitchGroup";

// ─────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────

export { switchTrackVariants, switchThumbVariants };
