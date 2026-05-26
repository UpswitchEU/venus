import { type NextRequest } from 'next/server'
import { proxyAgentMultipartToMercury } from '../../_utils/agentMultipartProxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  return proxyAgentMultipartToMercury(request, '/api/import/bulk-clients')
}
