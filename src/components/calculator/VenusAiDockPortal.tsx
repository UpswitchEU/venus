'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders the AI dock layer on `document.body` so fixed positioning is never
 * clipped by `overflow-hidden` ancestors in the manual layout shell.
 */
export function VenusAiDockPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  return createPortal(children, document.body)
}
