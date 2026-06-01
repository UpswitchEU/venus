'use client';

/**
 * Sibling of `ProposalCardShell` for the form-section visual family. Where
 * `ProposalCardShell` renders a single body region + a flush full-width
 * footer, `FormCardShell` renders:
 *
 *   rounded-xl border (tone-driven background)
 *   ├── px-3 py-2 header (title + optional reason + state notes + error)
 *   └── border-t section (px-3 py-2 space-y-1.5)
 *         ├── children — form content (checkboxes, radios, inputs, picker)
 *         ├── optional helper (e.g. capacity hint)
 *         └── per-button footer (flex gap-2 pt-1, rounded-xl buttons)
 *
 * This shell captures the pattern shared by MultiSelectCard, SingleSelectCard,
 * SecureCredentialCard, CsvUploadCard — form cards with distinct design
 * heritage from the flush-footer family.
 *
 * Tones: same vocabulary as `ProposalCardShell` so future unification can
 * treat both shells as variants of a single design-system primitive.
 *
 * Settled-state messages: form cards inline a "rejected" note rather than
 * just dimming via opacity, so a dedicated `rejectedNote` prop avoids cards
 * having to reinvent the placement.
 */

import type { FormEvent, ReactNode } from 'react';
import { cn } from './cn';

export type FormCardTone = 'idle' | 'success' | 'rejected' | 'warning';

export interface FormCardShellProps {
	title: string;
	reason?: string | null;

	/** Visual tone. Defaults to 'idle'. */
	tone?: FormCardTone;

	/**
	 * Form content rendered inside the `border-t` section above the buttons.
	 * Typical content: checkboxes, radios, inputs, file pickers, helper text.
	 */
	children?: ReactNode;

	/** Shown in success tone in the header. */
	successNote?: string | null;

	/** Shown in muted neutral in the header — common for cards that inline
	 *  a "cancelled" message rather than just dimming via tone='rejected'. */
	rejectedNote?: string | null;

	/** Shown in destructive tone in the header. */
	errorMessage?: string | null;

	/** Footer primary action. Omit (along with `onPrimary`) for read-only. */
	primaryLabel?: string;
	onPrimary?: () => void | Promise<void>;

	/** Footer reject action. */
	rejectLabel?: string;
	onReject?: () => void;

	primaryVariant?: 'primary' | 'destructive';
	isInFlight?: boolean;
	primaryDisabled?: boolean;

	/** Hide the entire form-section (both children + footer) — used after
	 *  the card settles into a final state (success/rejected). */
	hideFormSection?: boolean;

	/** When true, wraps the form-section in `<form>` and the primary
	 *  button becomes `type='submit'` so pressing Enter inside any input
	 *  fires `onPrimary`. The shell handles `preventDefault()`. Used by
	 *  cards with text/password inputs (e.g. SecureCredentialCard) where
	 *  the native Enter-to-submit behaviour is expected. */
	formMode?: boolean;

	/** Forwarded to the `<form>` element's `autoComplete` attribute when
	 *  `formMode=true`. Defaults to undefined (browser default).
	 *  SecureCredentialCard passes 'off' for credential security. */
	formAutoComplete?: 'on' | 'off';
}

const TONE_CLASSES: Record<FormCardTone, string> = {
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

export function FormCardShell({
	title,
	reason,
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
	hideFormSection = false,
	formMode = false,
	formAutoComplete,
}: FormCardShellProps) {
	const hasFooter = Boolean(primaryLabel && onPrimary);
	const renderFormSection = !hideFormSection;
	const primaryButtonType: 'submit' | 'button' = formMode ? 'submit' : 'button';
	const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isInFlight || primaryDisabled) return;
		void onPrimary?.();
	};

	return (
		<div
			className={cn(
				'rounded-lg border text-xs overflow-hidden transition-colors',
				TONE_CLASSES[tone]
			)}
		>
			<div className='px-3 py-2'>
				<p className='font-medium text-foreground/90'>{title}</p>
				{reason ? (
					<p className='text-foreground/50 mt-0.5 italic'>{reason}</p>
				) : null}
				{successNote ? (
					<p className='text-success/90 mt-2'>{successNote}</p>
				) : null}
				{rejectedNote ? (
					<p className='text-foreground/50 mt-2'>{rejectedNote}</p>
				) : null}
				{errorMessage ? (
					<p className='text-destructive mt-2'>{errorMessage}</p>
				) : null}
			</div>

			{renderFormSection ? (
				formMode ? (
					<form
						onSubmit={handleFormSubmit}
						autoComplete={formAutoComplete}
						className='border-t border-foreground/[0.06] px-3 py-2 space-y-1.5'
					>
						{children}
						{hasFooter ? (
							<div className='flex items-stretch gap-2 pt-1'>
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
								<button
									type={primaryButtonType}
									onClick={
										primaryButtonType === 'button'
											? () => void onPrimary?.()
											: undefined
									}
									disabled={isInFlight || primaryDisabled}
									className={cn(
										'inline-flex min-h-10 flex-1 items-center justify-center rounded-md px-3 py-2 transition-colors disabled:opacity-50',
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
							</div>
						) : null}
					</form>
				) : (
					<div className='border-t border-foreground/[0.06] px-3 py-2 space-y-1.5'>
						{children}
						{hasFooter ? (
							<div className='flex items-stretch gap-2 pt-1'>
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
								<button
									type='button'
									onClick={() => void onPrimary?.()}
									disabled={isInFlight || primaryDisabled}
									className={cn(
										'inline-flex min-h-10 flex-1 items-center justify-center rounded-md px-3 py-2 transition-colors disabled:opacity-50',
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
							</div>
						) : null}
					</div>
				)
			) : null}
		</div>
	);
}
