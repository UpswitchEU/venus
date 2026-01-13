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
 * Middleware function
 * Runs on every request
 */
export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Skip middleware for static files, api routes, and assets
	if (
		pathname.startsWith('/_next') ||
		pathname.startsWith('/api') ||
		pathname.startsWith('/static') ||
		pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/)
	) {
		return;
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
