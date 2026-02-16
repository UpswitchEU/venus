'use client';

/**
 * ErrorFallback — Venus Aurora design system error UI
 *
 * Graceful, inline-ready error display for error boundaries.
 * Uses GlassCard, AuroraButton, and subtle motion.
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import {
	GlassCard,
	AuroraButton,
	springGentle,
} from '@/design-system';

export interface ErrorFallbackProps {
	error: Error & { digest?: string };
	reset: () => void;
	homeHref?: string;
	title?: string;
	message?: string;
	variant?: 'fullPage' | 'inline';
	showDetailsInDev?: boolean;
}

export function ErrorFallback({
	error,
	reset,
	homeHref = '/',
	title = 'Something went wrong',
	message = 'We encountered an unexpected error. Please try again or return to the homepage.',
	variant = 'fullPage',
	showDetailsInDev = true,
}: ErrorFallbackProps) {
	useEffect(() => {
		console.error('[ErrorFallback]', {
			message: error.message,
			digest: error.digest,
			stack: error.stack,
		});
	}, [error]);

	const isDev = process.env.NODE_ENV === 'development';
	const showDetails = showDetailsInDev && isDev;

	const content = (
		<GlassCard
			variant="default"
			glow="none"
			hover={false}
			className="max-w-md w-full text-center"
		>
			<div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-destructive/10">
				<AlertCircle className="w-6 h-6 text-destructive/70" aria-hidden />
			</div>

			<h2 className="text-xl font-semibold text-foreground mb-2">
				{title}
			</h2>
			<p className="text-sm text-muted-foreground mb-6">
				{message}
			</p>

			{showDetails && (
				<div className="mb-6 p-4 rounded-lg bg-muted/50 border border-foreground/[0.06] text-left">
					<p className="text-xs font-medium text-foreground/80 mb-1">
						Error Details
					</p>
					<p className="text-xs font-mono text-muted-foreground break-all mb-1">
						{error.message}
					</p>
					{error.digest && (
						<p className="text-xs text-muted-foreground/80">
							Digest: {error.digest}
						</p>
					)}
					{error.stack && (
						<details className="mt-2">
							<summary className="text-xs text-muted-foreground/70 cursor-pointer">
								Stack trace
							</summary>
							<pre className="text-[10px] text-muted-foreground/60 mt-2 overflow-auto max-h-32">
								{error.stack}
							</pre>
						</details>
					)}
				</div>
			)}

			<div className="flex flex-col sm:flex-row gap-3 justify-center">
				<AuroraButton
					onClick={reset}
					variant="primary"
					size="lg"
					className="flex items-center justify-center gap-2"
				>
					<RefreshCw className="w-4 h-4" />
					Try Again
				</AuroraButton>
				<AuroraButton
					onClick={() => {
						window.location.href = homeHref;
					}}
					variant="ghost"
					size="lg"
					className="flex items-center justify-center gap-2"
				>
					<Home className="w-4 h-4" />
					Return to Homepage
				</AuroraButton>
			</div>
		</GlassCard>
	);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={springGentle}
			className={
				variant === 'fullPage'
					? 'min-h-screen flex items-center justify-center bg-background px-4'
					: 'flex items-center justify-center p-4'
			}
		>
			{content}
		</motion.div>
	);
}

export default ErrorFallback;
