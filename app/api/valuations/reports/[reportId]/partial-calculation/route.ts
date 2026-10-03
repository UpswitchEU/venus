import type { NextRequest } from 'next/server'
import { proxyPartialReport } from '@/utils/partialReportProxy'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  return proxyPartialReport(request, (await params).reportId, 'partial-calculation')
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  return proxyPartialReport(request, (await params).reportId, 'partial-calculation')
}
