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
 * Detect locale from Accept-Language header
 * Prefers Dutch (nl) if detected, otherwise defaults to English (en)
 */
function detectLocaleFromHeader(acceptLanguage: string): string {
	if (!acceptLanguage) {
		return defaultLocale;
	}
	
	// Parse Accept-Language header (e.g., "nl-BE, nl;q=0.9, en;q=0.8")
	const languages = acceptLanguage
		.split(',')
		.map(lang => lang.split(';')[0].trim().toLowerCase());
	
	// Check if any preferred language matches our supported locales
	// Check Dutch first (nl, nl-BE, nl-NL, etc.)
	for (const lang of languages) {
		if (lang.startsWith('nl')) return 'nl';
	}
	
	// Then check English (en, en-US, en-GB, etc.)
	for (const lang of languages) {
		if (lang.startsWith('en')) return 'en';
	}
	
	// Default to English if no match
	return defaultLocale;
}

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
