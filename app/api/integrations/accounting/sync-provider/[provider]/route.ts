import { type NextRequest, NextResponse } from 'next/server'
import { proxyProviderAccountingSyncToTitan } from '../../../../_utils/accountingProviderSyncProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 35

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const normalizedProvider = provider?.trim().toLowerCase()
  if (!normalizedProvider) {
    return NextResponse.json({ success: false, message: 'Provider is required' }, { status: 400 })
  }

  return proxyProviderAccountingSyncToTitan(request, normalizedProvider)
}
