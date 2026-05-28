'use client';

/**
 * Third shell sibling (alongside `ProposalCardShell` and `FormCardShell`).
 * Captures the buyer-ready visual family used by the M&A / data-room
 * propose-only cards (DDOverrideCard, IMRegenerateCard, BuyerInvitationCard,
 * LawyerHandoffCard, PackagePublishCard).
 *
 * Three-section layout:
 *
 *   rounded-xl border (tone-driven background)
 *   ├── px-3 py-2 header (flex justify-between)
 *   │     ├── left: title + optional subtitle
 *   │     └── right: optional status chip
 *   ├── border-t px-3 py-2 detail section (text-[10px], space-y-1.5)
 *   │     ├── children — labelled fields, summaries, etc.
 *   │     └── inline state notes (success / rejected / error)
 *   └── border-t px-3 py-2 footer (flex gap-2, rounded-xl per-button)
 *         ├── reject button
 *         └── primary button
 *
 * Tones: same vocabulary as `ProposalCardShell` and `FormCardShell` so
 * a future unification can treat all three as design-system variants. Plus
 * a 5th `destructive` tone distinct from `warning` — used for blocked /
 * system-error states like PackagePublishCard's `isBlocked` branch where
 * the gate is fundamentally not openable, not just a user-acknowledgeable
 * risk.
 *
 * Status-chip tones map to the same color palette used across the family
 * (danger = destructive, warning = primary/amber, success = success,
 * neutral = foreground/[0.06]) so DDOverride's red/yellow/green and
 * IMRegenerate's low/medium/high collapse to the same vocabulary.
 *
 * The shell is pure presentation — analytics tracking
 * (`trackBuyerReadyToolCardShown/Confirmed/Dismissed`) stays in the card so
 * each card owns its `analyticsKey` discriminator without the shell
 * needing to know about it.
 */

import type { ReactNode } from 'react';
import { cn } from './cn';

export type BuyerReadyCardTone =
	| 'idle'
	| 'success'
	| 'rejected'
	| 'warning'
	| 'destructive';

export type StatusChipTone = 'danger' | 'warning' | 'success' | 'neutral';

export interface BuyerReadyCardShellProps {
	title: string;
	subtitle?: string | null;

	/** Right-aligned pill in the header — used by cards like DDOverride
	 *  (red/yellow/green) and IMRegenerate (low/medium/high confidence).
	 *  Tone normalisation happens at the card level so the shell only
	 *  knows about the 4 design-system tones. */
	statusChip?: { label: string; tone: StatusChipTone } | null;

	/** Visual tone for the card outer border / background. */
	tone?: BuyerReadyCardTone;

	/** Detail-section content. Typically labelled key/value fields. */
	children?: ReactNode;

	/** State notes shown at the bottom of the detail section. */
	successNote?: string | null;
	rejectedNote?: string | null;
	errorMessage?: string | null;

	/** Footer primary action. Omit for read-only family cards. */
	primaryLabel?: string;
	onPrimary?: () => void | Promise<void>;

	/** Footer reject action. */
	rejectLabel?: string;
	onReject?: () => void;

	primaryVariant?: 'primary' | 'destructive';
	isInFlight?: boolean;
	primaryDisabled?: boolean;

	/** Hide the entire footer (used after card settles). */
	hideFooter?: boolean;

	/**
	 * Optional small italic note rendered as a 4th section between the
	 * detail section and the footer, with its own `border-t`. Currently
	 * used by LawyerHandoffCard for a "Status only — not legal advice"
	 * disclaimer that must stay visible regardless of card state.
	 */
	footerNote?: string | null;

	/**
	 * Optional extra sections rendered between the detail section and the
	 * footer (or footerNote). Each entry gets its own `border-t` wrapper
	 * with the family's `px-3 py-2 text-[10px]` styling. Used by status-panel
	 * cards like PackagePublishCard that surface multiple conditional sub-
	 * sections (missing artefacts chips, not-ready artefact list, etc.).
	 *
	 * Filter out null/undefined entries at the call site — the shell
	 * renders each entry verbatim.
	 */
	additionalSections?: Array<{ key: string; content: ReactNode }>;
}

const TONE_CLASSES: Record<BuyerReadyCardTone, string> = {
	idle: 'border-primary/15 bg-gradient-to-br from-primary/[0.05] via-transparent to-accent/[0.03]',
	success: 'border-success/20 bg-success/5',
	rejected: 'border-foreground/10 bg-foreground/[0.02] opacity-60',
	warning: 'border-amber-500/25 bg-amber-500/[0.05] dark:bg-amber-950/10',
	destructive: 'border-destructive/20 bg-destructive/5',
};

const STATUS_CHIP_CLASSES: Record<StatusChipTone, string> = {
	danger: 'bg-destructive/10 text-destructive',
	warning: 'bg-primary/10 text-primary',
	success: 'bg-success/10 text-success',
	neutral: 'bg-foreground/[0.06] text-foreground/60',
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

export function BuyerReadyCardShell({
	title,
	subtitle,
	statusChip,
	tone = 'idle',
	children,
	successNote,
	rejectedNote,
	errorMessage,
	primaryLabel,
	onPrimary,
	rejectLabel,
	onReject,
	primaryVariant = 'primary',
	isInFlight = false,
	primaryDisabled = false,
	hideFooter = false,
	footerNote,
	additionalSections,
}: BuyerReadyCardShellProps) {
	const hasFooter = Boolean(primaryLabel && onPrimary) && !hideFooter;

	return (
		<div
			className={cn(
				'rounded-xl border text-xs overflow-hidden transition-colors',
				TONE_CLASSES[tone]
			)}
		>
			<div className='px-3 py-2 flex items-start justify-between gap-2'>
				<div className='min-w-0'>
					<p className='font-medium text-foreground/90'>{title}</p>
					{subtitle ? (
						<p className='text-[10px] text-foreground/55'>{subtitle}</p>
					) : null}
				</div>
				{statusChip ? (
					<span
						className={cn(
							'rounded-full px-2 py-0.5 text-[10px] font-medium',
							STATUS_CHIP_CLASSES[statusChip.tone]
						)}
					>
						{statusChip.label}
					</span>
				) : null}
			</div>

			<div className='border-t border-foreground/[0.06] px-3 py-2 space-y-1.5 text-[10px]'>
				{children}
				{successNote ? (
					<p className='text-success/90'>{successNote}</p>
				) : null}
				{rejectedNote ? (
					<p className='text-foreground/55'>{rejectedNote}</p>
				) : null}
				{errorMessage ? (
					<p className='text-destructive'>{errorMessage}</p>
				) : null}
			</div>

			{additionalSections?.map((section) => (
				<div
					key={section.key}
					className='border-t border-foreground/[0.06] px-3 py-2 text-[10px]'
				>
					{section.content}
				</div>
			))}

			{footerNote ? (
				<div className='border-t border-foreground/[0.06] px-3 py-1.5'>
					<p className='text-[10px] text-foreground/50 italic'>{footerNote}</p>
				</div>
			) : null}

			{hasFooter ? (
				<div className='border-t border-foreground/[0.06] px-3 py-2 flex gap-2'>
					{rejectLabel && onReject ? (
						<button
							type='button'
							onClick={onReject}
							disabled={isInFlight}
							className='flex-1 px-3 py-1.5 text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors rounded-xl disabled:opacity-50'
						>
							{rejectLabel}
						</button>
					) : null}
					<button
						type='button'
						onClick={() => void onPrimary?.()}
						disabled={isInFlight || primaryDisabled}
						className={cn(
							'flex-1 px-3 py-1.5 inline-flex items-center justify-center transition-colors rounded-xl disabled:opacity-50 font-medium',
							primaryVariant === 'destructive'
								? 'bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/25'
								: 'bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/25'
						)}
					>
						{isInFlight ? <BouncingDots /> : primaryLabel}
					</button>
				</div>
			) : null}
		</div>
	);
}

/**
 * Small helper used inside the children slot to render a labelled
 * key/value pair in the buyer-ready family's tighter type scale. The
 * detail section's outer text-[10px] sets the cap; this just gives a
 * consistent label-on-top-of-value pattern so cards don't have to
 * hand-roll it.
 */
export function LabeledField({
	label,
	value,
	emphasis = 'default',
}: {
	label: string;
	value: ReactNode;
	emphasis?: 'default' | 'bold';
}) {
	return (
		<div>
			<p className='text-foreground/50'>{label}</p>
			<p
				className={cn(
					'text-foreground/85',
					emphasis === 'bold' && 'font-medium'
				)}
			>
				{value}
			</p>
		</div>
	);
}
