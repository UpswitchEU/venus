/**
 * Locale Layout - Wraps all routes with i18n context
 * Provides translations and locale information to all child routes
 */

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
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
	if (!locale || !locales.includes(locale as Locale)) {
		console.warn(`[LocaleLayout] Invalid locale: ${locale}, falling back to 'en'`);
		locale = 'en';
	}

	// Load messages for the current locale with comprehensive error handling
	let messages: Record<string, any> = {};
	try {
		messages = await getMessages({ locale });
		// Ensure messages is a plain object (not undefined/null)
		if (!messages || typeof messages !== 'object') {
			console.warn(`[LocaleLayout] Invalid messages for locale: ${locale}, using empty object`);
			messages = {};
		}
	} catch (error) {
		console.error(`[LocaleLayout] Failed to load messages for locale: ${locale}`, error);
		// Try fallback to English if not already English
		if (locale !== 'en') {
			try {
				messages = await getMessages({ locale: 'en' });
				if (!messages || typeof messages !== 'object') {
					messages = {};
				}
			} catch (fallbackError) {
				console.error('[LocaleLayout] Failed to load fallback English messages', fallbackError);
				messages = {};
			}
		} else {
			messages = {};
		}
	}

	// Ensure locale is valid before passing to NextIntlClientProvider
	const validLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : 'en';

	return (
		<NextIntlClientProvider locale={validLocale} messages={messages}>
			{children}
		</NextIntlClientProvider>
	);
}

