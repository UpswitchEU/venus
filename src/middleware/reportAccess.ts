import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { shouldAllowLocalDevelopmentVenusDraftReport } from '@/utils/localDevelopmentDraftReport'

export const VENUS_REPORT_ACCESS_COOKIE = 'upswitch_access_token'
export const VENUS_REPORT_REFRESH_COOKIE = 'upswitch_refresh_token'

export function getReportIdRequiringAuth(pathWithoutLocale: string): string | null {
  const reportMatch = pathWithoutLocale.match(/^\/reports\/([^/]+)$/)
  if (!reportMatch || reportMatch[1] === 'new') return null
  return reportMatch[1]
}

export function hasReportAccessCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get(VENUS_REPORT_ACCESS_COOKIE)?.value ||
      request.cookies.get(VENUS_REPORT_REFRESH_COOKIE)?.value
  )
}

export function shouldAllowLocalDevelopmentDraftReportRequest(
  request: NextRequest,
  reportId: string
): boolean {
  return shouldAllowLocalDevelopmentVenusDraftReport({
    reportId,
    hostname: request.nextUrl.hostname || request.headers.get('host'),
    sourceApp: request.nextUrl.searchParams.get('source'),
    clientId: request.nextUrl.searchParams.get('clientId'),
    clientToken: request.nextUrl.searchParams.get('clientToken'),
  })
}

export function redirectToMercuryLogin(
  request: NextRequest,
  locale: string,
  mercuryBase: string
): NextResponse {
  const loginUrl = new URL(`/${locale}/auth/login`, mercuryBase)
  loginUrl.searchParams.set('returnUrl', request.nextUrl.toString())
  return NextResponse.redirect(loginUrl)
}
