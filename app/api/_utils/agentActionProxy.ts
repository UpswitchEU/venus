import { type NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const AGENT_TOOL_ACTION_NAME_HEADER = 'X-Upswitch-Agent-Tool-Name'
export const AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER = 'X-Upswitch-Agent-Proposal-Id'

export function encodeTitanPathSegment(value: string) {
  return encodeURIComponent(value)
}

export function forwardAgentToolActionHeaders(
  request: Pick<Request, 'headers'>
): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of [AGENT_TOOL_ACTION_NAME_HEADER, AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER]) {
    const value = request.headers.get(name)
    if (value?.trim()) headers[name] = value.trim()
  }
  return headers
}

export async function proxyAgentJsonToTitan(
  request: NextRequest,
  path: string,
  options: {
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    timeoutMs?: number
    successStatus?: number
  }
) {
  const { cookieHeader } = await getBffCookieHeaderForTitan(request)
  if (!hasTitanAccessCookie(cookieHeader)) {
    return NextResponse.json(
      { success: false, message: 'Authentication required' },
      { status: 401 }
    )
  }

  const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)
  const { response, json: data } = await fetchJsonWithTimeout<Record<string, unknown>>(
    `${getTitanApiUrl(request)}${path}`,
    {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...forwardAgentToolActionHeaders(request),
      },
      credentials: 'include',
      body: JSON.stringify(options.body ?? {}),
    },
    options.timeoutMs ?? 15_000
  )

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 })
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        success: false,
        message:
          data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
            ? data.message
            : `Request failed with HTTP ${response.status}`,
        data,
      },
      { status: response.status }
    )
  }

  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status: options.successStatus ?? response.status }
  )
}
