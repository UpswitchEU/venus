'use client'

import { AlertCircle, Check, Info, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose?: () => void
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 5000,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => onClose?.(), 300)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-primary-50 border-primary-200 text-primary-800',
          icon: 'text-primary',
          iconComponent: Check,
        }
      case 'error':
        return {
          container: 'bg-accent-50 border-accent-200 text-accent-800',
          icon: 'text-accent-600',
          iconComponent: AlertCircle,
        }
      case 'warning':
        return {
          container: 'bg-harvest-50 border-harvest-200 text-harvest-800',
          icon: 'text-harvest-600',
          iconComponent: AlertCircle,
        }
      case 'info':
      default:
        return {
          container: 'bg-primary/10 border-primary/20 text-primary',
          icon: 'text-primary',
          iconComponent: Info,
        }
    }
  }

  const styles = getTypeStyles()
  const IconComponent = styles.iconComponent

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => onClose?.(), 300)
  }

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm w-full transform transition-all duration-300 ease-in-out ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`flex items-start p-4 rounded-lg border shadow-lg ${styles.container}`}>
        <IconComponent className={`w-5 h-5 mr-3 mt-0.5 flex-shrink-0 ${styles.icon}`} />
        <div className="flex-1 text-sm font-medium">{message}</div>
        <button
          onClick={handleClose}
          className="ml-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
