'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Toast, ToastType } from '../components/ui/Toast'
import { createRandomId } from '../utils/secureRandom'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  hideToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 5000) => {
    const id = createRandomId('toast', 10)
    const newToast: ToastItem = { id, message, type, duration }

    setToasts((prev) => [...prev, newToast])
  }, [])

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  // Memoised so consumers don't re-render every time the toasts list changes —
  // `showToast`/`hideToast` are already stable, so the value identity must be
  // too. Without this, every toast push cascaded a re-render through every
  // `useToast()` caller in the tree, including any callback-ref siblings.
  const contextValue = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => hideToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
