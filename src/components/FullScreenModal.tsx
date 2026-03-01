import { Maximize2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '@/hooks/useScrollLock'

interface FullScreenModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export const FullScreenModal: React.FC<FullScreenModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  const rt = useTranslations('reports')
  const displayTitle = title || rt('title')

  // Robust scroll lock (iOS Safari + Android)
  useScrollLock(isOpen)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop - touch-none/overscroll-none prevent background scroll on iOS */}
      <div
        className="absolute inset-0 bg-black/80 touch-none overscroll-none"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Modal Content */}
      <div className="relative w-full h-full bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-foreground/10 bg-card">
          <div className="flex items-center gap-3">
            <Maximize2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-white">{displayTitle}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={rt('closeEsc')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body)
  }

  return modal
}
