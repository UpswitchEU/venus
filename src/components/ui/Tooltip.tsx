import React, { useEffect, useRef, useState } from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
  className = 'cursor-help border-b border-dotted border-gray-400',
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window)
  }, [])

  const handleMouseEnter = () => {
    if (isTouchDevice) return

    const timeout = setTimeout(() => setIsVisible(true), delay)
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

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isTouchDevice, isVisible])

  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout)
    }
  }, [hoverTimeout])

  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        role="tooltip"
        aria-label={content}
        onClick={handleClick}
        onMouseEnter={!isTouchDevice ? handleMouseEnter : undefined}
        onMouseLeave={!isTouchDevice ? handleMouseLeave : undefined}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        tabIndex={0}
        className={className}
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`absolute z-[10000] px-3 py-2 text-sm text-white bg-gray-900 
            rounded-lg shadow-lg whitespace-nowrap transition-opacity duration-200
            ${position === 'top' ? 'bottom-full mb-2 left-1/2 -translate-x-1/2' : ''}
            ${position === 'bottom' ? 'top-full mt-2 left-1/2 -translate-x-1/2' : ''}
          `}
          style={{ zIndex: 10000 }}
        >
          {content}
          <div
            className={`absolute w-2 h-2 bg-gray-900 rotate-45
            ${position === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2' : ''}
            ${position === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2' : ''}
          `}
          />
        </div>
      )}
    </div>
  )
}
