'use client'

import { HomePage } from '../../../src/components/pages/HomePage'

/**
 * Preview Home Page - Displays the home page without redirects
 * Accessible at /{locale}/preview-home (e.g., /en/preview-home)
 * This route bypasses the mandatory redirects to allow viewing the home page directly
 */
export default function PreviewHomePage() {
  return <HomePage />
}
