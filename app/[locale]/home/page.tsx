import { redirect } from 'next/navigation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * Home Route - Redirects to locale root
 * Works across all locales (en, nl, etc.)
 */
export default async function HomeRoute({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	// Safely resolve params with error handling
	let locale: string
	try {
		const resolvedParams = await params
		locale = resolvedParams.locale
	} catch (error) {
		console.error('[HomeRoute] Failed to resolve params:', error)
		// Fallback to English
		locale = 'en'
	}
	
	redirect(`/${locale}`)
}
