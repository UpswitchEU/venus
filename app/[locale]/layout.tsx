/**
 * Locale Layout - Wraps all routes with i18n context
 * Provides translations and locale information to all child routes
 */

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { locales, type Locale } from '../../i18n';

interface LocaleLayoutProps {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}

// Only generate static params for public routes
export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

// Allow dynamic params - this enables dynamic rendering for routes not in generateStaticParams
export const dynamicParams = true;

// Make the layout dynamic to prevent static generation issues with next-intl
export const dynamic = 'force-dynamic';

/**
 * Generate metadata with locale support
 */
export async function generateMetadata({
	params,
}: LocaleLayoutProps): Promise<Metadata> {
	// Safely await params with error handling
	let locale: string;
	try {
		const resolvedParams = await params;
		locale = resolvedParams?.locale || 'en';
	} catch (error) {
		console.error('Failed to resolve locale params in generateMetadata:', error);
		locale = 'en'; // Fallback to default locale
	}
	
	// Validate locale before generating metadata
	if (!locales.includes(locale as Locale)) {
		locale = 'en'; // Fallback to default locale instead of 404
	}
	
	return {
		title: {
			default: 'UpSwitch Valuation Tester',
			template: '%s | UpSwitch Valuation Tester',
		},
	};
}

export default async function LocaleLayout({
	children,
	params,
}: LocaleLayoutProps) {
	// Safely await params with error handling
	let locale: string = 'en'; // Default fallback
	try {
		const resolvedParams = await params;
		locale = resolvedParams?.locale || 'en';
	} catch (error) {
		console.error('[LocaleLayout] Failed to resolve locale params:', error);
		locale = 'en'; // Fallback to default locale
	}
	
	// Validate locale - ensure it's always valid
	// Silently handle invalid locales (can happen with favicon requests, etc.)
	if (!locale || !locales.includes(locale as Locale)) {
		// Don't warn for file extensions or empty strings - these are expected
		if (locale && !locale.includes('.')) {
			console.warn(`[LocaleLayout] Invalid locale: ${locale}, falling back to 'en'`);
		}
		locale = 'en';
	}

	// Get locale from request context (set by middleware) as fallback
	// This ensures next-intl can find the locale even if params resolution fails
	let requestLocale: string | undefined;
	try {
		requestLocale = await getLocale();
	} catch (e) {
		// getLocale() can fail if called outside request context - that's OK
		requestLocale = undefined;
	}
	
	// Use request locale if available, otherwise use resolved locale from params
	// Ensure we always have a valid locale string
	const finalLocale: string = requestLocale || locale || 'en';
	
	// Validate final locale
	const validFinalLocale: Locale = locales.includes(finalLocale as Locale) 
		? (finalLocale as Locale) 
		: 'en';
	
	// Load messages for the current locale with comprehensive error handling
	let messages: Record<string, any> = {};
	try {
		// Try to get messages using request context locale first (most reliable)
		// If that fails, fall back to explicit locale
		try {
			messages = await getMessages();
		} catch (contextError) {
			// If request context doesn't have locale, use explicit locale
			messages = await getMessages({ locale: validFinalLocale });
		}
		
		// Ensure messages is a plain object (not undefined/null)
		if (!messages || typeof messages !== 'object') {
			console.warn(`[LocaleLayout] Invalid messages for locale: ${validFinalLocale}, using empty object`);
			messages = {};
		}
	} catch (error) {
		console.error(`[LocaleLayout] Failed to load messages for locale: ${validFinalLocale}`, error);
		// Fallback to empty messages object - app will still work
		messages = {};
	}

	// Use the validated final locale for the provider
	const validLocale: Locale = validFinalLocale;

	return (
		<NextIntlClientProvider locale={validLocale} messages={messages}>
			{children}
		</NextIntlClientProvider>
	);
}

