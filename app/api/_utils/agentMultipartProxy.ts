import { type NextRequest, NextResponse } from 'next/server'
import { AuthUpstreamTimeoutError, getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { hasTitanAccessCookie } from '@/utils/auth/cookieHeader'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import { forwardAgentToolActionHeaders } from './agentActionProxy'

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
    const response = await fetchWithTimeout(
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
      const data = await response.json().catch(() => null)
      return NextResponse.json(data, { status: response.status })
    }

    return new NextResponse(await response.text(), {
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
