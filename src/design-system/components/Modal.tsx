'use client';

/**
 * Modal Component
 * 
 * Accessible dialog with animated entry/exit, focus trapping,
 * and multiple size/variant options following Hybrid Aurora patterns.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../utils";
import { cva, type VariantProps } from "class-variance-authority";

// ─────────────────────────────────────────
// STYLE VARIANTS
// ─────────────────────────────────────────

const modalVariants = cva(
  [
    "w-full shadow-2xl focus:outline-none",
    "bg-background border border-foreground/10 rounded-2xl",
  ],
  {
    variants: {
      variant: {
        default: [
          "bg-background backdrop-blur-xl",
          "border border-foreground/10",
        ],
        glass: [
          "bg-background/90 backdrop-blur-2xl",
          "border border-foreground/20",
          "shadow-[0_0_60px_-15px_hsl(var(--primary)/0.3)]",
        ],
        minimal: [
          "bg-background",
          "border border-foreground/5",
          "rounded-xl",
        ],
      },
      size: {
        sm: "max-w-sm p-5",
        md: "max-w-md p-6",
        lg: "max-w-lg p-8",
        xl: "max-w-xl p-8",
        full: "max-w-[90vw] max-h-[90vh] p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

// ─────────────────────────────────────────
// COMPONENT TYPES
// ─────────────────────────────────────────

export interface ModalProps extends VariantProps<typeof modalVariants> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export interface ModalContentProps 
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof modalVariants> {
  showClose?: boolean;
  children?: React.ReactNode;
  className?: string;
}

// ─────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────

const Modal = DialogPrimitive.Root;

const ModalTrigger = DialogPrimitive.Trigger;

const ModalPortal = DialogPrimitive.Portal;

const ModalClose = DialogPrimitive.Close;

// ─────────────────────────────────────────
// OVERLAY
// ─────────────────────────────────────────

const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
ModalOverlay.displayName = "ModalOverlay";

// ─────────────────────────────────────────
// CONTENT
// ─────────────────────────────────────────

const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(({ 
  className, 
  children, 
  variant, 
  size,
  showClose = true,
  ...props 
}, ref) => {
  return (
    <DialogPrimitive.Portal>
      <ModalOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-[9999]",
          "-translate-x-1/2 -translate-y-1/2",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "duration-200",
          modalVariants({ variant, size }),
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 rounded-full p-1.5",
              "text-foreground/50 hover:text-foreground",
              "bg-foreground/5 hover:bg-foreground/10",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
              "disabled:pointer-events-none"
            )}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
ModalContent.displayName = "ModalContent";

// ─────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────

const ModalHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-2 mb-6", className)}
    {...props}
  />
));
ModalHeader.displayName = "ModalHeader";

// ─────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────

const ModalFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 mt-6",
      className
    )}
    {...props}
  />
));
ModalFooter.displayName = "ModalFooter";

// ─────────────────────────────────────────
// TITLE
// ─────────────────────────────────────────

const ModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight text-foreground/90",
      className
    )}
    {...props}
  />
));
ModalTitle.displayName = "ModalTitle";

// ─────────────────────────────────────────
// DESCRIPTION
// ─────────────────────────────────────────

const ModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-foreground/60", className)}
    {...props}
  />
));
ModalDescription.displayName = "ModalDescription";

// ─────────────────────────────────────────
// ANIMATED WRAPPER
// ─────────────────────────────────────────

interface AnimatedModalProps extends Omit<ModalContentProps, 'children'> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const AnimatedModal: React.FC<AnimatedModalProps> = ({
  open,
  onOpenChange,
  children,
  ...props
}) => (
  <Modal open={open} onOpenChange={onOpenChange}>
    <ModalContent {...props}>{children}</ModalContent>
  </Modal>
);
AnimatedModal.displayName = "AnimatedModal";

export {
  Modal,
  ModalPortal,
  ModalOverlay,
  ModalClose,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  AnimatedModal,
  modalVariants,
};
