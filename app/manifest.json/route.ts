/**
 * Manifest Route Handler
 *
 * Serves the PWA manifest JSON via a Next.js route handler instead of static file.
 * This avoids 401 errors from Vercel Deployment Protection on preview deployments,
 * which can intercept static asset requests before authentication.
 *
 * @see docs/operations/venus_report_stuck_fix - Phase 1: manifest.json 401 fix
 */

import { NextResponse } from 'next/server'

const MANIFEST = {
  short_name: 'Upswitch',
  name: 'Upswitch bedrijfswaardering voor accountants',
  description:
    'Software voor accountants en adviseurs om Exact, Yuki of Silverfin te koppelen en klanten snel onderbouwd te waarderen.',
  start_url: '/',
  display: 'standalone',
  background_color: '#F4F1EA',
  theme_color: '#3DBDB0',
  orientation: 'portrait-primary',
  icons: [
    {
      src: 'logos/upswitch-app-icon.svg',
      type: 'image/svg+xml',
      sizes: 'any',
    },
    {
      src: 'favicon-48x48.png',
      type: 'image/png',
      sizes: '48x48',
    },
    {
      src: 'favicon-16x16.png',
      type: 'image/png',
      sizes: '16x16',
    },
    {
      src: 'favicon-32x32.png',
      type: 'image/png',
      sizes: '32x32',
    },
    {
      src: 'apple-touch-icon.png',
      type: 'image/png',
      sizes: '180x180',
    },
    {
      src: 'android-chrome-192x192.png',
      type: 'image/png',
      sizes: '192x192',
      purpose: 'any maskable',
    },
    {
      src: 'android-chrome-512x512.png',
      type: 'image/png',
      sizes: '512x512',
      purpose: 'any maskable',
    },
  ],
  categories: ['business', 'finance', 'productivity'],
  lang: 'nl',
  scope: '/',
  prefer_related_applications: false,
} as const

export async function GET() {
  try {
    return NextResponse.json(MANIFEST, {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (error) {
    console.error('[Manifest Route] Failed to serve manifest:', error)
    return NextResponse.json({ error: 'Manifest not found' }, { status: 500 })
  }
}
