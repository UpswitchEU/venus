import { type NextRequest, NextResponse } from 'next/server'
import { hasTitanAccessCookie } from '@/utils/auth/cookieHeader'
import { AuthUpstreamTimeoutError, getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchTextWithTimeout } from '@/utils/fetchWithTimeout'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { forwardAgentToolActionHeaders } from './agentActionProxy'

function parseJsonText(text: string | null): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function proxyAgentMultipartToMercury(
  request: NextRequest,
  path: string,
  options: { timeoutMs?: number } = {}
) {
  const { cookieHeader } = await getBffCookieHeaderForTitan(request)
  if (!hasTitanAccessCookie(cookieHeader)) {
    return NextResponse.json(
      { success: false, message: 'Authentication required' },
      { status: 401 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { success: false, message: 'Request must be multipart/form-data.' },
      { status: 400 }
    )
  }

  const target = `${getMercuryUrl().replace(/\/$/, '')}${path}`
  try {
    const { response, text } = await fetchTextWithTimeout(
      target,
      {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          ...forwardAgentToolActionHeaders(request),
        },
        body: formData,
      },
      options.timeoutMs ?? 290_000
    )

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = parseJsonText(text)
      return NextResponse.json(data, { status: response.status })
    }

    return new NextResponse(text ?? '', {
      status: response.status,
      headers: contentType ? { 'Content-Type': contentType } : undefined,
    })
  } catch (error) {
    if (error instanceof AuthUpstreamTimeoutError) {
      return NextResponse.json(
        { success: false, message: 'Import service timed out. Please try again.' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { success: false, message: 'Import service unavailable.' },
      { status: 502 }
    )
  }
}
