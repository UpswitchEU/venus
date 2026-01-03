/**
 * Next.js Middleware for Venus
 * Handles i18n routing with locale detection and redirection
 */

import createMiddleware from 'next-intl/middleware';
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

	// Handle i18n routing
	return intlMiddleware(request);
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
