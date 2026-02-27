/**
 * 🔘 Button Component
 *
 * Reusable button component with multiple variants and sizes
 */

import React from 'react'

export interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  className?: string
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  className = '',
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
    secondary: 'bg-muted text-foreground hover:bg-foreground/10 focus:ring-primary',
    outline:
      'border border-foreground/10 text-foreground bg-card hover:bg-muted focus:ring-primary',
    ghost: 'text-foreground hover:bg-muted focus:ring-primary',
    danger:
      'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive',
  }

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  const widthClasses = fullWidth ? 'w-full' : ''

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClasses} ${className}`

  return (
    <button type={type} className={classes} disabled={disabled || loading} onClick={onClick}>
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
      )}
      {children}
    </button>
  )
}

export default Button
