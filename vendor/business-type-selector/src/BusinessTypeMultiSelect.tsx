'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface BusinessTypePrimaryMultiple {
	metric?: string | null;
	label?: string | null;
	median?: number | null;
	p25?: number | null;
	p75?: number | null;
	basis?: string | null;
	lowSampleSuppressed?: boolean | null;
}

/**
 * The valuation metrics a business type can be priced on. `ev_ebitda` and
 * `ev_revenue` map onto a segment `basis` (EBITDA / Revenue) that the calc
 * understands; `pe` is applied as a bare multiple (no earnings basis), matching
 * the existing seed behaviour.
 */
export type BusinessTypeMultipleMetric = 'ev_ebitda' | 'ev_revenue' | 'pe';

export interface BusinessTypeMultipleBand {
	metric: BusinessTypeMultipleMetric;
	/** Display label, e.g. "EV/EBITDA". */
	label: string;
	median: number;
	p25?: number | null;
	p75?: number | null;
	lowSampleSuppressed?: boolean | null;
}

/**
 * Per-business-type multiple state for "this valuation exercise". `appliedMetric`
 * is the one that drives the calc; `overrides` holds any user-edited values
 * (keyed by metric) so the advisor can tweak a band away from the benchmark.
 */
export interface BusinessTypeMultipleSelection {
	appliedMetric?: BusinessTypeMultipleMetric | null;
	overrides?: Partial<Record<BusinessTypeMultipleMetric, number | null>>;
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
	/**
	 * The full set of valuation multiples available for this business type
	 * (EV/EBITDA, EV/Revenue, P/E). Powers the per-chip multiples editor; when
	 * absent the editor falls back to `primaryMultiple` only.
	 */
	multiples?: BusinessTypeMultipleBand[];
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
	/**
	 * Optional copy for the per-chip multiples editor. Every field falls back to
	 * a sensible English default, so existing consumers need not supply it.
	 */
	multiplesEditor?: {
		/** Section heading inside the expanded chip, e.g. "Multiples for this valuation". */
		title?: string;
		/** Toggle/aria label to expand a chip's multiples, e.g. "Edit multiples". */
		edit?: string;
		/** Badge on the metric currently driving the valuation, e.g. "Applied". */
		applied?: string;
		/** Action to make a metric the applied one, e.g. "Use". */
		apply?: string;
		/** Hint prefix for the benchmark band, e.g. "Benchmark". */
		benchmark?: string;
		/** Badge shown when a value differs from the benchmark, e.g. "Edited". */
		overridden?: string;
		/** Reset-to-benchmark action, e.g. "Reset". */
		reset?: string;
	};
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
	/**
	 * Label rendered INSIDE the trigger (entity-search style). When set, the
	 * resting field shows a leading icon + small stacked label + value, so it
	 * looks identical to sibling fields (country / company search) rather than a
	 * plain box with an external label.
	 */
	label?: string;
	className?: string;
	/**
	 * Enables the per-chip multiples editor: each selected business type can be
	 * expanded to view EV/EBITDA, EV/Revenue and P/E, pick which one drives the
	 * valuation, and override the value for this exercise. Controlled — the
	 * parent owns `multipleSelections` and persists changes.
	 */
	editableMultiples?: boolean;
	/** Per-business-type applied metric + overrides, keyed by option id. */
	multipleSelections?: Record<string, BusinessTypeMultipleSelection>;
	/** Emitted whenever a chip's applied metric or an override value changes. */
	onMultipleSelectionChange?: (
		businessTypeId: string,
		selection: BusinessTypeMultipleSelection
	) => void;
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

const METRIC_FALLBACK_LABEL: Record<BusinessTypeMultipleMetric, string> = {
	ev_ebitda: 'EV/EBITDA',
	ev_revenue: 'EV/Revenue',
	pe: 'P/E',
};

/** "4.5x" or "4.5x · 4.0–5.0x" when a band is present. */
function formatBand(band: BusinessTypeMultipleBand): string {
	const median = `${band.median.toFixed(1)}x`;
	const hasBand =
		typeof band.p25 === 'number' &&
		Number.isFinite(band.p25) &&
		typeof band.p75 === 'number' &&
		Number.isFinite(band.p75);
	return hasBand
		? `${median} · ${band.p25?.toFixed(1)}–${band.p75?.toFixed(1)}x`
		: median;
}

function inferMetricFromPrimary(
	primary: BusinessTypePrimaryMultiple
): BusinessTypeMultipleMetric {
	const token = `${primary.metric ?? ''} ${primary.label ?? ''} ${primary.basis ?? ''}`.toLowerCase();
	if (token.includes('revenue') || token.includes('omzet')) return 'ev_revenue';
	if (token.includes('p/e') || token.includes('pe') || token.includes('earnings ratio'))
		return 'pe';
	return 'ev_ebitda';
}

/**
 * The editable bands for an option: prefer the explicit `multiples` list, else
 * derive a single band from `primaryMultiple`. Suppressed/low-sample and
 * non-finite medians are dropped so the editor never shows a bogus value.
 */
function resolveEditableBands(option: BusinessTypeOption): BusinessTypeMultipleBand[] {
	if (option.multiples && option.multiples.length > 0) {
		return option.multiples.filter(
			(band) =>
				typeof band.median === 'number' &&
				Number.isFinite(band.median) &&
				band.median > 0 &&
				!band.lowSampleSuppressed
		);
	}
	const primary = option.primaryMultiple;
	if (
		primary &&
		typeof primary.median === 'number' &&
		Number.isFinite(primary.median) &&
		primary.median > 0 &&
		!primary.lowSampleSuppressed
	) {
		const metric = inferMetricFromPrimary(primary);
		return [
			{
				metric,
				label: primary.label || METRIC_FALLBACK_LABEL[metric],
				median: primary.median,
				p25: primary.p25,
				p75: primary.p75,
			},
		];
	}
	return [];
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

function BuildingGlyph() {
	return (
		<svg
			aria-hidden='true'
			viewBox='0 0 20 20'
			fill='none'
			className='h-5 w-5 text-foreground/50'
		>
			<rect
				x='3'
				y='2.5'
				width='9'
				height='15'
				rx='1'
				stroke='currentColor'
				strokeWidth='1.5'
			/>
			<path
				d='M12 7h4.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H12'
				stroke='currentColor'
				strokeWidth='1.5'
			/>
			<path
				d='M5.5 5.5h4M5.5 8.5h4M5.5 11.5h4'
				stroke='currentColor'
				strokeWidth='1.3'
				strokeLinecap='round'
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
	label,
	className = '',
	editableMultiples = false,
	multipleSelections,
	onMultipleSelectionChange,
}: BusinessTypeMultiSelectProps) {
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const [expandedChipId, setExpandedChipId] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
	const buttonId = useId();
	const searchId = useId();
	const listboxId = useId();
	const errorId = useId();
	const requiredId = useId();

	const updatePosition = useCallback(() => {
		if (!triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();
		const spaceBelow = window.innerHeight - rect.bottom;
		const estimatedHeight = 380;
		const placeAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
		setDropdownStyle(
			placeAbove
				? {
						position: 'fixed',
						bottom: window.innerHeight - rect.top + 6,
						left: rect.left,
						width: rect.width,
						zIndex: 9999,
				  }
				: {
						position: 'fixed',
						top: rect.bottom + 6,
						left: rect.left,
						width: rect.width,
						zIndex: 9999,
				  }
		);
	}, []);

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
		updatePosition();

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target instanceof Node ? event.target : null;
			if (!target) return;
			if (rootRef.current?.contains(target)) return;
			if (dropdownRef.current?.contains(target)) return;
			setShowDropdown(false);
		};

		window.addEventListener('scroll', updatePosition, true);
		window.addEventListener('resize', updatePosition);
		document.addEventListener('pointerdown', handlePointerDown);
		return () => {
			window.removeEventListener('scroll', updatePosition, true);
			window.removeEventListener('resize', updatePosition);
			document.removeEventListener('pointerdown', handlePointerDown);
		};
	}, [showDropdown, updatePosition]);

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

	// Copy for the per-chip multiples editor, with English fallbacks so existing
	// consumers don't have to supply it.
	const editorCopy = copy.multiplesEditor ?? {};
	const editorTitle = editorCopy.title ?? 'Multiples for this valuation';
	const editorEditLabel = editorCopy.edit ?? 'Edit multiples';
	const editorAppliedLabel = editorCopy.applied ?? 'Applied';
	const editorApplyLabel = editorCopy.apply ?? 'Use';
	const editorBenchmarkLabel = editorCopy.benchmark ?? 'Benchmark';
	const editorOverriddenLabel = editorCopy.overridden ?? 'Edited';
	const editorResetLabel = editorCopy.reset ?? 'Reset';

	const emitSelection = (
		businessTypeId: string,
		selection: BusinessTypeMultipleSelection
	) => onMultipleSelectionChange?.(businessTypeId, selection);

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
					ref={triggerRef}
					id={buttonId}
					type='button'
					onClick={() => !disabled && setShowDropdown(!showDropdown)}
					disabled={disabled}
					aria-expanded={showDropdown}
					aria-haspopup='listbox'
					aria-label={label}
					aria-describedby={
						describedBy.length > 0 ? describedBy.join(' ') : undefined
					}
					className={`flex ${label ? 'h-16' : 'h-14'} w-full items-center gap-3 rounded-xl border bg-foreground/[0.04] px-4 text-left shadow-sm transition-all duration-200 ${triggerStateClass}`}
				>
					{label ? (
						<span className='shrink-0 text-lg leading-none'>
							{selectedOptions.length === 1 && selectedOptions[0].icon ? (
								<span aria-hidden='true'>{selectedOptions[0].icon}</span>
							) : (
								<BuildingGlyph />
							)}
						</span>
					) : null}
					<span className='flex min-w-0 flex-1 flex-col justify-center'>
						{label ? (
							<span className='text-[11px] font-medium leading-tight text-foreground/60'>
								{label}
							</span>
						) : null}
						<span
							className={`truncate ${label ? 'text-sm' : ''} ${
								selectedOptions.length > 0
									? 'text-foreground'
									: 'text-foreground/50'
							}`}
						>
							{selectedOptions.length > 0
								? selectedOptions.map((option) => option.title).join(', ')
								: (placeholder ?? copy.selectPlaceholder)}
						</span>
					</span>
					<ChevronIcon open={showDropdown} />
				</button>
			</div>

			{showDropdown && typeof document !== 'undefined' && createPortal(
				<div
					ref={dropdownRef}
					id={listboxId}
					aria-labelledby={buttonId}
					className='overflow-hidden rounded-xl border border-foreground/10 bg-popover shadow-lg'
					style={dropdownStyle}
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
										className='min-h-10 w-full rounded-lg border border-foreground/10 bg-foreground/[0.04] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
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
													className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
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
				</div>,
				document.body
			)}

{/* Selected types render below the field. When `editableMultiples` is on,
			    each type is a row that expands to a per-valuation multiples editor
			    (EV/EBITDA, EV/Revenue, P/E); otherwise they stay compact chips. */}
			{selectedOptions.length > 0 &&
				(editableMultiples ? (
					<div className='mt-2 space-y-2' aria-label={copy.selectedLabel}>
						{selectedOptions.map((option) => {
							const bands = resolveEditableBands(option);
							const selection = multipleSelections?.[option.id];
							const appliedMetric =
								selection?.appliedMetric ?? bands[0]?.metric ?? null;
							const appliedBand =
								bands.find((band) => band.metric === appliedMetric) ?? bands[0];
							const appliedOverride = appliedMetric
								? selection?.overrides?.[appliedMetric]
								: null;
							const appliedValue =
								appliedOverride != null ? appliedOverride : appliedBand?.median;
							const hasEditor = bands.length > 0;
							const expanded = expandedChipId === option.id && hasEditor;
							return (
								<div
									key={option.id}
									className='overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.06]'
								>
									<div className='flex items-center gap-2 px-3 py-2'>
										{option.icon && (
											<span className='shrink-0 text-base' aria-hidden='true'>
												{option.icon}
											</span>
										)}
										<span className='min-w-0 flex-1'>
											<span className='block truncate text-sm font-medium text-foreground'>
												{option.title}
											</span>
											{showMultiples && appliedBand && appliedValue != null && (
												<span className='mt-0.5 block text-xs text-foreground/60'>
													{appliedBand.label}{' '}
													<span className='font-semibold text-foreground/80'>
														{appliedValue.toFixed(1)}x
													</span>
													{appliedOverride != null &&
														appliedBand.median !== appliedOverride && (
															<span className='ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
																{editorOverriddenLabel}
															</span>
														)}
												</span>
											)}
										</span>
										{hasEditor && (
											<button
												type='button'
												onClick={() =>
													setExpandedChipId(expanded ? null : option.id)
												}
												aria-expanded={expanded}
												aria-label={`${editorEditLabel}: ${option.title}`}
												className='flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
												disabled={disabled}
											>
												<ChevronIcon open={expanded} />
											</button>
										)}
										<button
											type='button'
											onClick={() => clearOption(option.id)}
											className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-primary/15 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
											aria-label={`${copy.clearSelection}: ${option.title}`}
											disabled={disabled}
										>
											<svg
												aria-hidden='true'
												viewBox='0 0 14 14'
												fill='none'
												className='h-3.5 w-3.5'
											>
												<path
													d='m3.5 3.5 7 7m0-7-7 7'
													stroke='currentColor'
													strokeWidth='1.6'
													strokeLinecap='round'
												/>
											</svg>
										</button>
									</div>
									{expanded && (
										<div className='border-t border-primary/15 px-3 py-2.5'>
											<div className='mb-2 text-[11px] font-medium uppercase tracking-wide text-foreground/45'>
												{editorTitle}
											</div>
											<div className='space-y-1.5'>
												{bands.map((band) => {
													const override = selection?.overrides?.[band.metric];
													const value = override != null ? override : band.median;
													const isApplied = band.metric === appliedMetric;
													const isEdited =
														override != null && override !== band.median;
													return (
														<div
															key={band.metric}
															className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
																isApplied
																	? 'border-primary/40 bg-primary/[0.08]'
																	: 'border-foreground/[0.08] bg-foreground/[0.02]'
															}`}
														>
															<div className='min-w-0 flex-1'>
																<div className='flex items-center gap-1.5'>
																	<span className='text-sm font-medium text-foreground'>
																		{band.label}
																	</span>
																	{isApplied && (
																		<span className='rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground'>
																			{editorAppliedLabel}
																		</span>
																	)}
																</div>
																<div className='mt-0.5 text-[11px] text-foreground/45'>
																	{editorBenchmarkLabel} {formatBand(band)}
																</div>
															</div>
															<div className='flex shrink-0 items-center gap-1'>
																<input
																	type='number'
																	inputMode='decimal'
																	step={0.1}
																	min={0}
																	value={Number.isFinite(value) ? value : ''}
																	aria-label={`${band.label} ${option.title}`}
																	onChange={(event) => {
																		const raw = event.target.value;
																		const parsed =
																			raw.trim() === '' ? null : Number(raw);
																		if (parsed != null && !Number.isFinite(parsed))
																			return;
																		emitSelection(option.id, {
																			appliedMetric: appliedMetric ?? band.metric,
																			overrides: {
																				...selection?.overrides,
																				[band.metric]: parsed,
																			},
																		});
																	}}
																	className='h-8 w-16 rounded-lg border border-foreground/15 bg-background px-2 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
																	disabled={disabled}
																/>
																<span className='text-xs text-foreground/40'>x</span>
																{!isApplied && (
																	<button
																		type='button'
																		onClick={() =>
																			emitSelection(option.id, {
																				appliedMetric: band.metric,
																				overrides: selection?.overrides,
																			})
																		}
																		className='h-8 shrink-0 rounded-lg border border-primary/30 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
																		disabled={disabled}
																	>
																		{editorApplyLabel}
																	</button>
																)}
																{isEdited && (
																	<button
																		type='button'
																		onClick={() =>
																			emitSelection(option.id, {
																				appliedMetric: appliedMetric ?? band.metric,
																				overrides: {
																					...selection?.overrides,
																					[band.metric]: null,
																				},
																			})
																		}
																		aria-label={`${editorResetLabel}: ${band.label}`}
																		className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
																		title={editorResetLabel}
																		disabled={disabled}
																	>
																		<svg
																			aria-hidden='true'
																			viewBox='0 0 16 16'
																			fill='none'
																			className='h-3.5 w-3.5'
																		>
																			<path
																				d='M13 8a5 5 0 1 1-1.46-3.54M13 3v2.5h-2.5'
																				stroke='currentColor'
																				strokeWidth='1.5'
																				strokeLinecap='round'
																				strokeLinejoin='round'
																			/>
																		</svg>
																	</button>
																)}
															</div>
														</div>
													);
												})}
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				) : (
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
				))}

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
