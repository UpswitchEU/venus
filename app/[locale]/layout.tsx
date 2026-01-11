/**
 * Locale Layout - Wraps all routes with i18n context
 * Provides translations and locale information to all child routes
 */

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
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
	let locale: string;
	try {
		const resolvedParams = await params;
		locale = resolvedParams?.locale || 'en';
	} catch (error) {
		console.error('Failed to resolve locale params:', error);
		locale = 'en'; // Fallback to default locale
	}
	
	// Validate locale
	if (!locales.includes(locale as Locale)) {
		// Fallback to default locale instead of 404 to prevent Server Component errors
		// This can happen when middleware rewrites don't match exactly
		locale = 'en';
	}

	// Load messages for the current locale with error handling
	let messages;
	try {
		messages = await getMessages({ locale });
	} catch (error) {
		console.error('Failed to load messages for locale:', locale, error);
		// Fallback to empty messages object to prevent crash
		messages = {};
	}

	return (
		<NextIntlClientProvider locale={locale} messages={messages}>
			{children}
		</NextIntlClientProvider>
	);
}

