/**
 * Next.js Middleware for Venus
 * Handles i18n routing with locale detection and redirection
 */

import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from './i18n';

/**
 * Create i18n middleware with next-intl
 */
const intlMiddleware = createMiddleware({
	locales,
	defaultLocale,
	localePrefix: 'always', // Always use /en/ or /nl/ prefix
	localeDetection: true, // Auto-detect from Accept-Language header or cookie
});

/**
 * Detect locale from cookie, query param, or Accept-Language header
 */
function detectLocale(request: NextRequest): string {
	const localeParam = request.nextUrl.searchParams.get('locale');
	if (localeParam && locales.includes(localeParam as typeof locales[number])) {
		return localeParam;
	}
	const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
	if (cookieLocale && locales.includes(cookieLocale as typeof locales[number])) {
		return cookieLocale;
	}
	const acceptLang = request.headers.get('accept-language');
	if (acceptLang) {
		// Parse Accept-Language (e.g. "nl-BE,nl;q=0.9,en;q=0.8") and pick first supported
		const preferred = acceptLang.split(',').map((s) => s.split(';')[0].trim().slice(0, 2));
		for (const lang of preferred) {
			if (locales.includes(lang as typeof locales[number])) {
				return lang;
			}
		}
	}
	return defaultLocale;
}

/**
 * Middleware function
 * Runs on every request
 */
export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Skip middleware for static files, api routes, and assets
	// Belt-and-suspenders: explicit manifest.json skip (matcher also excludes paths with dots)
	if (
		pathname.startsWith('/_next') ||
		pathname.startsWith('/api') ||
		pathname.startsWith('/static') ||
		pathname === '/manifest.json' ||
		pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/)
	) {
		return;
	}

	// Priority 0a: /calculate and /calculator without locale (Clarity Aurora parity)
	const calculatorMatch = pathname === '/calculate' || pathname === '/calculator';
	if (calculatorMatch) {
		const locale = detectLocale(request);
		const newUrl = request.nextUrl.clone();
		newUrl.pathname = `/${locale}/reports/new`;
		return NextResponse.redirect(newUrl);
	}

	// Priority 0b: /reports/:id without locale prefix (Mercury embedding)
	// Redirect to /{locale}/reports/:id using detected locale instead of hardcoding /en/
	const reportsMatch = pathname.match(/^\/reports\/([^/]+)$/);
	if (reportsMatch) {
		const reportId = reportsMatch[1];
		const locale = detectLocale(request);
		const newUrl = request.nextUrl.clone();
		newUrl.pathname = `/${locale}/reports/${reportId}`;
		return NextResponse.redirect(newUrl);
	}

	// Priority 1: Check for locale in URL params (from Mercury embedding)
	const localeParam = request.nextUrl.searchParams.get('locale');
	if (localeParam && locales.includes(localeParam as typeof locales[number])) {
		// Set locale cookie to persist across navigation
		const response = intlMiddleware(request);
		if (response instanceof Response) {
			response.cookies.set('NEXT_LOCALE', localeParam, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365, // 1 year
				sameSite: 'lax',
			});
			// Rewrite URL to include locale prefix if not already present
			if (!pathname.startsWith(`/${localeParam}/`)) {
				const newUrl = request.nextUrl.clone();
				newUrl.pathname = `/${localeParam}${pathname}`;
				newUrl.searchParams.delete('locale'); // Remove locale param after using it
				return NextResponse.redirect(newUrl);
			}
		}
	}

	// Let next-intl middleware handle all routing (including locale detection)
	// It will automatically detect locale from Accept-Language header and redirect/rewrite
	const response = intlMiddleware(request);
	
	// CRITICAL: Remove X-Frame-Options header if present (Vercel might set it by default)
	// We rely on CSP frame-ancestors instead for cross-subdomain embedding from upswitch.app
	if (response instanceof Response) {
		// Remove X-Frame-Options to allow cross-subdomain embedding
		response.headers.delete('X-Frame-Options');
		
		// Ensure CSP frame-ancestors is set for cross-subdomain embedding
		// This allows embedding from upswitch.app (parent domain) and all subdomains
		// Merge with existing CSP if present
		const existingCSP = response.headers.get('Content-Security-Policy');
		if (existingCSP && existingCSP.includes('frame-ancestors')) {
			// Already has frame-ancestors, keep it but ensure X-Frame-Options is removed
		} else {
			// Set CSP frame-ancestors
			response.headers.set(
				'Content-Security-Policy',
				"frame-ancestors 'self' https://upswitch.app https://*.upswitch.app"
			);
		}
	}
	
	return response;
}

/**
 * Matcher for middleware
 * Only run middleware on specific paths
 */
export const config = {
	// Match all pathnames except for
	// - api routes
	// - _next (Next.js internals)
	// - static files
	matcher: ['/((?!api|_next|static|.*\\..*|favicon.ico).*)'],
};
