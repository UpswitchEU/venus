import React, { useEffect, useRef, useState } from 'react'

interface InfoIconProps {
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
  size?: number
  className?: string
}

/**
 * InfoIcon Component
 *
 * Displays an info icon with a tooltip that shows help text.
 * - Desktop: Hover to show tooltip
 * - Mobile: Tap to toggle tooltip
 * - Accessible: Keyboard navigation and ARIA labels
 * - Supports long text with wrapping
 */
export const InfoIcon: React.FC<InfoIconProps> = ({
  content,
  position = 'top',
  maxWidth = 300,
  size = 14,
  className = 'ml-1',
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window)
  }, [])

  const handleMouseEnter = () => {
    if (isTouchDevice) return
    const timeout = setTimeout(() => setIsVisible(true), 200)
    setHoverTimeout(timeout)
  }

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      setHoverTimeout(null)
    }
    setIsVisible(false)
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isTouchDevice) {
      e.preventDefault()
      e.stopPropagation()
      setIsVisible(!isVisible)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsVisible(!isVisible)
    } else if (e.key === 'Escape') {
      setIsVisible(false)
    }
  }

  // Close on outside click for mobile
  useEffect(() => {
    if (!isTouchDevice || !isVisible) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isTouchDevice, isVisible])

  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout)
    }
  }, [hoverTimeout])

  // Position classes for tooltip
  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  }

  // Arrow position classes
  const arrowPositionClasses = {
    top: 'bottom-[-4px] left-1/2 -translate-x-1/2',
    bottom: 'top-[-4px] left-1/2 -translate-x-1/2',
    left: 'right-[-4px] top-1/2 -translate-y-1/2',
    right: 'left-[-4px] top-1/2 -translate-y-1/2',
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={!isTouchDevice ? handleMouseEnter : undefined}
        onMouseLeave={!isTouchDevice ? handleMouseLeave : undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsVisible(true)}
        onBlur={(e) => {
          // Don't blur if clicking into tooltip
          if (!tooltipRef.current?.contains(e.relatedTarget as Node)) {
            setIsVisible(false)
          }
        }}
        tabIndex={0}
        aria-label={`Help: ${content}`}
        aria-describedby={isVisible ? 'info-tooltip' : undefined}
        className="text-gray-300 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded-full"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </button>

      {isVisible && (
        <div
          id="info-tooltip"
          ref={tooltipRef}
          role="tooltip"
          className={`absolute z-[10000] px-3 py-2 text-sm text-white bg-slate-ink rounded-lg shadow-lg transition-opacity duration-200 ${positionClasses[position]}`}
          style={{
            zIndex: 10000,
            maxWidth: `${maxWidth}px`,
            width: 'max-content',
            minWidth: '200px',
            wordWrap: 'break-word',
          }}
        >
          <p className="whitespace-normal leading-relaxed">{content}</p>
          <div
            className={`absolute w-2 h-2 bg-slate-ink rotate-45 ${arrowPositionClasses[position]}`}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}
