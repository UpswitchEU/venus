/**
 * ScrollToTop Component
 *
 * Automatically scrolls to the top of the page when the route changes.
 * This ensures that when users navigate to a new page via links in navigation,
 * footer, or anywhere else, the viewport starts at the top of the new page.
 *
 * Usage: Place this component at the root level of your app.
 * Next.js compatible version.
 */

'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const ScrollToTop = () => {
  const pathname = usePathname()

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReduced ? 'auto' : 'smooth',
    })
  }, [pathname])

  return null // This component doesn't render anything
}

export default ScrollToTop
