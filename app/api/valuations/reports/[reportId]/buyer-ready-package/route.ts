import { type NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const REPORT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const GENERATION_TIMEOUT_MS = 110_000

const AGENT_TOOL_ACTION_NAME_HEADER = 'X-Upswitch-Agent-Tool-Name'
const AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER = 'X-Upswitch-Agent-Proposal-Id'

type RouteContext = {
  params: Promise<{ reportId: string }>
}

function forwardAgentToolActionHeaders(request: Pick<Request, 'headers'>): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of [AGENT_TOOL_ACTION_NAME_HEADER, AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER]) {
    const value = request.headers.get(name)
    if (value?.trim()) headers[name] = value.trim()
  }
  return headers
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { reportId } = await context.params
  if (!reportId || !REPORT_ID_PATTERN.test(reportId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid valuation report ID' },
      { status: 400 }
    )
  }

  const { cookieHeader } = await getBffCookieHeaderForTitan(request)
  if (!hasTitanAccessCookie(cookieHeader)) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  }

  const raw = await request.text()
  const requestBody = raw.trim() ? raw : '{}'
  const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)
  const titanApiUrl = getTitanApiUrl(request)

  try {
    const { response, json: responseBody } = await fetchJsonWithTimeout(
      `${titanApiUrl}/api/v2/valuations/reports/${encodeURIComponent(
        reportId
      )}/buyer-ready-package`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...forwardAgentToolActionHeaders(request),
        },
        credentials: 'include',
        body: requestBody,
      },
      GENERATION_TIMEOUT_MS
    )

    const data = responseBody ?? {
      success: false,
      error: 'Buyer-ready package generation failed',
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AuthUpstreamTimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? 'Buyer-ready package generation timed out'
          : error instanceof Error
            ? error.message
            : 'Buyer-ready package generation failed',
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
