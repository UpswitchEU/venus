'use client';

import type { KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface BusinessTypePrimaryMultiple {
	metric?: string | null;
	label?: string | null;
	median?: number | null;
	p25?: number | null;
	p75?: number | null;
	basis?: string | null;
	lowSampleSuppressed?: boolean | null;
}

export interface BusinessTypeOption {
	id: string;
	title: string;
	description?: string | null;
	icon?: string | null;
	categoryId?: string | null;
	categoryLabel?: string | null;
	keywords?: string[];
	popular?: boolean;
	primaryMultiple?: BusinessTypePrimaryMultiple | null;
	naceCodes?: string[];
}

export interface BusinessTypeCategoryOption {
	id: string;
	label: string;
	icon?: string | null;
}

export interface BusinessTypeMultiSelectCopy {
	searchPlaceholder: string;
	selectPlaceholder: string;
	allCategories: string;
	loading: string;
	empty: string;
	popular: string;
	required: string;
	offline: string;
	selectedLabel: string;
	clearSelection: string;
	multipleUnavailable: string;
	lowSampleSuppressed: string;
}

export interface BusinessTypeMultiSelectProps {
	value?: string | string[] | null;
	options: BusinessTypeOption[];
	categories?: BusinessTypeCategoryOption[];
	onChange: (ids: string[], selectedOptions: BusinessTypeOption[]) => void;
	copy: BusinessTypeMultiSelectCopy;
	placeholder?: string;
	disabled?: boolean;
	showCategories?: boolean;
	showSearch?: boolean;
	showPopular?: boolean;
	showMultiples?: boolean;
	loading?: boolean;
	error?: string | null;
	required?: boolean;
	className?: string;
}

function normalizeIds(value: string | string[] | null | undefined): string[] {
	if (Array.isArray(value)) {
		return value.filter((id) => typeof id === 'string' && id.length > 0);
	}
	return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function formatMultiple(
	multiple: BusinessTypePrimaryMultiple | null | undefined
): string | null {
	if (!multiple || multiple.lowSampleSuppressed) return null;
	if (typeof multiple.median !== 'number' || !Number.isFinite(multiple.median))
		return null;

	const label =
		multiple.label || multiple.metric || multiple.basis || 'Multiple';
	const median = `${multiple.median.toFixed(1)}x`;
	const hasBand =
		typeof multiple.p25 === 'number' &&
		Number.isFinite(multiple.p25) &&
		typeof multiple.p75 === 'number' &&
		Number.isFinite(multiple.p75);
	return hasBand
		? `${label} ${median} (${multiple.p25?.toFixed(1)}-${multiple.p75?.toFixed(1)}x)`
		: `${label} ${median}`;
}

function optionMatches(option: BusinessTypeOption, query: string): boolean {
	if (!query) return true;
	const haystack = [
		option.title,
		option.description,
		option.categoryLabel,
		option.categoryId,
		...(option.keywords ?? []),
		...(option.naceCodes ?? []),
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	return haystack.includes(query.toLowerCase());
}

// ─── Inline icons (no external icon dependency in the shared package) ───

function ChevronIcon({ open }: { open: boolean }) {
	return (
		<svg
			aria-hidden='true'
			viewBox='0 0 20 20'
			fill='none'
			className={`h-5 w-5 shrink-0 text-foreground/50 transition-transform duration-200 ${
				open ? 'rotate-180' : ''
			}`}
		>
			<path
				d='m6 8 4 4 4-4'
				stroke='currentColor'
				strokeWidth='1.6'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	);
}

function SearchIcon() {
	return (
		<svg
			aria-hidden='true'
			viewBox='0 0 20 20'
			fill='none'
			className='h-4 w-4 text-foreground/40'
		>
			<circle cx='9' cy='9' r='6' stroke='currentColor' strokeWidth='1.6' />
			<path
				d='m17 17-3.5-3.5'
				stroke='currentColor'
				strokeWidth='1.6'
				strokeLinecap='round'
			/>
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg aria-hidden='true' viewBox='0 0 16 16' fill='none' className='h-3 w-3'>
			<path
				d='m3.5 8.5 3 3 6-7'
				stroke='currentColor'
				strokeWidth='2'
				strokeLinecap='round'
				strokeLinejoin='round'
			/>
		</svg>
	);
}

export function BusinessTypeMultiSelect({
	value,
	options,
	categories = [],
	onChange,
	copy,
	placeholder,
	disabled = false,
	showCategories = true,
	showSearch = true,
	showPopular = true,
	showMultiples = true,
	loading = false,
	error,
	required = false,
	className = '',
}: BusinessTypeMultiSelectProps) {
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const buttonId = useId();
	const searchId = useId();
	const listboxId = useId();
	const errorId = useId();
	const requiredId = useId();

	const selectedIds = useMemo(() => normalizeIds(value), [value]);
	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedOptions = useMemo(
		() =>
			selectedIds.flatMap(
				(id) => options.find((option) => option.id === id) ?? []
			),
		[options, selectedIds]
	);

	const filteredOptions = useMemo(() => {
		return options.filter((option) => {
			const categoryMatches =
				!selectedCategory || option.categoryId === selectedCategory;
			return categoryMatches && optionMatches(option, searchQuery);
		});
	}, [options, searchQuery, selectedCategory]);

	useEffect(() => {
		if (!showDropdown) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (
				rootRef.current &&
				event.target instanceof Node &&
				!rootRef.current.contains(event.target)
			) {
				setShowDropdown(false);
			}
		};

		document.addEventListener('pointerdown', handlePointerDown);
		return () => document.removeEventListener('pointerdown', handlePointerDown);
	}, [showDropdown]);

	// Focus the in-dropdown search as soon as the field opens (native-select parity).
	useEffect(() => {
		if (showDropdown && showSearch) {
			searchInputRef.current?.focus({ preventScroll: true });
		}
	}, [showDropdown, showSearch]);

	const emitChange = (nextIds: string[]) => {
		const dedupedIds = [...new Set(nextIds)];
		const nextOptions = dedupedIds.flatMap(
			(id) => options.find((option) => option.id === id) ?? []
		);
		onChange(dedupedIds, nextOptions);
	};

	const toggleOption = (option: BusinessTypeOption) => {
		if (disabled) return;
		const nextIds = selectedIdSet.has(option.id)
			? selectedIds.filter((id) => id !== option.id)
			: [...selectedIds, option.id];
		emitChange(nextIds);
	};

	const clearOption = (id: string) => {
		emitChange(selectedIds.filter((selectedId) => selectedId !== id));
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape' && showDropdown) {
			event.preventDefault();
			setShowDropdown(false);
		}
	};

	const describedBy = [
		error ? errorId : null,
		required ? requiredId : null,
	].filter(Boolean);

	const triggerStateClass = disabled
		? 'cursor-not-allowed border-foreground/[0.06] opacity-60'
		: error
			? 'border-destructive'
			: showDropdown
				? 'border-primary ring-2 ring-primary/20'
				: 'border-foreground/10 hover:border-foreground/20';

	return (
		<div
			ref={rootRef}
			className={`business-type-selector ${className}`}
			onKeyDown={handleKeyDown}
		>
			<div className='relative'>
				{/* The field — visually matches the surrounding Aurora form inputs:
				    a subtle foreground tint (never stark white), a hairline border,
				    and a brand focus ring. Clicking opens the searchable list. */}
				<button
					id={buttonId}
					type='button'
					onClick={() => !disabled && setShowDropdown(!showDropdown)}
					disabled={disabled}
					aria-expanded={showDropdown}
					aria-haspopup='listbox'
					aria-describedby={
						describedBy.length > 0 ? describedBy.join(' ') : undefined
					}
					className={`flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-md border bg-foreground/[0.04] px-3.5 py-2.5 text-left shadow-sm transition-colors ${triggerStateClass}`}
				>
					{selectedOptions.length > 0 ? (
						<span className='truncate text-foreground'>
							{selectedOptions.map((option) => option.title).join(', ')}
						</span>
					) : (
						<span className='truncate text-foreground/50'>
							{placeholder ?? copy.selectPlaceholder}
						</span>
					)}
					<ChevronIcon open={showDropdown} />
				</button>

				{showDropdown && (
					<div
						id={listboxId}
						aria-labelledby={buttonId}
						className='absolute z-50 mt-1.5 w-full overflow-hidden rounded-md border border-foreground/10 bg-popover shadow-lg'
					>
						{showSearch && (
							<div className='border-b border-foreground/[0.06] p-2'>
								<div className='relative'>
									<span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2'>
										<SearchIcon />
									</span>
									<input
										id={searchId}
										ref={searchInputRef}
										type='text'
										placeholder={copy.searchPlaceholder}
										value={searchQuery}
										onChange={(event) => {
											setSearchQuery(event.target.value);
											if (event.target.value) setSelectedCategory(null);
										}}
										aria-autocomplete='list'
										aria-controls={listboxId}
										aria-label={copy.searchPlaceholder}
										className='min-h-10 w-full rounded-md border border-foreground/10 bg-foreground/[0.04] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
										disabled={disabled}
									/>
								</div>
							</div>
						)}

						{showCategories && categories.length > 0 && (
							<div className='border-b border-foreground/[0.06] p-2'>
								<div className='-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible'>
									<button
										type='button'
										onClick={() => setSelectedCategory(null)}
										aria-pressed={selectedCategory === null}
										className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
											selectedCategory === null
												? 'bg-primary text-primary-foreground'
												: 'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10'
										}`}
										disabled={disabled}
									>
										{copy.allCategories}
									</button>
									{categories.map((category) => (
										<button
											type='button'
											key={category.id}
											onClick={() => setSelectedCategory(category.id)}
											aria-pressed={selectedCategory === category.id}
											className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
												selectedCategory === category.id
													? 'bg-primary text-primary-foreground'
													: 'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10'
											}`}
											disabled={disabled}
										>
											{category.icon ? `${category.icon} ` : ''}
											{category.label}
										</button>
									))}
								</div>
							</div>
						)}

						<div className='max-h-72 overflow-y-auto py-1'>
							{loading ? (
								<output className='block px-3 py-6 text-center text-sm text-foreground/50'>
									{copy.loading}
								</output>
							) : filteredOptions.length === 0 ? (
								<div className='px-3 py-6 text-center text-sm text-foreground/50'>
									{copy.empty}
								</div>
							) : (
								filteredOptions.map((option) => {
									const selected = selectedIdSet.has(option.id);
									const multipleLabel = formatMultiple(option.primaryMultiple);
									return (
										<button
											type='button'
											key={option.id}
											onClick={() => toggleOption(option)}
											aria-pressed={selected}
											className={`w-full px-3 py-2.5 text-left transition-colors focus:outline-none ${
												selected
													? 'bg-primary/10'
													: 'hover:bg-foreground/[0.04] focus:bg-foreground/[0.04]'
											}`}
										>
											<div className='flex items-start gap-3'>
												<span
													aria-hidden='true'
													className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
														selected
															? 'border-primary bg-primary text-primary-foreground'
															: 'border-foreground/30 bg-transparent text-transparent'
													}`}
												>
													{selected ? <CheckIcon /> : null}
												</span>
												{option.icon && (
													<span className='mt-0.5 shrink-0' aria-hidden='true'>
														{option.icon}
													</span>
												)}
												<span className='min-w-0 flex-1'>
													<span className='flex flex-wrap items-center gap-2'>
														<span className='font-medium text-foreground'>
															{option.title}
														</span>
														{option.categoryLabel && (
															<span className='rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60'>
																{option.categoryLabel}
															</span>
														)}
														{showPopular && option.popular && (
															<span className='rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary'>
																{copy.popular}
															</span>
														)}
													</span>
													{option.description && (
														<span className='mt-0.5 block text-sm text-foreground/50'>
															{option.description}
														</span>
													)}
													{showMultiples && (
														<span className='mt-1 block text-xs font-medium text-foreground/70'>
															{multipleLabel ??
																(option.primaryMultiple?.lowSampleSuppressed
																	? copy.lowSampleSuppressed
																	: copy.multipleUnavailable)}
														</span>
													)}
												</span>
											</div>
										</button>
									);
								})
							)}
						</div>
					</div>
				)}
			</div>

			{/* Selected types render as removable chips below the field, each carrying
			    its own inline multiple so the selection is legible without re-opening. */}
			{selectedOptions.length > 0 && (
				<div
					className='mt-2 flex flex-wrap gap-2'
					aria-label={copy.selectedLabel}
				>
					{selectedOptions.map((option) => {
						const multipleLabel = formatMultiple(option.primaryMultiple);
						return (
							<span
								key={option.id}
								className='inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-sm text-foreground'
							>
								{option.icon && <span aria-hidden='true'>{option.icon}</span>}
								<span className='truncate'>{option.title}</span>
								{showMultiples && multipleLabel && (
									<span className='rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
										{multipleLabel}
									</span>
								)}
								{option.categoryLabel && (
									<span className='rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60'>
										{option.categoryLabel}
									</span>
								)}
								<button
									type='button'
									onClick={() => clearOption(option.id)}
									className='-mr-0.5 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-foreground/50 transition-colors hover:bg-primary/15 hover:text-foreground'
									aria-label={`${copy.clearSelection}: ${option.title}`}
									disabled={disabled}
								>
									<svg
										aria-hidden='true'
										viewBox='0 0 14 14'
										fill='none'
										className='h-3 w-3'
									>
										<path
											d='m3.5 3.5 7 7m0-7-7 7'
											stroke='currentColor'
											strokeWidth='1.6'
											strokeLinecap='round'
										/>
									</svg>
								</button>
							</span>
						);
					})}
				</div>
			)}

			{error && (
				<div id={errorId} className='mt-1 text-sm text-destructive' role='alert'>
					{error}
				</div>
			)}
			{required && (
				<div id={requiredId} className='mt-1 text-sm text-foreground/50'>
					{copy.required}
				</div>
			)}
		</div>
	);
}
