import React, { useRef, useState } from 'react'
import { FALLBACK_CONTAINER_WIDTH, PANEL_CONSTRAINTS } from '../constants/panelConstants'

interface ResizableDividerProps {
  onResize: (leftWidth: number) => void
  leftWidth: number
  isMobile?: boolean
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  onResize,
  leftWidth,
  isMobile = false,
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const dividerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef<number>(0)
  const startWidthRef = useRef<number>(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return

    // Prevent race condition - already dragging
    if (isDraggingRef.current) return

    e.preventDefault()
    isDraggingRef.current = true
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = leftWidth

    // Add global mouse move and up listeners
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent) => {
    const containerWidth =
      dividerRef.current?.parentElement?.offsetWidth || FALLBACK_CONTAINER_WIDTH
    const deltaX = e.clientX - startXRef.current
    const deltaPercent = (deltaX / containerWidth) * 100

    const newWidth = startWidthRef.current + deltaPercent

    // Constrain between MIN_WIDTH and MAX_WIDTH
    const constrainedWidth = Math.max(
      PANEL_CONSTRAINTS.MIN_WIDTH,
      Math.min(PANEL_CONSTRAINTS.MAX_WIDTH, newWidth)
    )
    onResize(constrainedWidth)
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
    setIsDragging(false)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  // Cleanup on unmount - removed problematic cleanup since handlers already clean up in handleMouseUp

  if (isMobile) {
    return null // Don't render divider on mobile
  }

  return (
    <div
      ref={dividerRef}
      className="w-[1px] bg-foreground/10 cursor-col-resize flex items-center justify-center transition-all duration-150 ease-in-out relative group"
      onMouseDown={handleMouseDown}
      style={{
        backgroundColor: isDragging ? '#71717a' : undefined, // zinc-500 when dragging
      }}
    >
      {/* Hover area */}
      <div className="absolute inset-y-0 -left-2 -right-2 hover:bg-foreground/5" />

      {/* Visual indicator dots */}
      <div className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex flex-col gap-1">
          <div className="w-[2px] h-[2px] rounded-full bg-foreground/40" />
          <div className="w-[2px] h-[2px] rounded-full bg-foreground/40" />
          <div className="w-[2px] h-[2px] rounded-full bg-foreground/40" />
        </div>
      </div>
    </div>
  )
}
