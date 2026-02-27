/**
 * Manifest Route Handler
 *
 * Serves the PWA manifest JSON via a Next.js route handler instead of static file.
 * This avoids 401 errors from Vercel Deployment Protection on preview deployments,
 * which can intercept static asset requests before authentication.
 *
 * @see docs/operations/venus_report_stuck_fix - Phase 1: manifest.json 401 fix
 */

import { readFileSync } from 'fs'
import { NextResponse } from 'next/server'
import { join } from 'path'

const MANIFEST_PATH = join(process.cwd(), 'public', 'manifest.json')

export async function GET() {
  try {
    const manifest = readFileSync(MANIFEST_PATH, 'utf-8')
    const parsed = JSON.parse(manifest)

    return NextResponse.json(parsed, {
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
