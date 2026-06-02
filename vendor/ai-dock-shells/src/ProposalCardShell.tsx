'use client';

/**
 * Shared presentational shell for AI-dock proposal cards. Captures the
 * structure every propose-only card has converged on:
 *
 *   rounded-xl border (tone-driven background)
 *   ├── px-3 py-2 header
 *   │     ├── title (font-medium foreground/90)
 *   │     ├── subhead (foreground/60 leading-snug)
 *   │     ├── optional reason (italic foreground/50)
 *   │     ├── optional <children/> body
 *   │     ├── optional success note (success/90)
 *   │     └── optional error message (destructive)
 *   └── optional footer (border-t flex)
 *         ├── reject button (left, secondary)
 *         └── primary button (right, bouncing-dots when in-flight)
 *
 * The shell is pure presentation — the state machine + business logic
 * stays in the parent card. This keeps the abstraction minimal and lets
 * each card own its own state-name conventions
 * (idle/applying/applied vs idle/sending/sent vs etc.) without forcing a
 * lowest-common-denominator vocabulary on every caller.
 *
 * Tones:
 *   - `idle` (default) → primary gradient — used when the card is still
 *     waiting on user input or has an in-flight action.
 *   - `success`        → success-tinted — applied/sent/minted/revoked
 *     end-state across every action card.
 *   - `rejected`       → muted neutral with opacity — "Not now" branch.
 *   - `warning`        → amber-tinted — used by destructive cards
 *     (ShareTokenRevokeCard, AcknowledgeWarningCard) to flag the
 *     irreversible/important nature of the action.
 *
 * Footer rendering: only renders if `primaryLabel` AND `onPrimary` (or
 * `primaryHref`) are provided. Read-only cards just omit them.
 */

import type { ReactNode } from 'react';
import { cn } from './cn';

export type ProposalCardTone = 'idle' | 'success' | 'rejected' | 'warning';

export interface ProposalCardShellProps {
	title: string;
	subhead?: string | null;
	reason?: string | null;

	/** Visual tone of the card. Defaults to 'idle'. */
	tone?: ProposalCardTone;

	/** Free-form body content (form inputs, info pills, child cards). */
	children?: ReactNode;

	/** Shown in success tone underneath the body. Visible regardless of tone. */
	successNote?: string | null;

	/** Shown in destructive tone underneath the body. Visible regardless of tone. */
	errorMessage?: string | null;

	/**
	 * Footer primary action. Omit (along with `onPrimary` AND `primaryHref`)
	 * for read-only cards — the entire footer disappears.
	 */
	primaryLabel?: string;
	onPrimary?: () => void | Promise<void>;

	/**
	 * Alternative to `onPrimary`: render the primary affordance as an
	 * `<a href={primaryHref}>` link instead of a `<button>`. Used by cards
	 * that propose navigating to another surface (e.g. opening the
	 * integrations settings tab for an API-key entry). Mutually exclusive
	 * with `onPrimary` — pass one or the other, not both.
	 */
	primaryHref?: string;
	/** Optional side effect before following a `primaryHref` link. */
	onPrimaryClick?: () => void | Promise<void>;

	/** Footer reject action. Omitting both still allows showing a single
	 *  primary CTA without a secondary, but most cards pair them. */
	rejectLabel?: string;
	onReject?: () => void;

	/** Visual variant for the primary button. 'destructive' uses
	 *  destructive/10 background for irreversible actions. */
	primaryVariant?: 'primary' | 'destructive';

	/** When true, the primary button shows the 3-dot bouncing indicator
	 *  instead of the label. Used during in-flight async actions. */
	isInFlight?: boolean;

	/** When true, the primary button is disabled (input invalid, etc.). */
	primaryDisabled?: boolean;

	/** When true, hides the footer entirely even if action props are set.
	 *  Used to swap to a different rendering (e.g. minted-token reveal)
	 *  while still showing the success note. */
	hideFooter?: boolean;
}

const TONE_CLASSES: Record<ProposalCardTone, string> = {
	idle: 'border-primary/15 bg-gradient-to-br from-primary/[0.05] via-transparent to-accent/[0.03]',
	success: 'border-success/20 bg-success/5',
	rejected: 'border-foreground/10 bg-foreground/[0.02] opacity-60',
	warning: 'border-amber-500/25 bg-amber-500/[0.05] dark:bg-amber-950/10',
};

function BouncingDots() {
	return (
		<span className='flex gap-0.5 items-center'>
			<span className='w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]' />
			<span className='w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]' />
			<span className='w-1 h-1 rounded-full bg-current animate-bounce' />
		</span>
	);
}

export function ProposalCardShell({
	title,
	subhead,
	reason,
	tone = 'idle',
	children,
	successNote,
	errorMessage,
	primaryLabel,
	onPrimary,
	primaryHref,
	onPrimaryClick,
	rejectLabel,
	onReject,
	primaryVariant = 'primary',
	isInFlight = false,
	primaryDisabled = false,
	hideFooter = false,
}: ProposalCardShellProps) {
	const hasFooter =
		Boolean(primaryLabel && (onPrimary || primaryHref)) && !hideFooter;

	return (
		<div
			className={cn(
				'rounded-lg border text-xs overflow-hidden transition-colors',
				TONE_CLASSES[tone]
			)}
		>
			<div className='px-3 py-2'>
				<p className='font-medium text-foreground/90'>{title}</p>
				{subhead ? (
					<p className='text-foreground/60 mt-0.5 leading-snug'>{subhead}</p>
				) : null}
				{reason ? (
					<p className='text-foreground/50 mt-1 italic'>{reason}</p>
				) : null}
				{children}
				{successNote ? (
					<p className='text-success/90 mt-2'>{successNote}</p>
				) : null}
				{errorMessage ? (
					<p className='text-destructive mt-2'>{errorMessage}</p>
				) : null}
			</div>

			{hasFooter ? (
				<div className='flex items-stretch gap-2 border-t border-foreground/[0.06] p-2'>
					{rejectLabel && onReject ? (
						<button
							type='button'
							onClick={onReject}
							disabled={isInFlight}
							className='w-24 rounded-md px-3 py-2 text-foreground/40 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/70 active:bg-foreground/[0.06] disabled:opacity-50'
						>
							{rejectLabel}
						</button>
					) : null}
					{primaryHref && !onPrimary ? (
						<a
							href={primaryHref}
							onClick={() => {
								void onPrimaryClick?.();
							}}
							className={cn(
								'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 transition-colors',
								primaryVariant === 'destructive'
									? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/85'
									: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85'
							)}
						>
							<span className='font-medium'>{primaryLabel}</span>
						</a>
					) : (
						<button
							type='button'
							onClick={() => void onPrimary?.()}
							disabled={isInFlight || primaryDisabled}
							className={cn(
								'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 transition-colors disabled:opacity-50',
								primaryVariant === 'destructive'
									? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/85'
									: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85'
							)}
						>
							{isInFlight ? (
								<BouncingDots />
							) : (
								<span className='font-medium'>{primaryLabel}</span>
							)}
						</button>
					)}
				</div>
			) : null}
		</div>
	);
}
